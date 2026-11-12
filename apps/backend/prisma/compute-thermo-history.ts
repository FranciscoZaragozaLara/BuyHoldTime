import 'dotenv/config';
import * as fs from 'fs';
import { Pool } from 'pg';
import { computeThermoDay, PriceMap } from '../src/modules/backtesting/thermo-history';
import { SHILLER_CSV_PATH } from '../src/modules/backtesting/shiller-daily';

// Historifica el Termómetro BuyHoldTime al cierre en bt_thermo_history.
// Idempotente (upsert por fecha): reejecutable a diario tras el sync.
// Uso: npx ts-node prisma/compute-thermo-history.ts [FROM=1993-01-01]
const FROM = process.env.FROM || '1993-01-01';
const CSV = SHILLER_CSV_PATH;
const TICKERS = ['^GSPC', 'SPX_EPS', 'SPX_FWD_EPS', 'CPIAUCSL', 'CPILFESL', 'DFEDTARU', 'DGS2', 'DGS30', 'BAMLH0A0HYM2', 'FINRA_DEBIT', 'GDP', 'GDPC1', 'MSACSR', 'VIXCLS', 'FEAR_GREED', 'M2SL', 'BOGMBASE', 'DCOILWTICO'];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS "bt_thermo_history" (
    "date" DATE NOT NULL, "value" DOUBLE PRECISION NOT NULL,
    "numerator" DOUBLE PRECISION NOT NULL, "denominator" DOUBLE PRECISION NOT NULL,
    "coverage" INTEGER NOT NULL, "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus_label" TEXT, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_thermo_history_pkey" PRIMARY KEY ("date"))`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "bonus_label" TEXT`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "liq_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "liq_bonus_label" TEXT`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "oil_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "oil_bonus_label" TEXT`);

  // Serie CAPE diaria
  const raw = fs.readFileSync(CSV, 'utf8').trim().split('\n');
  const h = raw[0].split(',');
  const di = h.indexOf('date'), ci = h.indexOf('cape'), mi = h.indexOf('mean3y');
  const capeRows = raw.slice(1).map((ln) => {
    const c = ln.split(',');
    const cape = parseFloat(c[ci]), mean = parseFloat(c[mi]);
    return { date: c[di].slice(0, 10), cape: isNaN(cape) ? null : cape, ratio: cape && mean ? cape / mean : null };
  }).filter((r) => r.date >= FROM);

  // BtMarketData a mapas por ticker
  const series: Record<string, PriceMap> = {};
  for (const t of TICKERS) series[t] = new Map();
  const { rows } = await pool.query('SELECT ticker, date::text AS d, close FROM "bt_market_data" WHERE ticker = ANY($1)', [TICKERS]);
  for (const r of rows) series[r.ticker]?.set(r.d.slice(0, 10), Number(r.close));
  console.log(`tickers cargados: ${TICKERS.map((t) => `${t}=${series[t].size}`).join(' ')}`);

  let n = 0;
  const batch: any[] = [];
  const flush = async () => {
    if (!batch.length) return;
    // updated_at explícito: @updatedAt no tiene DEFAULT en BD (migración 20261112000000_sync_schema_drift).
    const vals = batch.map((_, i) => `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11}, CURRENT_TIMESTAMP)`).join(',');
    await pool.query(`INSERT INTO bt_thermo_history (date, value, numerator, denominator, coverage, bonus, bonus_label, liq_bonus, liq_bonus_label, oil_bonus, oil_bonus_label, updated_at) VALUES ${vals}
      ON CONFLICT (date) DO UPDATE SET value=EXCLUDED.value, numerator=EXCLUDED.numerator,
      denominator=EXCLUDED.denominator, coverage=EXCLUDED.coverage, bonus=EXCLUDED.bonus,
      bonus_label=EXCLUDED.bonus_label, liq_bonus=EXCLUDED.liq_bonus,
      liq_bonus_label=EXCLUDED.liq_bonus_label, oil_bonus=EXCLUDED.oil_bonus,
      oil_bonus_label=EXCLUDED.oil_bonus_label, updated_at=CURRENT_TIMESTAMP`,
      batch.flatMap((b) => [b.date, b.value, b.numerator, b.denominator, b.coverage, b.bonus, b.bonusLabel ?? null, b.liqBonus, b.liqBonusLabel ?? null, b.oilBonus, b.oilBonusLabel ?? null]));
    n += batch.length; batch.length = 0;
  };
  const samples: Record<string, string> = {};
  for (const row of capeRows) {
    const r = computeThermoDay(row.date, series, { cape: row.cape, ratio: row.ratio });
    if (!r) continue;
    batch.push({ date: row.date, ...r });
    if (['1993-01-04', '1997-01-02', '2021-02-01'].includes(row.date)) samples[row.date] = `${r.value} num=${r.numerator.toFixed(0)} den=${r.denominator} cov=${r.coverage} bonus=${r.bonus}${r.bonusLabel ? `(${r.bonusLabel})` : ''}`;
    if (batch.length >= 500) await flush();
  }
  await flush();
  const last = await pool.query('SELECT date::text d, value, numerator, denominator, coverage, bonus, bonus_label FROM bt_thermo_history ORDER BY date DESC LIMIT 1');
  console.log(`upsert ${n} días. muestras:`, JSON.stringify(samples), 'último:', JSON.stringify(last.rows[0]));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
