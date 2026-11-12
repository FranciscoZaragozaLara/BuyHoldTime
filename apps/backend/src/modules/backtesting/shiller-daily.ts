// Serie CAPE Shiller diaria (reconstruida) en BD: tabla bt_shiller_daily.
// El CSV que genera BackTesting (data_pipeline_schiller) es solo el formato de
// intercambio para sincronizar; la tabla es la fuente que sirve el endpoint.
// Helpers puros (sin BD) para poder testearlos.

/** Columnas numéricas del CSV, en el mismo nombre que en la tabla (snake_case). */
export const SHILLER_NUMERIC_COLUMNS = [
  'pe', 'cape',
  'cape_sma3', 'cape_sma5', 'cape_sma10',
  'cape_ema3', 'cape_ema5', 'cape_ema10',
  'mean3y', 'mean5y', 'mean10y',
  'mean3y_ema', 'mean5y_ema', 'mean10y_ema',
  'std3y', 'std5y', 'std10y',
] as const;

export type ShillerNumericColumn = (typeof SHILLER_NUMERIC_COLUMNS)[number];
export type ShillerDailyRecord = { date: string } & Record<ShillerNumericColumn, number | null>;

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
  const out: ShillerDailyRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const date = cols[dateIdx]?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const rec: any = { date };
    SHILLER_NUMERIC_COLUMNS.forEach((c, k) => { rec[c] = idx[k] >= 0 ? num(cols[idx[k]]) : null; });
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
 * Una sentencia por lote (500 filas × 18 parámetros, lejos del límite de 65535).
 */
export function buildShillerUpsertBatches(records: ShillerDailyRecord[], batchSize = 500): { text: string; values: (string | number | null)[] }[] {
  const cols = ['date', ...SHILLER_NUMERIC_COLUMNS];
  const width = cols.length;
  const batches: { text: string; values: (string | number | null)[] }[] = [];
  for (let s = 0; s < records.length; s += batchSize) {
    const chunk = records.slice(s, s + batchSize);
    const values: (string | number | null)[] = [];
    const tuples = chunk.map((r, i) => {
      values.push(r.date, ...SHILLER_NUMERIC_COLUMNS.map((c) => r[c]));
      const ph = cols.map((_, k) => `$${i * width + k + 1}${k === 0 ? '::date' : ''}`);
      return `(${ph.join(', ')}, now())`;
    });
    const updates = SHILLER_NUMERIC_COLUMNS.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
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
  capeSma3: number | null; capeSma5: number | null; capeSma10: number | null;
  capeEma3: number | null; capeEma5: number | null; capeEma10: number | null;
  mean3y: number | null; mean5y: number | null; mean10y: number | null;
  mean3yEma: number | null; mean5yEma: number | null; mean10yEma: number | null;
}) {
  const date = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
  // compat: mean = mean3y (V8 usa SMA 3y); ratio = CAPE / mean3y
  const capeRatio = r.cape != null && r.mean3y ? r.cape / r.mean3y : null;
  return {
    date,
    cape: r.cape,
    capeSma3: r.capeSma3, capeSma5: r.capeSma5, capeSma10: r.capeSma10,
    capeEma3: r.capeEma3, capeEma5: r.capeEma5, capeEma10: r.capeEma10,
    mean: r.mean3y,
    mean3y: r.mean3y, mean5y: r.mean5y, mean10y: r.mean10y,
    mean3yEma: r.mean3yEma, mean5yEma: r.mean5yEma, mean10yEma: r.mean10yEma,
    capeRatio,
  };
}

/** Ruta del CSV de intercambio (lo genera BackTesting; el backend lo extiende a diario). */
export const SHILLER_CSV_PATH = process.env.SHILLER_CSV || '/tmp/shiller_daily.csv';

/** Registros → texto CSV con el mismo header que genera build_shiller_daily(). */
export function shillerRecordsToCsv(records: ShillerDailyRecord[]): string {
  const header = ['date', ...SHILLER_NUMERIC_COLUMNS].join(',');
  const lines = records.map((r) => [r.date, ...SHILLER_NUMERIC_COLUMNS.map((c) => (r[c] == null ? '' : String(r[c])))].join(','));
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
  const rows = await db.$queryRawUnsafe<any[]>(`SELECT to_char("date", 'YYYY-MM-DD') AS date, ${cols} FROM "bt_shiller_daily" ORDER BY "date"`);
  if (!rows.length) return 0;
  const records = rows.map((r) => {
    const rec: any = { date: r.date };
    for (const c of SHILLER_NUMERIC_COLUMNS) rec[c] = num(r[c]);
    return rec as ShillerDailyRecord;
  });
  fs.writeFileSync(csvPath, shillerRecordsToCsv(records));
  return records.length;
}
