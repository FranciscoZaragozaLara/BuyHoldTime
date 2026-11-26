import 'dotenv/config';
import { Pool } from 'pg';
import { computeThermoDay, PriceMap, THERMO_TICKERS } from '../src/modules/backtesting/thermo-history';
import { trendAt, trendRegimeSeries } from '../src/modules/backtesting/trend-regime';
import { PROVISIONAL_OF, withProvisional } from '../src/modules/backtesting/provisional-series';
import { lastOpenDay } from '../src/modules/backtesting/market-calendar';

// Historifica el Termómetro BuyHoldTime al cierre en bt_thermo_history.
// Idempotente (upsert por fecha): reejecutable a diario tras el sync.
// Uso: npx ts-node prisma/compute-thermo-history.ts [FROM=1993-01-01]
const FROM = process.env.FROM || '1993-01-01';
const TICKERS = THERMO_TICKERS;

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
  // Régimen tendencial (migración 20261119000000_thermo_trend_regime).
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "trend_regime" TEXT`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "spx_sma50" DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "spx_sma200" DOUBLE PRECISION`);

  // Serie CAPE diaria: CAPE registrado de bt_shiller_daily (punto en el tiempo, congelado en vivo).
  const capeQ = await pool.query(`SELECT to_char(date, 'YYYY-MM-DD') AS d, cape, mean3y FROM "bt_shiller_daily" WHERE date >= $1 ORDER BY date`, [FROM]);
  const capeRows = capeQ.rows.map((r: any) => {
    const cape = r.cape == null ? null : Number(r.cape), mean = r.mean3y == null ? null : Number(r.mean3y);
    return { date: r.d as string, cape, ratio: cape && mean ? cape / mean : null };
  });
  if (!capeRows.length) throw new Error('bt_shiller_daily vacía: corre prisma/sync-shiller-daily.ts');

  // BtMarketData a mapas por ticker
  const series: Record<string, PriceMap> = {};
  for (const t of TICKERS) series[t] = new Map();
  const provTickers = TICKERS.map((t) => PROVISIONAL_OF[t]).filter(Boolean);
  for (const t of provTickers) series[t] = new Map();
  const { rows } = await pool.query('SELECT ticker, date::text AS d, close FROM "bt_market_data" WHERE ticker = ANY($1)', [[...TICKERS, ...provTickers]]);
  for (const r of rows) series[r.ticker]?.set(r.d.slice(0, 10), Number(r.close));
  // Series oficiales con retraso (WTI de FRED): los días aún no publicados toman el proxy provisional (CL=F).
  for (const t of TICKERS) if (PROVISIONAL_OF[t]) series[t] = withProvisional(series[t], series[PROVISIONAL_OF[t]]);
  console.log(`tickers cargados: ${TICKERS.map((t) => `${t}=${series[t].size}`).join(' ')}`);
  // Régimen tendencial del S&P 500 con toda su historia (las SMA necesitan 200 sesiones previas a FROM).
  const trend = trendRegimeSeries(series['^GSPC']);
  const trendDates = [...trend.keys()];

  let n = 0;
  const batch: any[] = [];
  const flush = async () => {
    if (!batch.length) return;
    // updated_at explícito: @updatedAt no tiene DEFAULT en BD (migración 20261112000000_sync_schema_drift).
    const N = 14;
    const vals = batch.map((_, i) => `(${Array.from({ length: N }, (_, k) => `$${i * N + k + 1}`).join(', ')}, CURRENT_TIMESTAMP)`).join(',');
    await pool.query(`INSERT INTO bt_thermo_history (date, value, numerator, denominator, coverage, bonus, bonus_label, liq_bonus, liq_bonus_label, oil_bonus, oil_bonus_label, trend_regime, spx_sma50, spx_sma200, updated_at) VALUES ${vals}
      ON CONFLICT (date) DO UPDATE SET value=EXCLUDED.value, numerator=EXCLUDED.numerator,
      denominator=EXCLUDED.denominator, coverage=EXCLUDED.coverage, bonus=EXCLUDED.bonus,
      bonus_label=EXCLUDED.bonus_label, liq_bonus=EXCLUDED.liq_bonus,
      liq_bonus_label=EXCLUDED.liq_bonus_label, oil_bonus=EXCLUDED.oil_bonus,
      oil_bonus_label=EXCLUDED.oil_bonus_label, trend_regime=EXCLUDED.trend_regime,
      spx_sma50=EXCLUDED.spx_sma50, spx_sma200=EXCLUDED.spx_sma200, updated_at=CURRENT_TIMESTAMP`,
      batch.flatMap((b) => [b.date, b.value, b.numerator, b.denominator, b.coverage, b.bonus, b.bonusLabel ?? null, b.liqBonus, b.liqBonusLabel ?? null, b.oilBonus, b.oilBonusLabel ?? null, b.trend?.regime ?? null, b.trend?.sma50 ?? null, b.trend?.sma200 ?? null]));
    n += batch.length; batch.length = 0;
  };
  const samples: Record<string, string> = {};
  // Días sin mercado: el BHT repite el último día hábil, también su CAPE (Shiller publica el E10 nuevo el día 3 aunque
  // sea feriado: se toma desde el siguiente día hábil).
  const capeByDate = new Map(capeRows.map((r) => [r.date, r]));
  for (const row of capeRows) {
    const c = capeByDate.get(lastOpenDay(row.date, series['^GSPC'])) ?? row;
    const r = computeThermoDay(row.date, series, { cape: c.cape, ratio: c.ratio });
    if (!r) continue;
    batch.push({ date: row.date, ...r, trend: trendAt(trend, trendDates, row.date) });
    if (['1993-01-04', '1997-01-02', '2021-02-01'].includes(row.date)) samples[row.date] = `${r.value} num=${r.numerator.toFixed(0)} den=${r.denominator} cov=${r.coverage} bonus=${r.bonus}${r.bonusLabel ? `(${r.bonusLabel})` : ''}`;
    if (batch.length >= 500) await flush();
  }
  await flush();
  const last = await pool.query('SELECT date::text d, value, numerator, denominator, coverage, bonus, bonus_label, trend_regime FROM bt_thermo_history ORDER BY date DESC LIMIT 1');
  console.log(`upsert ${n} días. muestras:`, JSON.stringify(samples), 'último:', JSON.stringify(last.rows[0]));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
