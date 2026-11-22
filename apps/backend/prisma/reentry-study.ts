// Estudio de reentrada: simula la posición combinando la escalera de VENTA (V1–V5) y la de COMPRA (T0–T4) por ruta,
// y mide por ciclo cuánto se vendió (y a qué distancia del pico), cuánto se recompró (y a qué distancia del piso) y
// cuánto quedó en efectivo. Compara variantes de la red de seguridad (src/modules/backtesting/reentry.ts).
//   npx ts-node prisma/reentry-study.ts  [VARIANT=net]
// Supuestos: 1× (sin apalancamiento), efectivo sin intereses, sin comisiones. Las compras T0–T4 usan su peso sobre el
// efectivo disponible en el episodio (efectivo al abrir + ventas durante el episodio).
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { loadTrancheSeries, prepareTranches, type TrancheRoute } from '../src/modules/backtesting/tranches';
import { NET_RULE, REENTRY_CFG, bvTarget, dsTarget, r1eTarget, simulateReentry, type ReentryCtx, type ReentryRule } from '../src/modules/backtesting/reentry';

const d45 = (c: ReentryCtx) => (!c.credit && c.bht != null && c.bht < 45 && c.oasFrom63 != null && c.oasFrom63 <= -REENTRY_CFG.ds.ease && c.capeRel != null && c.capeRel <= REENTRY_CFG.capeMax ? 1 : 0);
const VARIANTS: Array<{ key: string; name: string; rule?: ReentryRule }> = [
  { key: 'base', name: 'Escaleras actuales' },
  { key: 'R1e', name: 'R1e · regreso a máximos tras una corrección', rule: (c) => ({ target: r1eTarget(c), rule: 'R1e' }) },
  { key: 'Bv', name: 'Bv · BHT barato con rebote y CAPE ≤ 1.25× mediana', rule: (c) => ({ target: bvTarget(c), rule: 'Bv' }) },
  { key: 'Bv+R1e', name: 'Bv + R1e', rule: (c) => ({ target: Math.max(bvTarget(c), r1eTarget(c)), rule: 'Bv+R1e' }) },
  { key: 'net', name: 'Red vigente: Bv + Ds + R1e', rule: NET_RULE },
  { key: 'D45', name: 'Bv + R1e + D45 (BHT<45 y crédito aliviándose → 100%)', rule: (c) => ({ target: Math.max(bvTarget(c), r1eTarget(c), d45(c)), rule: 'D45' }) },
  { key: 'Ds-only', name: 'Solo Ds', rule: (c) => ({ target: dsTarget(c), rule: 'Ds' }) },
];

function simulate(route: TrancheRoute, s: Awaited<ReturnType<typeof loadTrancheSeries>>, rule?: ReentryRule) {
  const P = prepareTranches(s, route);
  const px = P.px;
  const sim = simulateReentry(P, rule);
  const { k0, cashFrac, buyLog } = sim;
  const kl = s.dates.length - 1, pl = px[kl] as number;
  const raw = sim.cycles;
  let peakV = 0, maxDd = 0, half = 0, days = 0, units = 1 / (px[k0] as number), cash = 0;
  // Valor del portafolio día a día (reconstruido de la fracción en efectivo no hace falta: se usa el resultado final).
  for (let k = k0; k <= kl; k++) { days++; if (cashFrac[k] >= 0.5) half++; }
  void units; void cash;
  // Escenario por ciclo de venta: termina cuando ya se reinvirtió (efectivo < 10%) y el precio recuperó el pico, o al
  // empezar el siguiente ciclo de venta. Piso = mínimo del escenario; pico = máximo del año previo a la venta hasta el piso.
  const cycles = raw.map((c, i) => {
    const nextK = raw[i + 1]?.k ?? kl + 1;
    const lastK = Math.min(kl, nextK - 1);
    // Fin: ya reinvertido (efectivo < 10%) con el precio sobre el máximo previo a las ventas, o el siguiente ciclo.
    let p0 = c.k; for (let j = Math.max(k0, c.k - 252); j <= c.kLast; j++) if ((px[j] as number) > (px[p0] as number)) p0 = j;
    let endK = lastK;
    for (let j = c.kLast + 1; j <= lastK; j++) if ((px[j] as number) >= (px[p0] as number) && cashFrac[j] < 0.1) { endK = j; break; }
    let bi = c.k; for (let j = c.k; j <= endK; j++) if ((px[j] as number) < (px[bi] as number)) bi = j;
    let pi = bi; for (let j = Math.max(k0, c.k - 252); j <= bi; j++) if ((px[j] as number) > (px[pi] as number)) pi = j;
    const peak = px[pi] as number;
    let ri = -1; for (let j = bi; j <= kl; j++) if ((px[j] as number) >= peak) { ri = j; break; }
    const bl = buyLog.filter((b) => b.k > c.k && b.k <= endK);
    const amt = bl.reduce((m, b) => m + b.amt, 0), u = bl.reduce((m, b) => m + b.units, 0);
    // Reingreso completo: primer día después de la venta con efectivo < 10% del portafolio.
    let full = -1; for (let j = c.kLast + 1; j <= lastK; j++) if (cashFrac[j] < 0.1) { full = j; break; }
    return {
      start: s.dates[c.k], sold: c.sold, avgSell: c.soldUnits > 0 ? c.sellCost / c.soldUnits : null, peak, peakDate: s.dates[pi],
      bottom: px[bi] as number, bottomDate: s.dates[bi], recovery: ri >= 0 ? s.dates[ri] : null,
      rebought: c.sellCost > 0 ? Math.min(1, amt / c.sellCost) : 0, avgBuy: u > 0 ? amt / u : null,
      cashAtRecovery: ri >= 0 && ri <= lastK ? cashFrac[ri] : cashFrac[endK], fullReentry: full >= 0 ? s.dates[full] : null, buys: bl.map((b) => b.label),
    };
  });
  // Valor y caída máxima: se reconstruyen con las compras/ventas implícitas en la fracción en efectivo.
  const V = sim.units * pl + sim.cash;
  const vals = valueSeries(P, sim);
  for (const v of vals) { peakV = Math.max(peakV, v); maxDd = Math.min(maxDd, v / peakV - 1); }
  const years = (kl - k0) / 252;
  return { cycles, final: V, hold: pl / (px[k0] as number), cagr: (Math.pow(V, 1 / years) - 1) * 100, holdCagr: (Math.pow(pl / (px[k0] as number), 1 / years) - 1) * 100, maxDd: maxDd * 100, halfCashPct: (half / days) * 100, from: s.dates[k0] };
}

/** Valor diario del portafolio: unidades y efectivo se reconstruyen repitiendo la simulación con su registro. */
function valueSeries(P: ReturnType<typeof prepareTranches>, sim: ReturnType<typeof simulateReentry>): number[] {
  // Con la fracción en efectivo f y el precio p: V_k = V_{k-1} × ((1 − f_{k-1}) × p_k / p_{k-1} + f_{k-1}).
  const out: number[] = []; let V = 1;
  for (let k = sim.k0; k <= sim.kEnd; k++) {
    if (k > sim.k0) { const p0 = P.px[k - 1] as number, p1 = P.px[k] as number; V *= (1 - sim.cashFrac[k - 1]) * (p1 / p0) + sim.cashFrac[k - 1]; }
    out.push(V);
  }
  return out;
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const only = process.env.VARIANT;
  const out: Record<string, unknown> = {};
  for (const route of ['voo', 'qqq'] as TrancheRoute[]) {
    for (const v of VARIANTS.filter((x) => !only || x.key === only)) {
      const r = simulate(route, s, v.rule);
      out[`${route}:${v.key}`] = r;
    }
  }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
