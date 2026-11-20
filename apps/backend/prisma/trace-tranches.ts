// Traza diaria del módulo de tranches (ratio, voto de volatilidad, permiso, veto, votos y tranches):
//   FROM=2022-01-01 TO=2022-06-30 ROUTE=qqq ARM=1.05 npx ts-node prisma/trace-tranches.ts
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeTranches, loadTrancheSeries, prepareTranches, type TrancheRoute } from '../src/modules/backtesting/tranches';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const P = prepareTranches(series, (process.env.ROUTE ?? 'qqq') as TrancheRoute);
  const arm = Number(process.env.ARM ?? 1.05);
  for (const d of series.dates.filter((x) => x >= (process.env.FROM ?? '2022-01-01') && x <= (process.env.TO ?? '2022-06-30'))) {
    const r = computeTranches(P, d, 'half', { volArm: arm })!;
    const t = r.today, e = r.episode;
    const fired = r.tranches.filter((x) => x.date).map((x) => x.id).join(',');
    console.log(`${d} ratio ${t.ratio?.toFixed(3) ?? '  —  '} armado ${t.volArmedAt ?? '—'.padEnd(10)} volVoto ${t.volVote ? 'SÍ' : 'no'} | dd ${e ? e.dd.toFixed(1).padStart(6) : '     —'} permiso ${e ? 'SÍ' : 'no'} veto ${t.veto ? 'SÍ' : 'no'} votos ${t.votes} | ${fired || '—'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
