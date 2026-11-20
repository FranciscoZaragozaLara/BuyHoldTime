// Valida la escalera de VENTA del módulo de tranches contra la BD (mismo código que /api/backtesting/bht-tranches):
//   FROM=2021-01-01 TO=2022-12-31 ROUTE=voo npx ts-node prisma/validate-sell-tranches.ts
// Imprime los días en que se dispara una venta o cambia el estado del ciclo.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeSellTranches, loadTrancheSeries, prepareTranches, type TrancheRoute } from '../src/modules/backtesting/tranches';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const P = prepareTranches(series, (process.env.ROUTE ?? 'voo') as TrancheRoute);
  let prev = '';
  for (const d of series.dates.filter((x) => x >= (process.env.FROM ?? '1993-06-01') && x <= (process.env.TO ?? '2026-12-31'))) {
    const r = computeSellTranches(P, d);
    if (!r) continue;
    const sales = r.tranches.filter((t) => t.date).map((t) => `${t.id}@${t.date}`).join(' ');
    const line = `${r.active ? 'ciclo' : 'espera'} ${sales}`;
    if (line !== prev) {
      console.log(`${d} ${r.light.padEnd(6)} px ${r.today.price?.toFixed(2)} BHT ${r.today.bht?.toFixed(1)} | ${sales || '—'} | vendido ${(r.sold * 100).toFixed(0)}% lev ${r.leverage.toFixed(2)}x prom ${r.avgPrice?.toFixed(1) ?? '—'}`);
      prev = line;
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
