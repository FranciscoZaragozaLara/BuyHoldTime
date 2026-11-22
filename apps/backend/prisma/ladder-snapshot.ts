// Foto de las escaleras de compra (T0–T4) y venta (V1–V5) de las dos rutas, para comparar antes/después de un cambio
// en el BHT:  OUT=/ruta/antes.json npx ts-node prisma/ladder-snapshot.ts
import { writeFileSync } from 'fs';
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeSellTranches, computeTranches, loadTrancheSeries, prepareTranches, type BuyEvent, type SellEvent, type TrancheRoute } from '../src/modules/backtesting/tranches';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const out: Record<string, { buys: BuyEvent[]; sells: SellEvent[] }> = {};
  for (const route of ['voo', 'qqq'] as TrancheRoute[]) {
    const P = prepareTranches(series, route);
    const last = series.dates[series.dates.length - 1];
    const buys: BuyEvent[] = [], sells: SellEvent[] = [];
    computeTranches(P, last, 'half', { onFire: (e) => buys.push(e) });
    computeSellTranches(P, last, (e) => sells.push(e));
    out[route] = { buys, sells };
  }
  const bht = Object.fromEntries(series.dates.map((d, k) => [d, series.bht?.[k] ?? null]));
  writeFileSync(process.env.OUT ?? 'ladder-snapshot.json', JSON.stringify({ ladders: out, bht }));
  console.log(Object.entries(out).map(([r, v]) => `${r}: ${v.buys.length} compras, ${v.sells.length} ventas`).join(' · '));
}
main().catch((e) => { console.error(e); process.exit(1); });
