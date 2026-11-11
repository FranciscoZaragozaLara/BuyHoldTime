import 'dotenv/config';
import { Pool } from 'pg';

// Respaldo previo al recompute con bandas anuales + foto de picos/suelos.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const t of ['bt_thermo_history', 'bt_bht_forward']) {
    await pool.query(`DROP TABLE IF EXISTS "${t}_pre2027"`);
    await pool.query(`CREATE TABLE "${t}_pre2027" AS TABLE "${t}"`);
  }
  const n = await pool.query(
    `SELECT (SELECT count(*) FROM bt_thermo_history) th, (SELECT count(*) FROM bt_bht_forward) fw`);
  console.log('respaldos listos:', JSON.stringify(n.rows[0]));
  const s = await pool.query(
    `SELECT date::text d, bht_value FROM bt_bht_forward
     WHERE date IN ('2000-03-24','2002-10-09','2007-10-09','2009-03-09','2020-02-19','2020-03-23','2022-01-03','2022-10-12','2026-10-30')
     ORDER BY date`);
  console.log('PRE:', JSON.stringify(s.rows));
  const p = await pool.query(
    `SELECT date::text d, (SELECT jsonb_path_query_first(parts, '$[*] ? (@.key == \"CAPE\")')->'score')::text AS cape_score
     FROM bt_bht_forward WHERE date IN ('2000-03-24','2007-10-09','2020-02-19','2026-10-30') ORDER BY date`);
  console.log('PRE-CAPE:', JSON.stringify(p.rows));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
