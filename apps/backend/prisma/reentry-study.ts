// Estudio de reentrada: simula la posición combinando la escalera de VENTA (V1–V5) y la de COMPRA (T0–T4) por ruta,
// y mide por ciclo cuánto se vendió (y a qué distancia del pico), cuánto se recompró (y a qué distancia del piso) y
// cuánto quedó en efectivo. Compara variantes de red de seguridad para no quedarse fuera con el mercado barato.
//   npx ts-node prisma/reentry-study.ts            (tabla por ciclo y resumen de todas las variantes)
// Supuestos: 1× (sin apalancamiento), efectivo sin intereses, sin comisiones. Las compras T0–T4 usan su peso sobre el
// efectivo disponible en el episodio (efectivo al abrir + ventas durante el episodio). Informativo: no cambia las escaleras.
import { Pool } from 'pg';
import { databaseUrl } from './db-url';
import { computeSellTranches, computeTranches, loadTrancheSeries, prepareTranches, CREDIT_CFG, TRANCHE_CFG, SELL_CFG, type BuyEvent, type EpisodeSummary, type SellEvent, type TrancheRoute } from '../src/modules/backtesting/tranches';

type Num = number | null;
const ffill = (a: Num[]) => { let l: Num = null; return a.map((v) => (v != null && Number.isFinite(v) ? (l = v) : l)); };
const sma = (a: Num[], w: number) => { const o: Num[] = []; let s = 0, n = 0; for (let k = 0; k < a.length; k++) { const v = a[k]; if (v != null) { s += v; n++; } const old = k - w >= 0 ? a[k - w] : null; if (k - w >= 0 && old != null) { s -= old; n--; } o.push(n >= w * 0.8 ? s / n : null); } return o; };

/** Regla extra: fracción del efectivo pendiente a comprar hoy (0 = nada). */
type Ctx = { k: number; px: number; bht: number | null; hi252: number | null; s50: Num; s50prev: Num; s200: Num; cash: number; pool: number; boughtExtra: number; sinceSale: number; corrected: boolean; credit: boolean; oasOff: number | null; capeRel: number | null };
type Variant = { key: string; name: string; rule?: (c: Ctx) => number };

const VARIANTS: Variant[] = [
  { key: 'base', name: 'Escaleras actuales' },
  // R1: el mercado recuperó su máximo de 12 meses con tendencia alcista y el BHT no está caro → recompra lo pendiente.
  { key: 'R1', name: 'R1 · máximo de 12 meses + SMA50>SMA200 + BHT<70', rule: (c) => (c.hi252 != null && c.px >= c.hi252 && c.s50 != null && c.s200 != null && c.s50 > c.s200 && (c.bht ?? 100) < 70 ? 1 : 0) },
  // B: escalera por BHT barato sobre el efectivo de la venta: <55 → 25%, <45 → 50%, <35 → 75%, <25 → 100% (acumulado).
  { key: 'B', name: 'B · BHT barato (<55 25%, <45 50%, <35 75%, <25 100%)', rule: (c) => bandTarget(c.bht) },
  // B con guarda de tendencia: las bandas 55/45 solo con el precio sobre su SMA200; ≤35 entra aunque siga bajando.
  { key: 'Bt', name: 'Bt · BHT barato con tendencia (55/45 sobre SMA200; <35 siempre)', rule: (c) => { const b = c.bht ?? 100; if (b < 35) return bandTarget(b); return c.s200 != null && c.px > c.s200 ? bandTarget(b) : 0; } },
  { key: 'B+R1', name: 'B + R1', rule: (c) => Math.max(bandTarget(c.bht), VARIANTS[1].rule!(c)) },
  { key: 'Bt+R1', name: 'Bt + R1', rule: (c) => Math.max(VARIANTS[3].rule!(c), VARIANTS[1].rule!(c)) },
  // R1e: como R1, pero solo si después de la venta el mercado sí corrigió (se abrió un episodio de compra): no deshace
  // ventas a mitad del ciclo cuando el precio sigue haciendo máximos.
  { key: 'R1e', name: 'R1e · R1 solo tras una corrección posterior a la venta', rule: (c) => (c.corrected ? r1(c) : 0) },
  // Bc: BHT barato con rebote confirmado (precio sobre SMA50 ascendente) y sin crisis de crédito: <50 → 50%, <40 → 100%.
  { key: 'Bc', name: 'Bc · BHT<50 (50%) / <40 (100%) con precio sobre SMA50 ascendente, sin crisis de crédito', rule: (c) => bc(c) },
  { key: 'Bc+R1e', name: 'Bc + R1e', rule: (c) => Math.max(bc(c), c.corrected ? r1(c) : 0) },
  // Bcc: Bc + alivio del crédito (HY ≥ 10% debajo de su máximo de 12 meses): separa 2001 (crédito empeorando) de 2009 y 2022.
  { key: 'Bcc', name: 'Bcc · Bc + crédito ≥10% bajo su máximo de 12 meses', rule: (c) => (c.oasOff != null && c.oasOff <= -10 ? bc(c) : 0) },
  { key: 'Bcc+R1e', name: 'Bcc + R1e', rule: (c) => Math.max(c.oasOff != null && c.oasOff <= -10 ? bc(c) : 0, c.corrected ? r1(c) : 0) },
  // Bv: Bc solo con el CAPE cerca o debajo de su mediana de 20 años (≤ 1.25×): mayo-2001 estaba en 1.9×; 2009 0.6×,
  // 2018-19 1.0–1.16×, dic-2022 1.14×, abr-2025 1.15×.
  { key: 'Bv', name: 'Bv · Bc + CAPE ≤ 1.25× su mediana de 20 años', rule: (c) => (c.capeRel != null && c.capeRel <= CAPE_MAX ? bc(c) : 0) },
  { key: 'Bv+R1e', name: 'Bv + R1e', rule: (c) => Math.max(c.capeRel != null && c.capeRel <= CAPE_MAX ? bc(c) : 0, c.corrected ? r1(c) : 0) },
];
function r1(c: Ctx) { return c.hi252 != null && c.px >= c.hi252 && c.s50 != null && c.s200 != null && c.s50 > c.s200 && (c.bht ?? 100) < 70 ? 1 : 0; }
// Umbrales de Bc (sensibilidad: BC_HI, BC_LO, CAPE_MAX por variables de entorno).
const BC_HI = Number(process.env.BC_HI ?? 50), BC_LO = Number(process.env.BC_LO ?? 40), CAPE_MAX = Number(process.env.CAPE_MAX ?? 1.25);
function bc(c: Ctx) {
  if (c.credit || c.bht == null || c.s50 == null || c.s50prev == null || c.px <= c.s50 || c.s50 <= c.s50prev) return 0;
  return c.bht < BC_LO ? 1 : c.bht < BC_HI ? 0.5 : 0;
}
function bandTarget(bht: number | null): number {
  if (bht == null) return 0;
  return bht < 25 ? 1 : bht < 35 ? 0.75 : bht < 45 ? 0.5 : bht < 55 ? 0.25 : 0;
}

type Cur = { k: number; kLast: number; base: number; sold: number; soldUnits: number; sellCost: number; buyCost: number; buyUnits: number; lastBuy: string | null; buys: string[] };

function simulate(route: TrancheRoute, s: Awaited<ReturnType<typeof loadTrancheSeries>>, v: Variant) {
  const P = prepareTranches(s, route);
  const last = s.dates[s.dates.length - 1];
  const sells: SellEvent[] = [], buys: BuyEvent[] = [], eps: EpisodeSummary[] = [];
  computeSellTranches(P, last, (e) => sells.push(e));
  computeTranches(P, last, 'half', { onFire: (e) => buys.push(e), onEpisodeEnd: (e) => eps.push(e) });
  const px = P.px, bht = ffill(s.bht ?? []), s50 = sma(px, 50), s200 = sma(px, 200);
  const hi = route === 'voo' ? P.spMax : P.qMax;
  const sellAt = new Map<string, SellEvent[]>(); for (const e of sells) sellAt.set(e.date, [...(sellAt.get(e.date) ?? []), e]);
  const buyAt = new Map<string, BuyEvent[]>(); for (const e of buys) buyAt.set(e.date, [...(buyAt.get(e.date) ?? []), e]);
  const epStart = new Set(eps.map((e) => e.start));
  const k0 = s.dates.findIndex((d, k) => d >= (route === 'voo' ? '1993-06-01' : '1999-03-10') && px[k] != null);
  let units = 1 / (px[k0] as number), cash = 0;
  let groupIds = new Set<string>(), lastSaleK = -1e9;
  let pool = 0, boughtExtra = 0, extraPool = 0, corrected = false;
  const raw: Array<Cur & { end: number; cashLeft: number }> = [];
  let cur: Cur | null = null;
  let peakV = 0, maxDd = 0, daysHalfCash = 0, days = 0;
  const cashFrac: number[] = new Array(s.dates.length).fill(0);
  const buyLog: Array<{ k: number; amt: number; units: number; label: string }> = [];
  const closeCur = (k: number, p: number) => { if (cur) raw.push({ ...cur, end: k, cashLeft: cash / (units * p + cash) }); };
  for (let k = k0; k < s.dates.length; k++) {
    const d = s.dates[k], p = px[k] as number;
    if (p == null) continue;
    for (const e of sellAt.get(d) ?? []) {
      if (groupIds.has(e.id) || k - lastSaleK > 300) {
        closeCur(k, p);
        groupIds = new Set();
        cur = { k, kLast: k, base: units, sold: 0, soldUnits: 0, sellCost: 0, buyCost: 0, buyUnits: 0, lastBuy: null, buys: [] };
      }
      groupIds.add(e.id); lastSaleK = k; cur!.kLast = k;
      const u = Math.min(units, SELL_CFG.weights[e.id] * cur!.base);
      units -= u; cash += u * p;
      cur!.sold += u / cur!.base; cur!.soldUnits += u; cur!.sellCost += u * p;
      extraPool = cash; boughtExtra = 0; corrected = false;
    }
    if (epStart.has(d)) { pool = cash; if (k > lastSaleK) corrected = true; }
    for (const e of buyAt.get(d) ?? []) {
      pool = Math.max(pool, cash);
      const amt = Math.min(cash, TRANCHE_CFG.weights[e.id] * e.size * pool);
      if (amt <= 1e-12) continue;
      cash -= amt; units += amt / p;
      buyLog.push({ k, amt, units: amt / p, label: `${e.id}${e.backup ? 'r' : ''}@${d}` });
    }
    if (v.rule && cash > 1e-9 && cur && k > lastSaleK) {
      const credit = P.lastDiv[k] >= 0 && k - P.lastDiv[k] <= CREDIT_CFG.prior && P.oas[k] != null && P.oasMin252[k] != null && (P.oas[k] as number) >= CREDIT_CFG.ratio * (P.oasMin252[k] as number);
      const target = v.rule({ k, px: p, bht: bht[k], hi252: hi[k], s50: s50[k], s50prev: k >= 5 ? s50[k - 5] : null, s200: s200[k], cash, pool: extraPool, boughtExtra, sinceSale: k - lastSaleK, corrected, credit, oasOff: P.oas[k] != null && P.oasMax252[k] ? ((P.oas[k] as number) / (P.oasMax252[k] as number) - 1) * 100 : null, capeRel: s.cape[k] != null && s.capeMedian20[k] ? (s.cape[k] as number) / (s.capeMedian20[k] as number) : null });
      const want = Math.min(cash, Math.max(0, target * extraPool - boughtExtra));
      if (want > 1e-9) {
        cash -= want; units += want / p; boughtExtra += want;
        buyLog.push({ k, amt: want, units: want / p, label: `+${Math.round((want / extraPool) * 100)}%@${d}` });
      }
    }
    const V = units * p + cash;
    peakV = Math.max(peakV, V); maxDd = Math.min(maxDd, V / peakV - 1);
    days++; if (cash / V >= 0.5) daysHalfCash++;
    cashFrac[k] = cash / V;
  }
  const kl = s.dates.length - 1, pl = px[kl] as number;
  closeCur(kl, pl);
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
  const V = units * pl + cash;
  const years = (kl - k0) / 252;
  return { cycles, final: V, hold: pl / (px[k0] as number), cagr: (Math.pow(V, 1 / years) - 1) * 100, holdCagr: (Math.pow(pl / (px[k0] as number), 1 / years) - 1) * 100, maxDd: maxDd * 100, halfCashPct: (daysHalfCash / days) * 100, from: s.dates[k0] };
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl() });
  const s = await loadTrancheSeries((sql) => pool.query(sql).then((r) => r.rows));
  await pool.end();
  const only = process.env.VARIANT;
  const out: Record<string, unknown> = {};
  for (const route of ['voo', 'qqq'] as TrancheRoute[]) {
    for (const v of VARIANTS.filter((x) => !only || x.key === only)) {
      const r = simulate(route, s, v);
      out[`${route}:${v.key}`] = r;
    }
  }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
