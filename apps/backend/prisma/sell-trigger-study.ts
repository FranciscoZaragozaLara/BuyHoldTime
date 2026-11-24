// Estudio: ¿cómo se dispara la venta? La escalera V1–V5 abre ciclo con BHT ≥ 70 y vende con BHT 70/75/80 (+ debilidad),
// V4 bajo la SMA50 y V5 con la tendencia rota. El 28-oct-2026 vendió con BHT 70.1: un margen de 0.1. Aquí se prueba si
// exigir el umbral varios días seguidos o suavizar el BHT hace la venta más robusta, sin tocar las compras.
//   npx ts-node prisma/sell-trigger-study.ts
// Variantes (solo cambian el BHT que lee la escalera de venta, `sellBht`):
//   base · minN = mínimo de los últimos N días (≡ "BHT ≥ umbral N días seguidos") · meanN = promedio de N días.
// Robustez: cada variante se corre con los umbrales movidos −2…+2 puntos (BHT ± d); si el resultado cambia mucho con
// un punto, la regla es frágil. Sistema real (1×): VOO desde 1993-06 y QQQ desde 1999-03.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { loadTrancheSeries, prepareTranches, type TrancheSeries } from '../src/modules/backtesting/tranches';
import { systemSince } from '../src/modules/backtesting/reentry';

type Tf = (b: (number | null)[]) => (number | null)[];
const ffill = (b: (number | null)[]) => { let l: number | null = null; return b.map((v) => (v == null ? l : (l = v))); };
const minN = (n: number): Tf => (b0) => { const b = ffill(b0); return b.map((_, i) => { let m = Infinity; for (let k = Math.max(0, i - n + 1); k <= i; k++) { if (b[k] == null) return null; m = Math.min(m, b[k] as number); } return m; }); };
const meanN = (n: number): Tf => (b0) => { const b = ffill(b0); return b.map((_, i) => { let t = 0, c = 0; for (let k = Math.max(0, i - n + 1); k <= i; k++) if (b[k] != null) { t += b[k] as number; c++; } return c ? t / c : null; }); };
const VARIANTS: Array<{ key: string; name: string; tf: Tf }> = [
  { key: 'base', name: 'Actual (BHT del día)', tf: (b) => b },
  { key: 'min2', name: 'Umbral 2 días seguidos', tf: minN(2) },
  { key: 'min3', name: 'Umbral 3 días seguidos', tf: minN(3) },
  { key: 'min5', name: 'Umbral 5 días seguidos', tf: minN(5) },
  { key: 'mean3', name: 'Promedio de 3 días', tf: meanN(3) },
  { key: 'mean5', name: 'Promedio de 5 días', tf: meanN(5) },
];
const SHIFTS = [-2, -1, 0, 1, 2];
const ROUTES = [['voo', '1993-06-01'], ['qqq', '1999-03-10']] as const;

function run(s: TrancheSeries, sellBht: (number | null)[], route: 'voo' | 'qqq', from: string) {
  const r = systemSince(prepareTranches({ ...s, sellBht }, route), from)!;
  const yrs = (Date.parse(r.today) - Date.parse(r.from)) / (365.25 * 864e5);
  const sells = r.trades.filter((t) => t.kind === 'sell');
  return {
    cagr: ((1 + r.system.pct / 100) ** (1 / yrs) - 1) * 100, dd: r.system.maxDd.pct, sells: sells.length, cash: r.system.cashPct,
    holdCagr: ((1 + r.hold.pct / 100) ** (1 / yrs) - 1) * 100,
    // Ventas por ciclo: primer día de venta de cada racha (separadas > 120 días).
    cycles: sells.reduce<string[]>((m, t, i) => (i === 0 || Date.parse(t.date) - Date.parse(sells[i - 1].date) > 120 * 864e5 ? [...m, t.date] : m), []),
    last: sells.filter((t) => t.date >= '2026').map((t) => `${t.id}@${t.date.slice(5)}`).join(' ') || '—',
  };
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const bht = s.bht ?? [];
  const f = (v: number) => v.toFixed(2);
  for (const [route, from] of ROUTES) {
    console.log(`\n================ ${route.toUpperCase()} desde ${from}`);
    const base0 = run(s, bht, route, from);
    console.log(`Hold: CAGR ${f(base0.holdCagr)}%\n`);
    for (const v of VARIANTS) {
      const tb = v.tf(bht);
      const rs = SHIFTS.map((d) => run(s, tb.map((x) => (x == null ? null : x + d)), route, from));
      const c = rs.map((r) => r.cagr), dd = rs.map((r) => r.dd);
      const at0 = rs[2];
      const mean = c.reduce((m, x) => m + x, 0) / c.length;
      console.log(`${v.name.padEnd(26)} CAGR ${f(at0.cagr)}% · caída ${at0.dd.toFixed(1)}% · ventas ${at0.sells} · efectivo hoy ${at0.cash.toFixed(0)}% · 2026: ${at0.last}`);
      console.log(`${''.padEnd(26)} ±2 pts → CAGR ${c.map(f).join(' / ')} (prom ${f(mean)}, rango ${f(Math.max(...c) - Math.min(...c))}) · caída peor ${Math.min(...dd).toFixed(1)}%`);
      console.log(`${''.padEnd(26)} inicio de ciclos de venta: ${at0.cycles.join(' ')}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
