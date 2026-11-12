// Serie CAPE Shiller diaria en BD: tabla bt_shiller_daily.
// El CSV que genera BackTesting (data_pipeline_schiller) es solo el formato de
// intercambio para sincronizar; la tabla es la fuente que sirve el endpoint.
//   cape          = CAPE registrado: SPX / E10 del último mes publicado ese día (punto en el tiempo).
//   cape_adjusted = CAPE ajustado: SPX / E10 del propio mes; informativo, se revisa.
// Desde SHILLER_LIVE_SINCE los valores registrados de un día cerrado quedan congelados en
// la BD (no los cambia una revisión posterior del archivo de Shiller).
// Helpers puros (sin BD) para poder testearlos.
import * as path from 'path';
import { BACKTEST_DIR } from '../../config/backtest-dir';

/** Columnas numéricas del CSV, en el mismo nombre que en la tabla (snake_case). */
export const SHILLER_NUMERIC_COLUMNS = [
  'pe', 'cape', 'cape_adjusted', 'e10',
  'cape_sma3', 'cape_sma5', 'cape_sma10',
  'cape_ema3', 'cape_ema5', 'cape_ema10',
  'mean3y', 'mean5y', 'mean10y',
  'mean3y_ema', 'mean5y_ema', 'mean10y_ema',
  'std3y', 'std5y', 'std10y',
] as const;

export type ShillerNumericColumn = (typeof SHILLER_NUMERIC_COLUMNS)[number];
export type ShillerDailyRecord = { date: string; e10_month: string | null } & Record<ShillerNumericColumn, number | null>;

/** Primer día cuyo CAPE registrado se guardó en vivo (antes: reconstruido con la regla del día 3). */
export const SHILLER_LIVE_SINCE = '2026-11-12';
/** Columnas que no se congelan: el ajustado se recalcula cuando Shiller publica o revisa. */
export const SHILLER_UNFROZEN = new Set<string>(['cape_adjusted']);

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Parsea líneas del CSV (header incluido). Columnas ausentes → null; filas sin fecha se omiten. */
export function parseShillerCsvLines(lines: string[]): ShillerDailyRecord[] {
  if (!lines.length) return [];
  const header = lines[0].trim().split(',');
  const dateIdx = header.indexOf('date');
  if (dateIdx < 0) throw new Error('CSV Shiller sin columna "date"');
  const idx = SHILLER_NUMERIC_COLUMNS.map((c) => header.indexOf(c));
  const monthIdx = header.indexOf('e10_month');
  const out: ShillerDailyRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const date = cols[dateIdx]?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const rec: any = { date };
    SHILLER_NUMERIC_COLUMNS.forEach((c, k) => { rec[c] = idx[k] >= 0 ? num(cols[idx[k]]) : null; });
    const em = monthIdx >= 0 ? cols[monthIdx]?.slice(0, 10) : '';
    rec.e10_month = em && /^\d{4}-\d{2}-\d{2}$/.test(em) ? em : null;
    out.push(rec as ShillerDailyRecord);
  }
  return out;
}

export function parseShillerCsv(text: string): ShillerDailyRecord[] {
  return parseShillerCsvLines(text.trim().split('\n'));
}

/**
 * INSERT … ON CONFLICT (date) DO UPDATE parametrizado ($1…$n), válido para
 * `pg.Pool.query(text, values)` y `prisma.$executeRawUnsafe(text, ...values)`.
 * Una sentencia por lote (500 filas × 21 parámetros, lejos del límite de 65535).
 *
 * Congelado: si la fila ya existe, es de SHILLER_LIVE_SINCE en adelante y su día ya cerró
 * (date < CURRENT_DATE − 1; el día extra cubre el cierre que llega pasada la medianoche UTC),
 * se conservan sus valores registrados y solo se actualiza el ajustado.
 */
export function buildShillerUpsertBatches(records: ShillerDailyRecord[], batchSize = 500): { text: string; values: (string | number | null)[] }[] {
  const cols = ['date', ...SHILLER_NUMERIC_COLUMNS, 'e10_month'];
  const width = cols.length;
  const frozen = `"bt_shiller_daily"."date" >= DATE '${SHILLER_LIVE_SINCE}' AND "bt_shiller_daily"."date" < CURRENT_DATE - 1`;
  const batches: { text: string; values: (string | number | null)[] }[] = [];
  for (let s = 0; s < records.length; s += batchSize) {
    const chunk = records.slice(s, s + batchSize);
    const values: (string | number | null)[] = [];
    const tuples = chunk.map((r, i) => {
      values.push(r.date, ...SHILLER_NUMERIC_COLUMNS.map((c) => r[c]), r.e10_month ?? null);
      const ph = cols.map((c, k) => `$${i * width + k + 1}${c === 'date' || c === 'e10_month' ? '::date' : ''}`);
      return `(${ph.join(', ')}, now())`;
    });
    const updates = cols.slice(1).map((c) => SHILLER_UNFROZEN.has(c)
      ? `"${c}" = EXCLUDED."${c}"`
      : `"${c}" = CASE WHEN ${frozen} THEN "bt_shiller_daily"."${c}" ELSE EXCLUDED."${c}" END`).join(', ');
    const text =
      `INSERT INTO "bt_shiller_daily" (${cols.map((c) => `"${c}"`).join(', ')}, "updated_at") VALUES ${tuples.join(', ')} ` +
      `ON CONFLICT ("date") DO UPDATE SET ${updates}, "updated_at" = now()`;
    batches.push({ text, values });
  }
  return batches;
}

/** Fila de BD (Prisma, camelCase) → forma pública del endpoint /api/backtesting/shiller-daily. */
export function toShillerApiRow(r: {
  date: Date | string; cape: number | null;
  capeAdjusted?: number | null; e10?: number | null; e10Month?: Date | string | null;
  capeSma3: number | null; capeSma5: number | null; capeSma10: number | null;
  capeEma3: number | null; capeEma5: number | null; capeEma10: number | null;
  mean3y: number | null; mean5y: number | null; mean10y: number | null;
  mean3yEma: number | null; mean5yEma: number | null; mean10yEma: number | null;
}) {
  const date = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
  // compat: mean = mean3y (V8 usa SMA 3y); ratio = CAPE / mean3y
  const capeRatio = r.cape != null && r.mean3y ? r.cape / r.mean3y : null;
  const e10Month = r.e10Month == null ? null : typeof r.e10Month === 'string' ? r.e10Month.slice(0, 10) : r.e10Month.toISOString().slice(0, 10);
  return {
    date,
    cape: r.cape,
    capeAdjusted: r.capeAdjusted ?? null,
    e10: r.e10 ?? null,
    e10Month,
    capeSma3: r.capeSma3, capeSma5: r.capeSma5, capeSma10: r.capeSma10,
    capeEma3: r.capeEma3, capeEma5: r.capeEma5, capeEma10: r.capeEma10,
    mean: r.mean3y,
    mean3y: r.mean3y, mean5y: r.mean5y, mean10y: r.mean10y,
    mean3yEma: r.mean3yEma, mean5yEma: r.mean5yEma, mean10yEma: r.mean10yEma,
    capeRatio,
  };
}

/**
 * Ruta del CSV de intercambio (lo genera BackTesting; el backend lo extiende a diario).
 * Misma regla que BackTesting/shiller_paths.py: SHILLER_CSV, o SHILLER_DATA_DIR/shiller_daily.csv,
 * o <BackTesting>/data/shiller_daily.csv. Ya no /tmp (macOS lo borra al reiniciar).
 */
export const SHILLER_CSV_PATH =
  process.env.SHILLER_CSV ||
  path.join(process.env.SHILLER_DATA_DIR || path.join(BACKTEST_DIR, 'data'), 'shiller_daily.csv');

/** Registros → texto CSV con el mismo header que genera build_shiller_daily(). */
export function shillerRecordsToCsv(records: ShillerDailyRecord[]): string {
  const header = ['date', ...SHILLER_NUMERIC_COLUMNS, 'e10_month'].join(',');
  const lines = records.map((r) => [r.date, ...SHILLER_NUMERIC_COLUMNS.map((c) => (r[c] == null ? '' : String(r[c]))), r.e10_month ?? ''].join(','));
  return [header, ...lines].join('\n') + '\n';
}

type RawExecutor = {
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>;
};

/** Upsert de todo el CSV a bt_shiller_daily. Devuelve filas leídas (0 si no hay CSV). */
export async function syncShillerCsvToDb(db: RawExecutor, csvPath = SHILLER_CSV_PATH): Promise<number> {
  const fs = await import('fs');
  if (!fs.existsSync(csvPath)) return 0;
  const records = parseShillerCsv(fs.readFileSync(csvPath, 'utf8'));
  for (const b of buildShillerUpsertBatches(records)) await db.$executeRawUnsafe(b.text, ...b.values);
  return records.length;
}

/**
 * Si el CSV no existe (p. ej. /tmp se borró al reiniciar) lo reconstruye desde
 * bt_shiller_daily, para que el planchado diario y compute-thermo-history sigan
 * funcionando. Devuelve filas escritas (0 si ya existía o la tabla está vacía).
 */
export async function restoreShillerCsvFromDb(db: RawExecutor, csvPath = SHILLER_CSV_PATH): Promise<number> {
  const fs = await import('fs');
  if (fs.existsSync(csvPath)) return 0;
  const cols = SHILLER_NUMERIC_COLUMNS.map((c) => `"${c}"`).join(', ');
  const rows = await db.$queryRawUnsafe<any[]>(`SELECT to_char("date", 'YYYY-MM-DD') AS date, ${cols}, to_char("e10_month", 'YYYY-MM-DD') AS e10_month FROM "bt_shiller_daily" ORDER BY "date"`);
  if (!rows.length) return 0;
  const records = rows.map((r) => {
    const rec: any = { date: r.date, e10_month: r.e10_month ?? null };
    for (const c of SHILLER_NUMERIC_COLUMNS) rec[c] = num(r[c]);
    return rec as ShillerDailyRecord;
  });
  fs.writeFileSync(csvPath, shillerRecordsToCsv(records));
  return records.length;
}
