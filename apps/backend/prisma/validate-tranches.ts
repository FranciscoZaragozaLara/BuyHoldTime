// Valida el Módulo de Reentrada por Tranches contra la BD (mismo código que /api/backtesting/bht-tranches):
//   FROM=2025-02-15 TO=2025-07-01 ROUTE=voo SECTOR=half npx ts-node prisma/validate-tranches.ts
// Imprime los días en que cambia el color del semáforo o se dispara un tranche.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeTranches, loadTrancheSeries, prepareTranches, type SectorRule, type TrancheRoute } from '../src/modules/backtesting/tranches';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  const route = (process.env.ROUTE ?? 'voo') as TrancheRoute;
  const sector = (process.env.SECTOR ?? 'half') as SectorRule;
  const P = prepareTranches(series, route);
  const from = process.env.FROM ?? '2025-02-15', to = process.env.TO ?? '2025-07-01';
  let prev = '';
  for (const d of series.dates.filter((x) => x >= from && x <= to)) {
    const r = computeTranches(P, d, sector);
    if (!r) continue;
    const fired = r.tranches.filter((t) => t.date).map((t) => `${t.id}@${t.date}${t.backup ? '(resp)' : ''}`).join(' ');
    const line = `${r.light} ${fired}`;
    if (line !== prev || r.tranches.some((t) => t.status === 'today')) {
      const e = r.episode;
      console.log(`${d} ${r.light.padEnd(6)} px ${r.today.price?.toFixed(2)} dd ${e ? e.dd.toFixed(1) : '—'} max ${e ? e.ddMax.toFixed(1) : '—'} veto ${r.today.veto ? 'S' : 'n'} ratio ${r.today.ratio?.toFixed(2) ?? '—'} votos ${r.today.votes} | ${fired} | despl ${(r.deployed * 100).toFixed(0)}% lev ${r.leverage.toFixed(2)}x prom ${r.avgPrice?.toFixed(0) ?? '—'} capt ${r.captured?.toFixed(0) ?? '—'}%`);
      prev = line;
    }
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
