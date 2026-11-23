// Estudio del voto A (curva VIX/VIX3M) más rápido: variantes de armado/activación y su efecto en T1/T2 (distancia al
// piso y caída posterior a la compra), en la captura de cada episodio y en el sistema completo (ventas + compras + red).
//   npx ts-node prisma/vol-fast-study.ts
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeTranches, loadTrancheSeries, prepareTranches, type BuyEvent, type EpisodeSummary, type TrancheOpts, type TrancheRoute } from '../src/modules/backtesting/tranches';
import { NET_RULE, simulateReentry } from '../src/modules/backtesting/reentry';

const A_OPTS: Record<string, TrancheOpts> = { A: {}, Apd10: { volArm: 1.10, volPeakDrop: 0.10 }, Ar105: { volArm: 1.10, volRelease: 1.05, volCancel: 1.10 } };
const V_OPTS: Record<string, TrancheOpts> = { veto: {}, rise10: { vetoRise5: 0.10 }, rise20: { vetoRise5: 0.20 }, t1libre: { vetoT1: false } };
const GRID = Object.entries(A_OPTS).flatMap(([a, ao]) => Object.entries(V_OPTS).map(([v, vo]) => ({ key: `${a}+${v}`, name: `${a} · ${v}`, opts: { ...ao, ...vo } })));
const B_GRID = [0.28, 0.25, 0.22, 0.20].map((d) => ({ key: `B${Math.round(d * 100)}`, name: `Voto B: VIX ≥${Math.round(d * 100)}% bajo su máximo de 20 días`, opts: { lvlDrop: d } as TrancheOpts }));
const L_GRID = [...[50, 52, 53, 55].map((b) => ({ key: `L${b}`, name: `Voto B con BHT < ${b}`, opts: { lvlMaxBht: b, lvlMaxBhtCheap: undefined } as TrancheOpts })),
  ...[53, 55, 58].map((b) => ({ key: `L${b}c`, name: `Voto B con BHT < 50, o < ${b} con CAPE ≤ 1.25× su mediana`, opts: { lvlMaxBhtCheap: b, lvlCheapCape: 1.25 } as TrancheOpts }))];
const VARIANTS: Array<{ key: string; name: string; opts: TrancheOpts }> = process.env.LGRID ? L_GRID : process.env.BGRID ? B_GRID : process.env.GRID ? GRID : [
  { key: 'base', name: 'Actual: arma > 1.05, activa < 1.00', opts: {} },
  { key: 'a105r102', name: 'Arma > 1.05, activa < 1.02', opts: { volArm: 1.05, volRelease: 1.02, volCancel: 1.05 } },
  { key: 'a110r105', name: 'Arma > 1.10, activa < 1.05', opts: { volArm: 1.10, volRelease: 1.05, volCancel: 1.10 } },
  { key: 'a120r110', name: 'Arma > 1.20, activa < 1.10', opts: { volArm: 1.20, volRelease: 1.10, volCancel: 1.20 } },
  { key: 'pd08', name: 'Arma > 1.05, activa al caer 8% desde el pico', opts: { volArm: 1.05, volPeakDrop: 0.08 } },
  { key: 'pd10', name: 'Arma > 1.10, activa al caer 10% desde el pico', opts: { volArm: 1.10, volPeakDrop: 0.10 } },
  { key: 'pd15', name: 'Arma > 1.10, activa al caer 15% desde el pico', opts: { volArm: 1.10, volPeakDrop: 0.15 } },
];

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const out: Record<string, unknown> = {};
  for (const route of ['voo', 'qqq'] as TrancheRoute[]) {
    const P = prepareTranches(s, route);
    for (const v of VARIANTS) {
      const buys: BuyEvent[] = [], eps: EpisodeSummary[] = [];
      computeTranches(P, s.dates[s.dates.length - 1], 'half', { ...v.opts, onFire: (e) => buys.push(e), onEpisodeEnd: (e) => eps.push(e) });
      const rows = eps.filter((e) => e.start >= '2007-01-01').map((e) => {
        const b = buys.filter((x) => x.date >= e.start && (!e.end || x.date <= e.end));
        const t = (id: string) => {
          const x = b.find((y) => y.id === id);
          if (!x) return null;
          const k = s.dates.indexOf(x.date), kEnd = e.end ? s.dates.indexOf(e.end) : s.dates.length - 1;
          let mn = Infinity; for (let j = k; j <= kEnd; j++) mn = Math.min(mn, P.px[j] as number);
          return { date: x.date, vsMin: (x.price / e.min - 1) * 100, dropAfter: (mn / x.price - 1) * 100 };
        };
        return { ep: e.start, dd: e.ddMax, T0: t('T0'), T1: t('T1'), T2: t('T2'), captured: e.captured, deployed: e.deployed };
      });
      const sim = simulateReentry(P, NET_RULE, undefined, v.opts);
      // valor diario reconstruido con la fracción en efectivo
      let V = 1, peak = 1, dd = 0;
      for (let k = sim.k0 + 1; k <= sim.kEnd; k++) { V *= (1 - sim.cashFrac[k - 1]) * ((P.px[k] as number) / (P.px[k - 1] as number)) + sim.cashFrac[k - 1]; peak = Math.max(peak, V); dd = Math.min(dd, V / peak - 1); }
      const years = (sim.kEnd - sim.k0) / 252;
      out[`${route}:${v.key}`] = { name: v.name, rows, cagr: (Math.pow(V, 1 / years) - 1) * 100, maxDd: dd * 100 };
    }
  }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
