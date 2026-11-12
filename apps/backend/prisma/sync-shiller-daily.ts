import 'dotenv/config';
import * as fs from 'fs';
import { Pool } from 'pg';
import { buildShillerUpsertBatches, parseShillerCsv, SHILLER_CSV_PATH } from '../src/modules/backtesting/shiller-daily';

// Carga el CAPE Shiller diario del CSV de BackTesting a bt_shiller_daily.
// Idempotente (upsert por fecha). Correr tras regenerar el CSV
// (refresh-shiller-weekly.sh / build_shiller_daily()).
// Uso: npx ts-node prisma/sync-shiller-daily.ts   [SHILLER_CSV=… | SHILLER_DATA_DIR=…]
// Por defecto <BackTesting>/data/shiller_daily.csv (ver SHILLER_CSV_PATH).
const CSV = SHILLER_CSV_PATH;

async function main() {
  if (!fs.existsSync(CSV)) {
    console.error(`No existe ${CSV}. Genera el CSV en BackTesting: build_shiller_daily()`);
    process.exit(1);
  }
  const records = parseShillerCsv(fs.readFileSync(CSV, 'utf8'));
  if (!records.length) {
    console.error(`${CSV} no tiene filas`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const b of buildShillerUpsertBatches(records)) await client.query(b.text, b.values);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      `SELECT count(*)::int n, min(date)::text desde, max(date)::text hasta FROM bt_shiller_daily`,
    );
    console.log(`bt_shiller_daily: ${records.length} filas del CSV (${records[0].date} → ${records[records.length - 1].date}); tabla: ${rows[0].n} filas ${rows[0].desde} → ${rows[0].hasta}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
