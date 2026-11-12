import 'dotenv/config';
import * as fs from 'fs';
import { Pool } from 'pg';
import { computeFwdDay } from '../src/modules/backtesting/bht-forward';
import { computeThermoDay, PriceMap } from '../src/modules/backtesting/thermo-history';
import { SHILLER_CSV_PATH } from '../src/modules/backtesting/shiller-daily';

// Guarda BHT Index + precios y forwards maduros en bt_bht_forward.
// Idempotente (upsert): reejecutable a diario; los horizontes maduran solos.
// Uso: npx ts-node prisma/compute-bht-forward.ts [FROM=1993-01-01]
const FROM = process.env.FROM || '1993-01-01';
const TICKERS = ['^GSPC', '^IXIC', 'TQQQ'];
const ALL_TICKERS = ['^GSPC', 'SPX_EPS', 'SPX_FWD_EPS', 'CPIAUCSL', 'CPILFESL', 'DFEDTARU', 'DGS2', 'DGS30', 'BAMLH0A0HYM2', 'FINRA_DEBIT', 'GDP', 'GDPC1', 'MSACSR', 'VIXCLS', 'FEAR_GREED'];
const CSV = SHILLER_CSV_PATH;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS "bt_bht_forward" (
    "date" DATE NOT NULL, "bht_value" DOUBLE PRECISION,
    "spx" DOUBLE PRECISION, "ndx" DOUBLE PRECISION, "tqqq" DOUBLE PRECISION,
    "spx_1y" DOUBLE PRECISION, "spx_2y" DOUBLE PRECISION, "spx_3y" DOUBLE PRECISION, "spx_5y" DOUBLE PRECISION,
    "ndx_1y" DOUBLE PRECISION, "ndx_2y" DOUBLE PRECISION, "ndx_3y" DOUBLE PRECISION, "ndx_5y" DOUBLE PRECISION,
    "tqqq_1y" DOUBLE PRECISION, "tqqq_2y" DOUBLE PRECISION, "tqqq_3y" DOUBLE PRECISION, "tqqq_5y" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_bht_forward_pkey" PRIMARY KEY ("date"))`);

  await pool.query('ALTER TABLE "bt_bht_forward" ADD COLUMN IF NOT EXISTS "parts" JSONB');
  const maps: Record<string, PriceMap> = { '^GSPC': new Map(), '^IXIC': new Map(), 'TQQQ': new Map() };
  const full: Record<string, PriceMap> = {};
  for (const t of ALL_TICKERS) full[t] = new Map();
  const { rows } = await pool.query('SELECT ticker, date::text AS d, close FROM "bt_market_data" WHERE ticker = ANY($1)', [[...new Set([...TICKERS, ...ALL_TICKERS])]]);
  for (const r of rows) {
    const k = r.d.slice(0, 10);
    if (maps[r.ticker]) maps[r.ticker].set(k, Number(r.close));
    full[r.ticker]?.set(k, Number(r.close));
  }
  // CAPE diaria para el detalle por indicador
  const raw = fs.readFileSync(CSV, 'utf8').trim().split('\n');
  const h = raw[0].split(',');
  const di = h.indexOf('date'), ci = h.indexOf('cape'), mi = h.indexOf('mean3y');
  const capeMap = new Map<string, { cape: number | null; ratio: number | null }>();
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i].split(',');
    const cape = parseFloat(c[ci]), mean = parseFloat(c[mi]);
    capeMap.set(c[di].slice(0, 10), { cape: isNaN(cape) ? null : cape, ratio: cape && mean ? cape / mean : null });
  }
  const maxOf = (m: PriceMap) => { let b = ''; for (const k of m.keys()) if (k > b) b = k; return b; };
  const maxDates = { spx: maxOf(maps['^GSPC']), ndx: maxOf(maps['^IXIC']), tqqq: maxOf(maps['TQQQ']) };
  console.log(`n: spx=${maps['^GSPC'].size} ndx=${maps['^IXIC'].size} tqqq=${maps['TQQQ'].size} max:`, JSON.stringify(maxDates));

  const bht = await pool.query('SELECT date::text AS d, value FROM bt_thermo_history WHERE date >= $1', [FROM]);
  const bhtMap = new Map(bht.rows.map((r: any) => [r.d.slice(0, 10), Number(r.value)]));

  const dates = Array.from(maps['^GSPC'].keys()).filter((d) => d >= FROM).sort();
  const cols = ['date', 'bht_value', 'spx', 'ndx', 'tqqq', 'spx_1y', 'spx_2y', 'spx_3y', 'spx_5y', 'ndx_1y', 'ndx_2y', 'ndx_3y', 'ndx_5y', 'tqqq_1y', 'tqqq_2y', 'tqqq_3y', 'tqqq_5y', 'parts'];
  let n = 0;
  const batch: any[][] = [];
  const flush = async () => {
    if (!batch.length) return;
    // updated_at explícito: @updatedAt no tiene DEFAULT en BD (migración 20261112000000_sync_schema_drift).
    const vals = batch.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',')}, CURRENT_TIMESTAMP)`).join(',');
    const set = cols.slice(1).map((c) => `"${c}"=EXCLUDED."${c}"`).join(',');
    await pool.query(`INSERT INTO bt_bht_forward (${cols.map((c) => `"${c}"`).join(',')}, "updated_at") VALUES ${vals}
      ON CONFLICT (date) DO UPDATE SET ${set}, updated_at=CURRENT_TIMESTAMP`, batch.flat());
    n += batch.length; batch.length = 0;
  };
  for (const d of dates) {
    const r = computeFwdDay(d, { spx: maps['^GSPC'], ndx: maps['^IXIC'], tqqq: maps['TQQQ'] }, maxDates);
    const th = computeThermoDay(d, full, capeMap.get(d) ?? { cape: null, ratio: null });
    batch.push([d, bhtMap.get(d) ?? null, r.spx, r.ndx, r.tqqq, ...r.spxFw, ...r.ndxFw, ...r.tqqqFw, th ? JSON.stringify(th.parts) : null]);
    if (batch.length >= 500) await flush();
  }
  await flush();
  const s = await pool.query(`SELECT date::text d, bht_value, spx_1y, spx_5y, tqqq_5y FROM bt_bht_forward WHERE date IN ('2023-01-03','2021-02-01','2010-02-11') ORDER BY date`);
  console.log(`upsert ${n} días. muestras:`, JSON.stringify(s.rows));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
