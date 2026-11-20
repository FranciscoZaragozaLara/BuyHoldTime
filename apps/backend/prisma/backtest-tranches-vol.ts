// Backtest del umbral de armado del voto de volatilidad (VIX/VIX3M) del módulo de tranches:
//   ARMS=1.00,1.05,h1.05 MINDD=-15 npx ts-node prisma/backtest-tranches-vol.ts   (prefijo h = modo híbrido)
// Por episodio (caída máxima ≤ MINDD): % desplegado y % de la caída capturada con cada umbral, en las rutas VOO y QQQ.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeTranches, loadTrancheSeries, prepareTranches, type EpisodeSummary, type TrancheRoute } from '../src/modules/backtesting/tranches';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const specs = (process.env.ARMS ?? '1.00,1.02,1.05').split(',');
  const arms = specs.map((x) => Number(x.replace('h', '')));
  const minDd = Number(process.env.MINDD ?? -15);
  const last = series.dates[series.dates.length - 1];
  for (const route of ['voo', 'qqq'] as TrancheRoute[]) {
    const P = prepareTranches(series, route);
    const runs = arms.map((a, ai) => { const eps: EpisodeSummary[] = []; computeTranches(P, last, 'half', { volArm: a, volMode: specs[ai].startsWith('h') ? 'hybrid' : 'ratio', onEpisodeEnd: (e) => eps.push(e) }); return eps; });
    const keys = [...new Set(runs.flatMap((r) => r.filter((e) => e.ddMax <= minDd).map((e) => e.start)))].sort();
    console.log(`\n=== Ruta ${route.toUpperCase()} · episodios con caída ≤ ${minDd}% ===`);
    console.log('inicio       fin          caída  | ' + specs.map((x) => `${x}: despl capt  tranches`.padEnd(36)).join('| '));
    const agg = arms.map(() => ({ dep: 0, cap: 0, nCap: 0, n: 0 }));
    for (const k of keys) {
      const row = runs.map((r) => r.find((e) => e.start === k));
      const e0 = row.find(Boolean)!;
      const cells = row.map((e, i) => {
        if (!e) return '—'.padEnd(36);
        agg[i].n++; agg[i].dep += e.deployed; if (e.captured != null) { agg[i].cap += e.captured; agg[i].nCap++; }
        return `${(e.deployed * 100).toFixed(0).padStart(4)}% ${e.captured != null ? e.captured.toFixed(0).padStart(4) + '%' : '    —'}  ${e.fired.join(',') || '—'}`.padEnd(36);
      });
      console.log(`${k}  ${(e0.end ?? 'abierto').padEnd(10)}  ${e0.ddMax.toFixed(1).padStart(6)} | ${cells.join('| ')}`);
    }
    console.log('PROMEDIO                         | ' + agg.map((a) => `${((a.dep / Math.max(1, a.n)) * 100).toFixed(0).padStart(4)}% ${a.nCap ? (a.cap / a.nCap).toFixed(0).padStart(4) + '%' : '    —'}  (${a.n} ep.)`.padEnd(36)).join('| '));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
