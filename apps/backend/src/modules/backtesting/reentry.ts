// Red de seguridad de reentrada (estudio nov-2026, prisma/reentry-study.ts). Simula la posición con la escalera de
// VENTA (V1–V5) y la de COMPRA (T0–T4) y, sobre el efectivo que dejó la venta y que T0–T4 no recompraron, agrega tres
// reglas para no quedarse fuera del mercado cuando ya está barato:
//  · Bv · barato con rebote: BHT < 50 (50%) o < 40 (100%) con el precio sobre su SMA50 ascendente; con el crédito
//         estresado (HY ≥ 1.5× su mínimo de 12 meses) espera a que se alivie (2008-09 fue una crisis de crédito).
//  · Ds · valuación en mínimos con el crédito aliviándose (HY ≥ 10% debajo de su máximo de 63 días), sin esperar el
//         rebote: BHT < 45 → 50%, < 40 → 75%, < 35 → 100%.
//  · R1e · regreso a máximos: tras una corrección posterior a la venta, precio en su máximo de 12 meses con SMA50 >
//         SMA200 y BHT < 70 → recompra todo lo pendiente.
// Bv y Ds exigen además el CAPE ≤ 1.25× su mediana de 20 años (separa los rebotes de 2001, con el CAPE en 1.9×, de los
// pisos de 2002, 2009, 2018 y 2022) y que no haya crisis de crédito. Porcentajes sobre el efectivo de la última venta.
// Backtest 1993–2026 (1×): VOO 8.9% → 10.0% anual, QQQ 12.9% → 15.5%; caída máx. QQQ igual (−42%), VOO −33% → −43%
// (compra de ene-2009, antes del piso de marzo). Días con ≥ 50% en efectivo: VOO 13.7% → 9.8%, QQQ 23.9% → 10.7%.
// Sensibilidad: inicio de Ds en 48–55 en vez de 45 solo adelanta la compra de 2022 (más cara); CAPE 1.15–1.4 estable.
import { CREDIT_CFG, SELL_CFG, TRANCHE_CFG, computeSellTranches, computeTranches, type BuyEvent, type EpisodeSummary, type PreparedTranches, type SellEvent, type TrancheOpts } from './tranches';

export const REENTRY_CFG = {
  bv: { half: 50, full: 40 }, ds: { bands: [[35, 1], [40, 0.75], [45, 0.5]] as Array<[number, number]>, ease: CREDIT_CFG.ease * 100 },
  capeMax: 1.25, r1BhtMax: 70, newCycleGap: 300,
};

export type ReentryRuleId = 'Bv' | 'Ds' | 'R1e';
export type ReentryCtx = {
  k: number; px: number; bht: number | null; hi252: number | null; s50: number | null; s50prev: number | null; s200: number | null;
  /** Hubo corrección (se abrió un episodio de compra) después de la última venta. */
  corrected: boolean; credit: boolean; oasOff: number | null; capeRel: number | null; oasFrom63: number | null;
  /** HY ÷ su mínimo de 12 meses (≥ 1.5 = crédito estresado). */
  oasRel?: number | null;
};
/** Una regla devuelve la fracción objetivo (acumulada) del efectivo de la venta. */
export type ReentryRule = (c: ReentryCtx) => { target: number; rule: ReentryRuleId | string };

type Num = number | null;
const ffill = (a: Num[]) => { let l: Num = null; return a.map((v) => (v != null && Number.isFinite(v) ? (l = v) : l)); };
const sma = (a: Num[], w: number) => { const o: Num[] = []; let s = 0, n = 0; for (let k = 0; k < a.length; k++) { const v = a[k]; if (v != null) { s += v; n++; } const old = k - w >= 0 ? a[k - w] : null; if (k - w >= 0 && old != null) { s -= old; n--; } o.push(n >= w * 0.8 ? s / n : null); } return o; };

/** Crédito estresado (HY ≥ 1.5× su mínimo de 12 meses) que todavía no se alivia (≥ 10% bajo su máximo de 63 días). */
export function creditStressed(c: ReentryCtx): boolean {
  return c.oasRel != null && c.oasRel >= CREDIT_CFG.ratio && !(c.oasFrom63 != null && c.oasFrom63 <= -REENTRY_CFG.ds.ease);
}
export function bvTarget(c: ReentryCtx): number {
  if (c.credit || creditStressed(c) || c.bht == null || c.s50 == null || c.s50prev == null || c.px <= c.s50 || c.s50 <= c.s50prev) return 0;
  if (c.capeRel == null || c.capeRel > REENTRY_CFG.capeMax) return 0;
  return c.bht < REENTRY_CFG.bv.full ? 1 : c.bht < REENTRY_CFG.bv.half ? 0.5 : 0;
}
export function dsTarget(c: ReentryCtx): number {
  if (c.credit || c.bht == null || c.oasFrom63 == null || c.oasFrom63 > -REENTRY_CFG.ds.ease || c.capeRel == null || c.capeRel > REENTRY_CFG.capeMax) return 0;
  for (const [lvl, t] of REENTRY_CFG.ds.bands) if (c.bht < lvl) return t;
  return 0;
}
export function r1eTarget(c: ReentryCtx): number {
  return c.corrected && c.hi252 != null && c.px >= c.hi252 && c.s50 != null && c.s200 != null && c.s50 > c.s200 && (c.bht ?? 100) < REENTRY_CFG.r1BhtMax ? 1 : 0;
}
/** Regla vigente: la mayor de Bv, Ds y R1e. */
export const NET_RULE: ReentryRule = (c) => {
  const t: Array<[ReentryRuleId, number]> = [['Bv', bvTarget(c)], ['Ds', dsTarget(c)], ['R1e', r1eTarget(c)]];
  const best = t.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { target: best[1], rule: best[0] };
};

/** Eventos completos de las dos escaleras (causales: los de antes de una fecha no cambian al alargar la serie). */
const evCache = new WeakMap<PreparedTranches, { sells: SellEvent[]; buys: BuyEvent[]; eps: EpisodeSummary[] }>();
export function ladderEvents(P: PreparedTranches, opts?: TrancheOpts) {
  const hit = opts ? undefined : evCache.get(P);
  if (hit) return hit;
  const last = P.s.dates[P.s.dates.length - 1];
  const sells: SellEvent[] = [], buys: BuyEvent[] = [], eps: EpisodeSummary[] = [];
  computeSellTranches(P, last, (e) => sells.push(e));
  computeTranches(P, last, 'half', { ...opts, onFire: (e) => buys.push(e), onEpisodeEnd: (e) => eps.push(e) });
  const out = { sells, buys, eps };
  if (!opts) evCache.set(P, out);
  return out;
}

export type NetEvent = { date: string; rule: string; pct: number; price: number };
export type SimCycle = { k: number; kLast: number; base: number; sold: number; soldUnits: number; sellCost: number; end: number; cashLeft: number };

/**
 * Simula la posición (1×, sin intereses) desde el inicio de la ruta hasta `until` (índice): ventas V1–V5 sobre las
 * unidades al inicio de cada ciclo; compras T0–T4 por su peso sobre el efectivo del episodio; la regla extra sobre el
 * efectivo de la última venta. Devuelve la serie de efectivo, las compras y el estado final.
 */
export type SimTrade = { k: number; date: string; kind: 'sell' | 'buy' | 'net'; id: string; price: number; amount: number };

export function simulateReentry(P: PreparedTranches, rule?: ReentryRule, until?: number, opts?: TrancheOpts, startIdx?: number) {
  const { s, px, route } = P;
  const { sells, buys, eps } = ladderEvents(P, opts);
  const bht = ffill(s.bht ?? []), s50 = sma(px, 50), s200 = sma(px, 200);
  const hi = route === 'voo' ? P.spMax : P.qMax;
  const sellAt = new Map<string, SellEvent[]>(); for (const e of sells) sellAt.set(e.date, [...(sellAt.get(e.date) ?? []), e]);
  const buyAt = new Map<string, BuyEvent[]>(); for (const e of buys) buyAt.set(e.date, [...(buyAt.get(e.date) ?? []), e]);
  const epStart = new Set(eps.map((e) => e.start));
  const kEnd = until ?? s.dates.length - 1;
  const kStart = s.dates.findIndex((d, k) => d >= (route === 'voo' ? '1993-06-01' : '1999-03-10') && px[k] != null);
  // startIdx: empezar 100% invertido ese día (vista Drawdowns: el sistema desde la fecha consultada).
  const k0 = startIdx != null && startIdx > kStart ? (px[startIdx] != null ? startIdx : -1) : kStart;
  const trades: SimTrade[] = [];
  const cashFrac: number[] = new Array(s.dates.length).fill(0);
  const buyLog: Array<{ k: number; amt: number; units: number; label: string; rule?: string }> = [];
  const netEvents: NetEvent[] = [];
  const cycles: SimCycle[] = [];
  if (k0 < 0) return { k0, kEnd, cashFrac, buyLog, netEvents, cycles, trades, units: 0, cash: 0, state: null as null | ReturnType<typeof stateAt> };
  let units = 1 / (px[k0] as number), cash = 0;
  let groupIds = new Set<string>(), lastSaleK = -1e9;
  let pool = 0, boughtExtra = 0, extraPool = 0, corrected = false;
  let cur: Omit<SimCycle, 'end' | 'cashLeft'> | null = null;
  const ctxAt = (k: number): ReentryCtx => ({
    k, px: px[k] as number, bht: bht[k], hi252: hi[k], s50: s50[k], s50prev: k >= 5 ? s50[k - 5] : null, s200: s200[k], corrected,
    credit: P.lastDiv[k] >= 0 && k - P.lastDiv[k] <= CREDIT_CFG.prior && P.oas[k] != null && P.oasMin252[k] != null && (P.oas[k] as number) >= CREDIT_CFG.ratio * (P.oasMin252[k] as number),
    oasOff: P.oas[k] != null && P.oasMax252[k] ? ((P.oas[k] as number) / (P.oasMax252[k] as number) - 1) * 100 : null,
    capeRel: s.cape[k] != null && s.capeMedian20[k] ? (s.cape[k] as number) / (s.capeMedian20[k] as number) : null,
    oasFrom63: P.oas[k] != null && P.oasMax63[k] ? ((P.oas[k] as number) / (P.oasMax63[k] as number) - 1) * 100 : null,
    oasRel: P.oas[k] != null && P.oasMin252[k] ? (P.oas[k] as number) / (P.oasMin252[k] as number) : null,
  });
  const stateAt = (k: number) => ({
    ctx: ctxAt(k), cash, units, cashFrac: cash / (units * (px[k] as number) + cash), extraPool, boughtExtra, corrected,
    lastSale: lastSaleK >= 0 ? s.dates[lastSaleK] : null, cycleStart: cur ? s.dates[cur.k] : null,
  });
  for (let k = k0; k <= kEnd; k++) {
    const d = s.dates[k], p = px[k] as number;
    if (p == null) continue;
    for (const e of sellAt.get(d) ?? []) {
      if (!cur || groupIds.has(e.id) || k - lastSaleK > REENTRY_CFG.newCycleGap) {
        if (cur) cycles.push({ ...cur, end: k, cashLeft: cash / (units * p + cash) });
        groupIds = new Set();
        cur = { k, kLast: k, base: units, sold: 0, soldUnits: 0, sellCost: 0 };
      }
      groupIds.add(e.id); lastSaleK = k; cur.kLast = k;
      const u = Math.min(units, SELL_CFG.weights[e.id] * cur.base);
      units -= u; cash += u * p;
      if (u > 1e-12) trades.push({ k, date: d, kind: 'sell', id: e.credit ? `${e.id}·C` : e.id, price: p, amount: u * p });
      cur.sold += u / cur.base; cur.soldUnits += u; cur.sellCost += u * p;
      extraPool = cash; boughtExtra = 0; corrected = false;
    }
    if (epStart.has(d)) { pool = cash; if (k > lastSaleK) corrected = true; }
    for (const e of buyAt.get(d) ?? []) {
      pool = Math.max(pool, cash);
      const amt = Math.min(cash, TRANCHE_CFG.weights[e.id] * e.size * pool);
      if (amt <= 1e-12) continue;
      cash -= amt; units += amt / p;
      buyLog.push({ k, amt, units: amt / p, label: `${e.id}${e.backup ? 'r' : ''}@${d}` });
      trades.push({ k, date: d, kind: 'buy', id: `${e.id}${e.size < 1 ? '½' : ''}${e.backup ? '·r' : ''}`, price: p, amount: amt });
    }
    if (rule && cash > 1e-9 && cur && k > lastSaleK && extraPool > 0) {
      const r = rule(ctxAt(k));
      const want = Math.min(cash, Math.max(0, r.target * extraPool - boughtExtra));
      if (want > 1e-9) {
        cash -= want; units += want / p; boughtExtra += want;
        const pct = Math.round((want / extraPool) * 100);
        buyLog.push({ k, amt: want, units: want / p, label: `+${pct}%@${d}`, rule: r.rule });
        netEvents.push({ date: d, rule: r.rule, pct, price: p });
        trades.push({ k, date: d, kind: 'net', id: `R${pct}·${r.rule}`, price: p, amount: want });
      }
    }
    cashFrac[k] = cash / (units * p + cash);
  }
  if (cur) cycles.push({ ...cur, end: kEnd, cashLeft: cashFrac[kEnd] });
  return { k0, kEnd, cashFrac, buyLog, netEvents, cycles, trades, units, cash, state: stateAt(kEnd) };
}

export type ReentryCheck = { key: string; ok: boolean; value?: number | string | null; need?: number | string | null };
export type ReentryResult = {
  date: string; route: string;
  /** Efectivo pendiente de la última venta (fracción del portafolio) y fracción de ese efectivo ya recomprada por la red. */
  cashPct: number; netBoughtPct: number; lastSale: string | null; corrected: boolean; active: boolean;
  rules: Record<ReentryRuleId, { target: number; checks: ReentryCheck[] }>;
  /** Compras de la red en toda la historia hasta la fecha. */
  events: NetEvent[];
  /** Compras de la red del ciclo vigente (desde la última venta); vacío si el ciclo ya se cerró. */
  cycleEvents: NetEvent[];
  /** El ciclo se cierra cuando ya no queda efectivo de la venta y termina el episodio en que se reinvirtió
   *  (o ese mismo día si no había episodio abierto); después, la red espera la siguiente venta. */
  cycleClosedAt: string | null;
};

/** Estado de la red de seguridad en una fecha (para la tabla de tranches) y sus compras históricas (para la gráfica). */
export function computeReentry(P: PreparedTranches, date: string): ReentryResult | null {
  let D = -1;
  for (let k = P.s.dates.length - 1; k >= 0; k--) if (P.s.dates[k] <= date) { D = k; break; }
  if (D < 0 || P.px[D] == null) return null;
  const sim = simulateReentry(P, NET_RULE, D);
  if (!sim.state) return null;
  const st = sim.state, c = st.ctx;
  const capeCheck: ReentryCheck = { key: 'capeRel', ok: c.capeRel != null && c.capeRel <= REENTRY_CFG.capeMax, value: c.capeRel, need: REENTRY_CFG.capeMax };
  const creditCheck: ReentryCheck = { key: 'noCreditCrisis', ok: !c.credit };
  const rebound = c.s50 != null && c.s50prev != null && c.px > c.s50 && c.s50 > c.s50prev;
  return {
    date: P.s.dates[D], route: P.route,
    cashPct: st.cashFrac, netBoughtPct: st.extraPool > 0 ? st.boughtExtra / st.extraPool : 0, lastSale: st.lastSale, corrected: st.corrected,
    active: st.cashFrac > 0.005 && st.lastSale != null,
    rules: {
      Bv: { target: bvTarget(c), checks: [
        { key: 'bht', ok: c.bht != null && c.bht < REENTRY_CFG.bv.half, value: c.bht, need: REENTRY_CFG.bv.half },
        { key: 'rebound', ok: rebound, value: c.s50 ? (c.px / c.s50 - 1) * 100 : null },
        creditCheck, { key: 'creditCalm', ok: !creditStressed(c), value: c.oasRel ?? null, need: CREDIT_CFG.ratio }, capeCheck,
      ] },
      Ds: { target: dsTarget(c), checks: [
        { key: 'bht', ok: c.bht != null && c.bht < REENTRY_CFG.ds.bands[REENTRY_CFG.ds.bands.length - 1][0], value: c.bht, need: REENTRY_CFG.ds.bands[REENTRY_CFG.ds.bands.length - 1][0] },
        { key: 'creditEasing', ok: c.oasFrom63 != null && c.oasFrom63 <= -REENTRY_CFG.ds.ease, value: c.oasFrom63, need: -REENTRY_CFG.ds.ease },
        creditCheck, capeCheck,
      ] },
      R1e: { target: r1eTarget(c), checks: [
        { key: 'corrected', ok: c.corrected },
        { key: 'atHigh', ok: c.hi252 != null && c.px >= c.hi252, value: c.hi252 ? (c.px / c.hi252 - 1) * 100 : null },
        { key: 'trendUp', ok: c.s50 != null && c.s200 != null && c.s50 > c.s200 },
        { key: 'bht', ok: (c.bht ?? 100) < REENTRY_CFG.r1BhtMax, value: c.bht, need: REENTRY_CFG.r1BhtMax },
      ] },
    },
    events: sim.netEvents,
    ...netCycle(P, sim, st.lastSale, D),
  };
}

/** Eventos del ciclo vigente de la red y fecha de cierre (reseteo) si ya ocurrió hasta D. */
function netCycle(P: PreparedTranches, sim: ReturnType<typeof simulateReentry>, lastSale: string | null, D: number): { cycleEvents: NetEvent[]; cycleClosedAt: string | null } {
  if (!lastSale) return { cycleEvents: [], cycleClosedAt: null };
  const dates = P.s.dates, kS = dates.indexOf(lastSale);
  let full = -1;
  for (let k = kS + 1; k <= D; k++) if (sim.cashFrac[k] < 0.005) { full = k; break; }
  let closed: string | null = null;
  if (full >= 0) {
    const cd = dates[full];
    const ep = ladderEvents(P).eps.find((e) => e.start <= cd && (!e.end || e.end >= cd));
    const end = ep ? ep.end : cd;
    if (end && end <= dates[D]) closed = end;
  }
  return { cycleEvents: closed ? [] : sim.netEvents.filter((e) => e.date > lastSale && e.date <= dates[D]), cycleClosedAt: closed };
}

export type SystemSince = {
  route: string; from: string; today: string;
  /** Precio de entrada del instrumento de la ruta el día consultado (compra inicial al 100%). */
  basePrice: number;
  /** Sistema (venta V1–V5, compra T0–T4 y red) desde la fecha, empezando 100% invertido, 1× y sin intereses. */
  system: { pct: number; maxDd: { pct: number; peakDate: string; troughDate: string }; cashPct: number };
  /** Hold del mismo instrumento de la ruta (S&P 500 o QQQ). */
  hold: { pct: number; maxDd: { pct: number; peakDate: string; troughDate: string } };
  trades: Array<{ date: string; kind: 'sell' | 'buy' | 'net'; id: string; price: number; vsBasePct: number; pctOfPortfolio: number; cashPctAfter: number }>;
};

/** El sistema real desde una fecha (vista Drawdowns del detalle del BHT): mismas escaleras que la gráfica y Tranches. */
export function systemSince(P: PreparedTranches, date: string): SystemSince | null {
  let i = -1;
  for (let k = P.s.dates.length - 1; k >= 0; k--) if (P.s.dates[k] <= date) { i = k; break; }
  if (i < 0 || P.px[i] == null) return null;
  const sim = simulateReentry(P, NET_RULE, undefined, undefined, i);
  if (sim.k0 < 0) return null;
  const px = P.px, dates = P.s.dates, p0 = px[i] as number;
  const dd = (vals: Array<[string, number]>) => {
    let peak = vals[0][1], pd = vals[0][0], best = { pct: 0, peakDate: pd, troughDate: pd };
    for (const [d, v] of vals) { if (v > peak) { peak = v; pd = d; } const x = (v / peak - 1) * 100; if (x < best.pct) best = { pct: x, peakDate: pd, troughDate: d }; }
    return best;
  };
  const sysVals: Array<[string, number]> = [], holdVals: Array<[string, number]> = [];
  let V = 1;
  for (let k = i; k <= sim.kEnd; k++) {
    if (px[k] == null) continue;
    if (k > i) { const prev = px[k - 1] ?? px[k]; V *= (1 - sim.cashFrac[k - 1]) * ((px[k] as number) / (prev as number)) + sim.cashFrac[k - 1]; }
    sysVals.push([dates[k], V]); holdVals.push([dates[k], (px[k] as number) / p0]);
  }
  // Valor de la cartera el día de cada operación (para expresar el monto como % de la cartera).
  const valAt = new Map(sysVals);
  const pl = holdVals[holdVals.length - 1][1];
  return {
    route: P.route, from: dates[i], today: dates[sim.kEnd], basePrice: p0,
    system: { pct: (V - 1) * 100, maxDd: dd(sysVals), cashPct: sim.cashFrac[sim.kEnd] * 100 },
    hold: { pct: (pl - 1) * 100, maxDd: dd(holdVals) },
    trades: sim.trades.filter((t) => t.k > i).map((t) => {
      // La simulación empieza con valor 1 (1/p0 unidades), igual que la serie V: monto ÷ V = fracción de la cartera.
      const v = valAt.get(t.date) ?? 1;
      return { date: t.date, kind: t.kind, id: t.id, price: t.price, vsBasePct: (t.price / p0 - 1) * 100,
        pctOfPortfolio: (t.amount / v) * 100, cashPctAfter: sim.cashFrac[t.k] * 100 };
    }),
  };
}
