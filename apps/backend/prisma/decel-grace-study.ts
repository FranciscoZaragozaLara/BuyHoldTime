// Estudio (adoptado: TRANCHE_CFG.decelGrace = 10): el voto de desaceleración (curvatura de la EMA50) exigía pendiente negativa; si cruza a positiva antes de que
// T2 junte sus dos votos, T2 (y T3, que depende de T2) se bloquea. Visto en VOO 1990 y 2022. Variantes:
//   base (sin gracia) · A = la curvatura sigue valiendo N sesiones después del cruce (decelGrace) · B = una vez cumplida, vale
//   hasta que cierra el episodio (decelLatch).
//   npx ts-node prisma/decel-grace-study.ts   [GRACE=10]
// Por episodio: compras (tranche@fecha) y precio promedio frente al mínimo del episodio; sistema real 1× (escaleras de
// compra y venta, systemSince): CAGR y caída máxima. VOO desde 1993-06 y QQQ desde 1999-03, como sell-trigger-study.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeTranches, loadTrancheSeries, prepareTranches, type BuyEvent, type EpisodeSummary, type TrancheOpts } from '../src/modules/backtesting/tranches';
import { systemSince } from '../src/modules/backtesting/reentry';

const GRACE = Number(process.env.GRACE ?? 10);
const VARIANTS: Array<{ key: string; name: string; opts: TrancheOpts }> = [
  { key: 'base', name: 'Sin gracia (v1.3)', opts: { decelGrace: undefined } },
  { key: 'A', name: `A: gracia ${GRACE} sesiones`, opts: { decelGrace: GRACE } },
  { key: 'B', name: 'B: se queda prendido', opts: { decelLatch: true } },
];
const ROUTES = [['voo', '1993-06-01'], ['qqq', '1999-03-10']] as const;
const pct = (a: number, b: number) => (a / b - 1) * 100;

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const last = s.dates[s.dates.length - 1];
  for (const [route, from] of ROUTES) {
    const P = prepareTranches(s, route);
    console.log(`\n================ ${route.toUpperCase()} (sistema desde ${from})`);
    const runs = VARIANTS.map((v) => {
      const eps: EpisodeSummary[] = [], buys: BuyEvent[] = [];
      computeTranches(P, last, 'half', { ...v.opts, onEpisodeEnd: (e) => eps.push(e), onFire: (e) => buys.push(e) });
      const sys = systemSince(P, from, undefined, undefined, v.opts)!;
      const yrs = (Date.parse(sys.today) - Date.parse(sys.from)) / (365.25 * 864e5);
      return { v, eps, buys, cagr: ((1 + sys.system.pct / 100) ** (1 / yrs) - 1) * 100, dd: sys.system.maxDd.pct,
        hold: ((1 + sys.hold.pct / 100) ** (1 / yrs) - 1) * 100 };
    });
    // Solo episodios donde alguna variante compra distinto.
    const starts = [...new Set(runs.flatMap((r) => r.eps.map((e) => e.start)))].sort();
    for (const st of starts) {
      const rows = runs.map((r) => {
        const e = r.eps.find((x) => x.start === st);
        const b = r.buys.filter((x) => e && x.date >= e.start && (e.end == null || x.date <= e.end));
        return { r, e, b, sig: b.map((x) => `${x.id}@${x.date}`).join(' ') };
      });
      if (rows.every((x) => x.sig === rows[0].sig)) continue;
      const e0 = rows.find((x) => x.e)!.e!;
      console.log(`\nEpisodio ${st} → ${e0.end ?? 'abierto'} · caída ${e0.ddMax.toFixed(1)}% · mínimo ${e0.min.toFixed(2)}`);
      for (const x of rows) {
        if (!x.e) { console.log(`  ${x.r.v.name.padEnd(24)} —`); continue; }
        const each = x.b.map((b) => `${b.id} ${b.date} ${b.price.toFixed(2)} (${pct(b.price, x.e!.min) >= 0 ? '+' : ''}${pct(b.price, x.e!.min).toFixed(1)}%)`).join(' · ');
        console.log(`  ${x.r.v.name.padEnd(24)} desplegado ${(x.e.deployed * 100).toFixed(0).padStart(3)}% · prom ${x.e.avgPrice != null ? `${x.e.avgPrice.toFixed(2)} (+${pct(x.e.avgPrice, x.e.min).toFixed(1)}% vs mín)` : '—'} · capturado ${x.e.captured?.toFixed(0) ?? '—'}%`);
        console.log(`  ${''.padEnd(24)} ${each}`);
      }
    }
    console.log(`\nSistema 1× (hold ${runs[0].hold.toFixed(2)}%):`);
    for (const r of runs) console.log(`  ${r.v.name.padEnd(24)} CAGR ${r.cagr.toFixed(2)}% (${r.cagr - runs[0].cagr >= 0 ? '+' : ''}${(r.cagr - runs[0].cagr).toFixed(2)}) · caída máx ${r.dd.toFixed(1)}%`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
