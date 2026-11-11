import 'dotenv/config';
import { Pool } from 'pg';
import { getHyBonus, getHySigma24, PriceMap } from '../src/modules/backtesting/thermo-history';

// Sonda: bonus HY mes a mes en 2008 (lógica real del backend + bonus guardado).
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT date::text AS d, close FROM "bt_market_data" WHERE ticker='BAMLH0A0HYM2' AND date < '2010-01-15' ORDER BY date`);
  const map: PriceMap = new Map(rows.map((r: any) => [r.d.slice(0, 10), Number(r.close)]));
  const fed = await pool.query(
    `SELECT date::text AS d, close FROM "bt_market_data" WHERE ticker='DFEDTARU' AND date < '2010-01-15' ORDER BY date`);
  const fedMap: PriceMap = new Map(fed.rows.map((r: any) => [r.d.slice(0, 10), Number(r.close)]));
  const stored = await pool.query(
    `SELECT date::text AS d, bonus, bonus_label AS "bonusLabel" FROM "bt_thermo_history" WHERE date BETWEEN '2007-01-01' AND '2009-12-31' ORDER BY date`);
  const sm = new Map(stored.rows.map((r: any) => [r.d.slice(0, 10), r]));
  console.log('fecha      HY     d1     z      sigma  armed  fed    calc  guardado');
  for (let y = 2007; y <= 2009; y++) for (let mo = 1; mo <= 12; mo++) {
    const last = new Date(y, mo, 0).getDate();
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const b = getHyBonus(map, iso, fedMap);
    const s = getHySigma24(map, iso);
    // guardado más cercano <= fecha
    let g: any = null;
    for (const [d, v] of sm) if (d <= iso) g = v;
    const f = (x: number | null) => x == null ? '   --' : (x >= 0 ? '+' : '') + x.toFixed(2);
    console.log(`${iso}  ${(b.hy ?? NaN).toFixed(2)}  ${f(b.d1)}  ${f(b.z)}  ${(s ?? NaN).toFixed(2)}  ${String(b.armed).padEnd(5)} ${(b.fed ?? NaN).toFixed(2)}  ${String(b.bonus).padEnd(4)} ${g ? `${g.bonus} (${g.bonusLabel})` : 's/d'}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
