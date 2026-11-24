// Estudio: ¿bajar el peso de RATIO (CAPE ÷ su media de 3 años) mientras la tendencia del S&P 500 es alcista reduce las
// alarmas tempranas del BHT (1995–97) sin empeorar los avisos antes de los picos de 2000, 2007 y 2021/22?
//   npx ts-node prisma/ratio-weight-study.ts
// BHT de cada variante = Σ(puntaje × peso) ÷ Σ pesos + ajustes (crédito, liquidez, petróleo), con los puntajes guardados
// en bt_bht_forward.parts y los ajustes y el régimen de bt_thermo_history (la base reproduce el BHT guardado). Luego se
// corre el sistema real (venta V1–V5, compra T0–T4 y red) con cada BHT. Solo lectura: no cambia el modelo.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { loadTrancheSeries, prepareTranches } from '../src/modules/backtesting/tranches';
import { systemSince } from '../src/modules/backtesting/reentry';

type Part = { key: string; score: number; weight: number };
type Day = { date: string; parts: Part[]; adj: number; trend: string | null; bht: number; spx1y: number | null; spx3y: number | null };
type Variant = { key: string; name: string; ratioUp: number };

const VARIANTS: Variant[] = [
  { key: 'base', name: 'Actual (RATIO 15 siempre)', ratioUp: 15 },
  { key: 'r10', name: 'RATIO 10 con tendencia alcista', ratioUp: 10 },
  { key: 'r5', name: 'RATIO 5 con tendencia alcista', ratioUp: 5 },
  { key: 'r0', name: 'RATIO 0 con tendencia alcista', ratioUp: 0 },
];
const UP = new Set(['UPTREND', 'PULLBACK']);
const BANDS = [0, 40, 50, 56, 62, 70, 75];
const PEAKS = [['2000', '2000-03-24'], ['2007', '2007-10-09'], ['2022', '2022-01-03']];

const bhtOf = (d: Day, v: Variant) => {
  let num = 0, den = 0;
  for (const p of d.parts) {
    const w = p.key === 'RATIO' && d.trend && UP.has(d.trend) ? v.ratioUp : p.weight;
    num += p.score * w; den += w;
  }
  return Math.max(0, Math.min(100, (den ? num / den : 0) + d.adj));
};
const mean = (a: number[]) => (a.length ? a.reduce((m, x) => m + x, 0) / a.length : NaN);
const band = (v: number) => { let k = 0; while (k + 1 < BANDS.length && v >= BANDS[k + 1]) k++; return k; };
// Correlación de rangos (Spearman) entre banda y retorno promedio: −1 = perfectamente escalonado (más BHT, menos retorno).
const spearman = (ys: number[]) => {
  const xs = ys.map((_, i) => i).filter((i) => !Number.isNaN(ys[i]));
  const rank = (a: number[]) => { const s = [...a].map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(a.length); s.forEach(([, i], k) => (r[i] = k)); return r; };
  const v = xs.map((i) => ys[i]), rx = rank(xs), ry = rank(v), n = xs.length;
  return 1 - (6 * rx.reduce((m, r, i) => m + (r - ry[i]) ** 2, 0)) / (n * (n * n - 1));
};

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const q = await pool.query(`SELECT f.date::text d, f.parts, f.bht_value, f.spx_1y, f.spx_3y, t.bonus, t.liq_bonus, t.oil_bonus, t.trend_regime
    FROM bt_bht_forward f JOIN bt_thermo_history t ON t.date = f.date WHERE f.parts IS NOT NULL ORDER BY f.date`);
  const days: Day[] = q.rows.map((r) => ({
    date: r.d, parts: r.parts as Part[], adj: Number(r.bonus) + Number(r.liq_bonus) + Number(r.oil_bonus), trend: r.trend_regime,
    bht: Number(r.bht_value), spx1y: r.spx_1y == null ? null : Number(r.spx_1y), spx3y: r.spx_3y == null ? null : Number(r.spx_3y),
  }));
  const series = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();

  const base = VARIANTS[0];
  const maxErr = Math.max(...days.map((d) => Math.abs(bhtOf(d, base) - d.bht)));
  console.log(`Días: ${days.length} (${days[0].date} → ${days[days.length - 1].date}) · error de reproducción de la base: ${maxErr.toFixed(2)}\n`);

  for (const v of VARIANTS) {
    const vb = new Map(days.map((d) => [d.date, bhtOf(d, v)]));
    console.log(`=== ${v.name}`);
    // 1) Retorno a 1 y 3 años por banda (toda la historia y sin 1994–99) y qué tan escalonado es.
    for (const [label, keep] of [['todo', () => true], ['sin 1994–99', (d: string) => d < '1994' || d > '1999-12-31']] as const) {
      const r1: number[][] = BANDS.map(() => []), r3: number[][] = BANDS.map(() => []);
      for (const d of days) {
        if (d.spx1y == null || !keep(d.date)) continue;
        const k = band(vb.get(d.date)!);
        r1[k].push(d.spx1y); if (d.spx3y != null) r3[k].push(d.spx3y);
      }
      const a1 = r1.map(mean), a3 = r3.map(mean);
      console.log(`  1A ${label.padEnd(11)} ` + BANDS.map((lo, k) => `${lo}+:${Number.isNaN(a1[k]) ? '—' : a1[k].toFixed(1)}(${r1[k].length})`).join(' ') + `  ρ=${spearman(a1).toFixed(2)}`);
      console.log(`  3A ${label.padEnd(11)} ` + BANDS.map((lo, k) => `${lo}+:${Number.isNaN(a3[k]) ? '—' : a3[k].toFixed(1)}`).join(' ') + `  ρ=${spearman(a3).toFixed(2)}`);
    }
    // 2) Días con BHT ≥ 70 (zona de venta) por periodo: falsas alarmas tempranas vs avisos útiles.
    const per = [['1995–97', '1995', '1997-12-31'], ['1998–2000', '1998', '2000-12-31'], ['2007', '2007', '2007-12-31'], ['2017–18', '2017', '2018-12-31'], ['2021–22', '2021', '2022-12-31']];
    console.log('  días BHT≥70: ' + per.map(([n, a, b]) => `${n} ${days.filter((d) => d.date >= a && d.date <= b && vb.get(d.date)! >= 70).length}`).join(' · '));
    // 3) BHT máximo en los 12 meses previos a cada pico del S&P 500.
    console.log('  BHT máx 12m antes del pico: ' + PEAKS.map(([n, p]) => {
      const from = `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;
      return `${n} ${Math.max(...days.filter((d) => d.date > from && d.date <= p).map((d) => vb.get(d.date)!)).toFixed(1)}`;
    }).join(' · '));
    // 4) Sistema real con este BHT (1×): VOO desde 1993-06 y QQQ desde 1999-03.
    const s2 = { ...series, bht: series.dates.map((d) => vb.get(d) ?? null) };
    for (const [route, from] of [['voo', '1993-06-01'], ['qqq', '1999-03-10']] as const) {
      const r = systemSince(prepareTranches(s2, route), from);
      if (!r) continue;
      const yrs = (Date.parse(r.today) - Date.parse(r.from)) / (365.25 * 864e5);
      const cagr = (x: number) => ((1 + x / 100) ** (1 / yrs) - 1) * 100;
      const sells = r.trades.filter((t) => t.kind === 'sell');
      const early = sells.filter((t) => t.date >= '1995' && t.date <= '1997-12-31').length;
      console.log(`  sistema ${route.toUpperCase()}: CAGR ${cagr(r.system.pct).toFixed(2)}% (hold ${cagr(r.hold.pct).toFixed(2)}%) · caída máx ${r.system.maxDd.pct.toFixed(1)}% (hold ${r.hold.maxDd.pct.toFixed(1)}%) · ventas ${sells.length} (1995–97: ${early}) · efectivo hoy ${r.system.cashPct.toFixed(0)}%`);
    }
    console.log('');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
