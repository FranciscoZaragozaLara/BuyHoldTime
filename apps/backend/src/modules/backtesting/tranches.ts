// Módulo de Reentrada por Tranches (MRT v1.3, BackTesting/docs/BuyHoldTime_Modulo_Reentrada_v1.3.md), adaptado:
//  - Permiso por caída del PRECIO contra su máximo de 12 meses (el doc usa la del CAPE, que en semanas casi coincide).
//  - Volatilidad = estructura de plazos VIX/VIX3M en las dos rutas (no existe un VXN a 3 meses para formar el ratio);
//    antes de 2007 (sin VIX3M), el respaldo del doc con niveles de VIX.
//  - T4: CAPE debajo de su mediana de 20 años (mensual, con un mes de rezago).
//  - Sin voto de amplitud (no hay % de acciones sobre su SMA50).
// Ruta 'voo' = S&P 500 (VOO/UPRO); ruta 'qqq' = Nasdaq-100 con QQQ como proxy (QQQ/TQQQ), permiso dual con el S&P.
// Se recorre día a día desde el inicio de la serie hasta la fecha pedida: así se sabe cuándo se disparó cada tranche.

import { CREDIT_BASE, creditFromBaa } from './thermo-history';
import { spliceSeries } from '../market-data/valuation-daily';
import { withProvisional } from './provisional-series';

export type TrancheRoute = 'voo' | 'qqq';
/** Corrección sectorial (solo cae el Nasdaq y el S&P no confirma): T1 a medio tamaño o con un voto extra. */
export type SectorRule = 'half' | 'extraVote';
export type TrancheId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type TrancheSeries = {
  dates: string[];
  spx: (number | null)[];
  qqq: (number | null)[];
  /** TQQQ real (desde 2010): solo para su caída desde ATH; las señales usan QQQ. */
  tqqq?: (number | null)[];
  vix: (number | null)[];
  vix3m: (number | null)[];
  oas: (number | null)[];
  cape: (number | null)[];
  /** BHT Index del día (desde 1993): blinda la señal por nivel del VIX del modo híbrido. */
  bht?: (number | null)[];
  /** Mediana de 20 años del CAPE vigente cada día (null sin historia suficiente). */
  capeMedian20: (number | null)[];
};

export const TRANCHE_CFG = {
  weights: { T0: 0.25, T1: 0.15, T2: 0.25, T3: 0.2, T4: 0.15 } as Record<TrancheId, number>,
  /** Parte en el instrumento 3× de cada tranche (TQQQ o UPRO); el resto en el 1× (QQQ o VOO). */
  lev3x: { T0: 0, T1: 0, T2: 0.3, T3: 0.6, T4: 1 } as Record<TrancheId, number>,
  sp: { permit: -10, t0Depth: -15, t0Speed: -10, t2: -15, t4: -25 },
  ndx: { permit: -15, t0Depth: -20, t0Speed: -13, t2: -22, t4: -35 },
  t0Ratio: 1.2, t0Oas: 6, volArm: 1.05, volWindow: 20,
  /** Voto de volatilidad híbrido blindado (por defecto): ratio VIX/VIX3M del doc, o VIX ≥25% bajo su máximo de 20 días
   *  (≥25) solo con BHT < 50. Backtest 1990–2026: despliega 72% (VOO) y 47% (QQQ) vs 60% y 37% del doc, y captura 62% y
   *  73% vs 56% y 61%, sin entrar temprano en 2000–03 ni 2008 (con BHT 55–60 sí; con 40–45 se pierde 2022).
   *  Con el BHT sin look-ahead y el filtro de crisis de crédito (nov-2026): VOO 72% desplegado / 64% capturado, QQQ 43% / 77%. */
  volMode: 'hybrid' as 'ratio' | 'hybrid', lvlMaxBht: 50 as number | undefined,
  decelSmin: -0.015, decelRecover: 0.5, minGapT2: 5, minGapT3: 10, t4OasOff: 0.15, t4BackupDays: 252,
};

/** Señal de crisis de crédito (estudio nov-2026, BHT sin look-ahead). Relativa al propio HY OAS porque la historia
 *  previa a ago-2023 es un proxy con niveles comprimidos (dic-2008 ≈ 11.8 vs ~22 real).
 *  Divergencia crédito-bolsa: OAS ≥ 1.5× su mínimo de 12 meses, subiendo ≥ +0.5 en 3 meses, con el precio a menos de
 *  7% de su máximo de 12 meses (el crédito se rompe antes que la bolsa, como en 2007).
 *  · Venta: habilita V4 y V5 sin filtro de BHT (y V5 sin venta previa). 1997–2025: única venta nueva nov-2007
 *    (S&P evitó ~54%); S&P subió/evitó 9.7/21.9 → 8.1/30.0, QQQ 17.5/28.6 → 15.8/32.2, sin ventas falsas nuevas.
 *  · Compra: con divergencia en las últimas 252 sesiones y OAS aún ≥ 1.5× su mínimo, T1–T3 esperan alivio del
 *    crédito (OAS ≥ 10% bajo su máximo de 63 días) o BHT ≤ 40. 2007-09: VOO capturado 67% → 80%, QQQ 43% → 85%;
 *    los demás episodios sin cambio. Validado con un solo evento (2007-08). */
export const CREDIT_CFG = { ratio: 1.5, d3: 0.5, dd: -7, ease: 0.10, bhtMax: 40, prior: 252 };

const W12 = 252;

type Num = number | null;
const ffill = (a: Num[]): Num[] => { let last: Num = null; return a.map((v) => (v != null && Number.isFinite(v) ? (last = v) : last)); };
function rollingMax(a: Num[], w: number): Num[] {
  const out: Num[] = new Array(a.length).fill(null);
  const dq: number[] = [];
  for (let k = 0; k < a.length; k++) {
    const v = a[k];
    if (v != null) { while (dq.length && (a[dq[dq.length - 1]] as number) <= v) dq.pop(); dq.push(k); }
    while (dq.length && dq[0] <= k - w) dq.shift();
    out[k] = dq.length ? (a[dq[0]] as number) : null;
  }
  return out;
}
function sma(a: Num[], w: number): Num[] {
  const out: Num[] = new Array(a.length).fill(null);
  let sum = 0, n = 0;
  for (let k = 0; k < a.length; k++) {
    const v = a[k]; if (v != null) { sum += v; n++; }
    const o = k - w >= 0 ? a[k - w] : null; if (k - w >= 0 && o != null) { sum -= o; n--; }
    out[k] = n >= w * 0.8 ? sum / n : null;
  }
  return out;
}
function ema(a: Num[], n: number): Num[] {
  const k2 = 2 / (n + 1); let e: number | null = null;
  return a.map((v) => (v == null ? e : (e = e == null ? v : e + k2 * (v - e))));
}
function stdev(a: Num[], w: number, m: Num[]): Num[] {
  return a.map((_, k) => {
    if (k < w - 1 || m[k] == null) return null;
    let s = 0, n = 0;
    for (let j = k - w + 1; j <= k; j++) { const v = a[j]; if (v != null) { s += (v - (m[k] as number)) ** 2; n++; } }
    return n > 1 ? Math.sqrt(s / n) : null;
  });
}
const pctDd = (p: Num, m: Num) => (p != null && m != null && m > 0 ? (p / m - 1) * 100 : null);

export type AthAt = { pct: number; date: string; price: number; window5y: boolean };
/** Caída desde el ATH en el índice D; si el ATH ocurrió hace más de 5 años, contra el máximo de los últimos 5 años. */
export function athAt(dates: string[], px: Num[], D: number): AthAt | null {
  const cur = px[D];
  if (cur == null) return null;
  const y5 = `${Number(dates[D].slice(0, 4)) - 5}${dates[D].slice(4)}`;
  let ath = -Infinity, ai = -1, ath5 = -Infinity, ai5 = -1;
  for (let k = 0; k <= D; k++) {
    const v = px[k]; if (v == null) continue;
    if (v > ath) { ath = v; ai = k; }
    if (dates[k] >= y5 && v > ath5) { ath5 = v; ai5 = k; }
  }
  const w5 = ai >= 0 && dates[ai] < y5 && ai5 >= 0;
  const [m, i] = w5 ? [ath5, ai5] : [ath, ai];
  return { pct: (cur / m - 1) * 100, date: dates[i], price: m, window5y: w5 };
}

export type Check = { key: string; ok: boolean; value?: number | string | null; need?: number | string | null };
export type TrancheState = {
  id: TrancheId; weight: number; size: number; lev3x: number;
  status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null; backup?: boolean; checks: Check[];
  /** % de cambio del precio de referencia (S&P 500 o QQQ) desde el disparo hasta la fecha. */
  pnl: number | null;
  /** % de la mezcla real (1× + 3×; TQQQ con su propio precio). Solo ruta QQQ con dato de TQQQ. */
  pnlMix: number | null;
};
export type TranchesResult = {
  date: string; route: TrancheRoute; sectorRule: SectorRule;
  light: 'gray' | 'purple' | 'red' | 'amber' | 'green';
  episode: null | {
    start: string; peakDate: string; peak: number; price: number; dd: number; ddMax: number; minDate: string; min: number; days: number;
    sectorOnly: boolean; spDd: number | null; ndxDd: number | null; spDdMax: number | null; ndxDdMax: number | null;
  };
  lastEpisode: null | { start: string; end: string; ddMax: number };
  today: {
    price: number | null; spDd: number | null; ndxDd: number | null; veto: boolean; oas: number | null; oasMax63: number | null; oasSma20: number | null;
    ratio: number | null; volSource: 'ratio' | 'fallback'; volVote: boolean; volArmedAt: string | null;
    /** Qué activó el voto: el ratio del doc o la caída del VIX desde su máximo de 20 días (modo híbrido). */
    volSignal: 'ratio' | 'level' | null; vix: number | null; vixMax20: number | null; bht: number | null;
    decelVote: boolean; slope: number | null; curv: number | null; slopeMin: number | null; recover: number | null; boll: boolean;
    votes: number; cape: number | null; capeMedian20: number | null;
    credit: CreditState;
  };
  /** Caída desde el máximo histórico a esa fecha (máximo de 5 años si el ATH tiene más de 5 años), como las cards. */
  ath: { spx: AthAt | null; qqq: AthAt | null; tqqq: AthAt | null };
  tranches: TrancheState[];
  deployed: number; leverage: number; avgPrice: number | null; captured: number | null;
  /** P&L ponderado de lo desplegado (precio de referencia y mezcla real). */
  pnl: number | null; pnlMix: number | null;
};

/** Precálculo por ruta (independiente de la fecha): se reutiliza entre peticiones. */
export function prepareTranches(s: TrancheSeries, route: TrancheRoute) {
  const spx = ffill(s.spx), qqq = ffill(s.qqq), vix = ffill(s.vix), vix3m = s.vix3m, oas = ffill(s.oas);
  const px = route === 'voo' ? spx : qqq;
  const spMax = rollingMax(spx, W12), qMax = rollingMax(qqq, W12);
  const e50 = ema(px, 50), e200 = ema(px, 200);
  const slope = e50.map((v, k) => (k >= 10 && v != null && e50[k - 10] != null ? v / (e50[k - 10] as number) - 1 : null));
  const curv = slope.map((v, k) => (k >= 5 && v != null && slope[k - 5] != null ? v - (slope[k - 5] as number) : null));
  const bMid = sma(px, 20), bSd = stdev(px, 20, bMid);
  const lower = bMid.map((m, k) => (m != null && bSd[k] != null ? m - 2 * (bSd[k] as number) : null));
  const oasMax63 = rollingMax(oas, 63), oasSma20 = sma(oas, 20), oasMax252 = rollingMax(oas, W12);
  const vixMax10 = rollingMax(vix, 10), vixMax20 = rollingMax(vix, 20), vixSma20 = sma(vix, 20);
  // Crisis de crédito (CREDIT_CFG): divergencia crédito-bolsa del día y última vez que ocurrió.
  const oasMin252 = rollingMax(oas.map((v) => (v == null ? null : -v)), W12).map((v) => (v == null ? null : -v));
  const pxMax = route === 'voo' ? spMax : qMax;
  const credDiv: boolean[] = [], lastDiv: number[] = [];
  let ld = -1;
  for (let k = 0; k < px.length; k++) {
    const o = oas[k], o63 = k >= 63 ? oas[k - 63] : null, m = oasMin252[k], p = px[k], hi = pxMax[k];
    const div = o != null && o63 != null && m != null && p != null && hi != null && o >= CREDIT_CFG.ratio * m && o - o63 >= CREDIT_CFG.d3 && (p / hi - 1) * 100 >= CREDIT_CFG.dd;
    if (div) ld = k;
    credDiv.push(div); lastDiv.push(ld);
  }
  return { s, route, spx, qqq, vix, vix3m, oas, px, spMax, qMax, e50, e200, slope, curv, lower, oasMax63, oasSma20, oasMax252, vixMax10, vixMax20, vixSma20, oasMin252, credDiv, lastDiv };
}
export type PreparedTranches = ReturnType<typeof prepareTranches>;

/** Estado del crédito un día: divergencia (señal de venta), crisis vigente (filtro de compra) y alivio. */
export type CreditState = {
  div: boolean; crisis: boolean; easing: boolean; lastDiv: string | null;
  oas: number | null; oasMin252: number | null; ratio: number | null; d3: number | null; fromHi252: number | null; fromMax63: number | null;
};
export function creditAt(P: PreparedTranches, k: number): CreditState {
  const C = CREDIT_CFG, o = P.oas[k], m = P.oasMin252[k], o63 = k >= 63 ? P.oas[k - 63] : null, mx = P.oasMax63[k];
  const hi = (P.route === 'voo' ? P.spMax : P.qMax)[k], p = P.px[k];
  const ratio = o != null && m ? o / m : null;
  const lastDiv = P.lastDiv[k] >= 0 ? P.lastDiv[k] : -1;
  const crisis = lastDiv >= 0 && k - lastDiv <= C.prior && ratio != null && ratio >= C.ratio;
  const fromMax63 = o != null && mx ? (o / mx - 1) * 100 : null;
  return {
    div: P.credDiv[k], crisis, easing: fromMax63 != null && fromMax63 <= -C.ease * 100, lastDiv: lastDiv >= 0 ? P.s.dates[lastDiv] : null,
    oas: o, oasMin252: m, ratio, d3: o != null && o63 != null ? o - o63 : null, fromHi252: p != null && hi ? (p / hi - 1) * 100 : null, fromMax63,
  };
}

/** Resumen de un episodio cerrado (backtest de umbrales): lo desplegado y a qué precio promedio. */
export type EpisodeSummary = { start: string; end: string | null; peak: number; min: number; ddMax: number; fired: TrancheId[]; deployed: number; leverage: number; avgPrice: number | null; captured: number | null };
/** volMode 'hybrid': el voto de volatilidad también se activa si el VIX cae ≥25% desde su máximo de 20 días (≥25),
 *  para los mercados bajistas lentos donde la estructura VIX/VIX3M casi no se invierte (2022). */
export type TrancheOpts = { volArm?: number; volMode?: 'ratio' | 'hybrid'; /** Blindaje: la señal por nivel solo cuenta con BHT < este valor. */ lvlMaxBht?: number; onEpisodeEnd?: (e: EpisodeSummary) => void;
  /** false: sin el filtro de crisis de crédito en T1–T3 (backtests). */ creditGate?: boolean;
  /** Voto A (curva VIX/VIX3M), estudio: se activa al bajar de volRelease (por defecto 1) y se anula al volver a pasar
   *  volCancel (por defecto 1); con volPeakDrop, se activa al caer esa fracción desde el pico del ratio desde que se armó. */
  volRelease?: number; volCancel?: number; volPeakDrop?: number;
  /** Cada compra histórica (para marcarla en la gráfica). */ onFire?: (e: BuyEvent) => void };
/** Compra histórica de la escalera: tranche, fecha, precio de referencia, tamaño (0.5 = medio tranche) y si fue el respaldo de T4. */
export type BuyEvent = { date: string; id: TrancheId; price: number; size: number; backup: boolean };

export function computeTranches(P: PreparedTranches, date: string, sectorRule: SectorRule = 'half', opts: TrancheOpts = {}): TranchesResult | null {
  const { s, route, px } = P;
  let D = -1;
  for (let k = s.dates.length - 1; k >= 0; k--) if (s.dates[k] <= date) { D = k; break; }
  if (D < 0 || px[D] == null) return null;
  const C = TRANCHE_CFG;
  const dual = route === 'qqq';
  const volArm = opts.volArm ?? C.volArm;
  const volMode = opts.volMode ?? C.volMode;
  const lvlMaxBht = 'lvlMaxBht' in opts ? opts.lvlMaxBht : C.lvlMaxBht;
  const useCredit = opts.creditGate !== false;
  const summarize = (end: string | null): EpisodeSummary => {
    let dep = 0, lev = 0, cost = 0;
    const ids = (Object.keys(fired) as TrancheId[]).sort();
    for (const id of ids) { const f = fired[id]!; const w = C.weights[id] * f.size; const l3 = f.backup ? 0 : C.lev3x[id]; dep += w; lev += w * (1 + 2 * l3); cost += w * (px[f.k] as number); }
    const avg = dep > 0 ? cost / dep : null;
    return { start: s.dates[start], end, peak, min: minP, ddMax, fired: ids, deployed: dep, leverage: lev, avgPrice: avg, captured: avg != null && peak > minP ? ((peak - avg) / (peak - minP)) * 100 : null };
  };

  // Estado
  let open = false, start = -1, peak = 0, peakIdx = -1, minP = Infinity, minIdx = -1, ddMax = 0, spDdMax = 0, ndxDdMax = 0, sectorOnly = false;
  let lastEp: TranchesResult['lastEpisode'] = null;
  let armed = false, volOnAt = -1, armedAt = -1, lvlOnAt = -1, armPeak = 0;
  const volRelease = opts.volRelease ?? 1, volCancel = opts.volCancel ?? 1, volPeakDrop = opts.volPeakDrop;
  let volSignal: 'ratio' | 'level' | null = null;
  let bollAt = -1, curvRun = 0, slopeMin = 0;
  const fired: Partial<Record<TrancheId, { k: number; size: number; backup?: boolean }>> = {};

  const ratioAt = (k: number) => (P.vix[k] != null && P.vix3m[k] != null ? (P.vix[k] as number) / (P.vix3m[k] as number) : null);
  let snap: { veto: boolean; volVote: boolean; decelVote: boolean; votes: number; spDd: Num; ndxDd: Num; ratio: Num; boll: boolean; recover: Num } | null = null;
  const checksAt: Partial<Record<TrancheId, Check[]>> = {};

  for (let k = 0; k <= D; k++) {
    const p = px[k];
    if (p == null) continue;
    const spDd = pctDd(P.spx[k], P.spMax[k]);
    const ndxDd = dual ? pctDd(P.qqq[k], P.qMax[k]) : null;
    const permitSp = spDd != null && spDd <= C.sp.permit;
    const permitNdx = ndxDd != null && ndxDd <= C.ndx.permit;
    const permit = permitSp || (dual && permitNdx);

    // Episodio: abre con permiso; cierra al recuperar el máximo previo o volver a máximos de 12 meses en las rutas.
    if (open) {
      const atHighs = (spDd ?? -1) >= 0 && (!dual || (ndxDd ?? -1) >= 0);
      if (p >= peak || atHighs) {
        lastEp = { start: s.dates[start], end: s.dates[k], ddMax };
        opts.onEpisodeEnd?.(summarize(s.dates[k]));
        open = false; slopeMin = 0; for (const id of Object.keys(fired)) delete fired[id as TrancheId];
      }
    }
    if (!open && permit) {
      open = true; start = k;
      peak = (route === 'voo' ? P.spMax[k] : P.qMax[k]) ?? p;
      peakIdx = k; for (let j = k; j >= Math.max(0, k - W12); j--) if (px[j] === peak) { peakIdx = j; break; }
      minP = Infinity; ddMax = 0; spDdMax = 0; ndxDdMax = 0; slopeMin = 0;
    }
    if (open) {
      if (p < minP) { minP = p; minIdx = k; }
      ddMax = Math.min(ddMax, (p / peak - 1) * 100);
      if (spDd != null) spDdMax = Math.min(spDdMax, spDd);
      if (ndxDd != null) ndxDdMax = Math.min(ndxDdMax, ndxDd);
      sectorOnly = dual && ndxDdMax <= C.ndx.permit && spDdMax > C.sp.permit;
    }

    // Veto de crédito: HY OAS en su máximo de 63 días y sobre su SMA20.
    const oas = P.oas[k];
    const veto = oas != null && P.oasMax63[k] != null && P.oasSma20[k] != null && oas >= (P.oasMax63[k] as number) && oas > (P.oasSma20[k] as number);
    // Crisis de crédito: T1–T3 esperan alivio del crédito o un BHT bajo (CREDIT_CFG).
    const cr = useCredit ? creditAt(P, k) : null;
    const bk = s.bht?.[k] ?? null;
    const creditChecks: Check[] = cr?.crisis ? [{ key: 'creditEase', ok: cr.easing || (bk != null && bk <= CREDIT_CFG.bhtMax), value: cr.fromMax63, need: -CREDIT_CFG.ease * 100 }] : [];

    // Voto de volatilidad (corrección 1: se anula si el ratio vuelve a pasar de 1). Sin VIX3M: respaldo con niveles de VIX.
    const ratio = ratioAt(k);
    let volVote = false;
    if (ratio != null) {
      if (volPeakDrop != null) {
        // Variante por caída desde el pico: se arma al pasar volArm; se activa al caer volPeakDrop desde el pico de la ola;
        // un nuevo pico mayor que el que la activó la anula y la vuelve a armar.
        const fresh = volOnAt < 0 || k - volOnAt >= C.volWindow;
        if (!armed && ratio > volArm && (fresh || ratio > armPeak)) { armed = true; armedAt = k; volOnAt = -1; armPeak = ratio; }
        if (armed) { armPeak = Math.max(armPeak, ratio); if (ratio <= armPeak * (1 - volPeakDrop)) { volOnAt = k; armed = false; } }
      } else {
        if (ratio > volArm) { armed = true; armedAt = k; volOnAt = -1; }
        else if (armed && ratio < volRelease) { volOnAt = k; armed = false; }
        if (ratio > volCancel) volOnAt = -1;
      }
    } else {
      const v = P.vix[k], m10 = P.vixMax10[k];
      if (v != null && m10 != null) {
        if (v >= m10 && m10 >= 25) { armed = true; armedAt = k; volOnAt = -1; }
        else if (armed && v <= 0.75 * m10) { volOnAt = k; armed = false; }
      }
    }
    // Señal por nivel (modo híbrido): VIX ≥25% debajo de su máximo de 20 días, si ese máximo fue ≥25; se anula con un nuevo máximo.
    if (volMode === 'hybrid') {
      const v = P.vix[k], m20 = P.vixMax20[k];
      if (v != null && m20 != null) {
        if (v >= m20) lvlOnAt = -1;
        else if (m20 >= 25 && v <= 0.75 * m20 && lvlOnAt < 0 && (lvlMaxBht == null || (s.bht?.[k] ?? 100) < lvlMaxBht)) lvlOnAt = k;
      }
    }
    const ratioOn = volOnAt >= 0 && k - volOnAt < C.volWindow, lvlOn = lvlOnAt >= 0 && k - lvlOnAt < C.volWindow;
    volVote = ratioOn || lvlOn;
    if (k === D) volSignal = ratioOn ? 'ratio' : lvlOn ? 'level' : null;

    // Voto de desaceleración: curvatura de la EMA50 con filtro de magnitud, o reingreso a la banda de Bollinger −2σ.
    const S = P.slope[k], Cv = P.curv[k];
    curvRun = Cv != null && Cv > 0 ? curvRun + 1 : 0;
    if (S != null && open) slopeMin = Math.min(slopeMin, S);
    // Recuperación de la pendiente solo dentro de un episodio (su mínimo se reinicia al abrir y al cerrar).
    const recover = open && S != null && slopeMin < 0 ? (S - slopeMin) / -slopeMin : null;
    const curvVote = S != null && curvRun >= 3 && slopeMin <= C.decelSmin && (recover ?? 0) >= C.decelRecover && S < 0;
    const lo = P.lower[k], loPrev = k > 0 ? P.lower[k - 1] : null, pPrev = k > 0 ? px[k - 1] : null;
    if (lo != null && loPrev != null && pPrev != null && pPrev < loPrev && p > lo) bollAt = k;
    // Se anula si el precio vuelve a cerrar debajo de la banda (como la corrección 1 con el ratio de volatilidad).
    else if (lo != null && p < lo) bollAt = -1;
    const boll = bollAt >= 0 && k - bollAt < 10;
    const decelVote = curvVote || boll;
    const votes = (volVote ? 1 : 0) + (decelVote ? 1 : 0);

    if (open) {
      const spd = spDd ?? 0, nd = ndxDd ?? 0;
      // T0 · capitulación (una vez por episodio)
      const panic = ratio != null ? ratio > C.t0Ratio : P.vix[k] != null && P.vixSma20[k] != null && (P.vix[k] as number) > 35 && (P.vix[k] as number) >= 1.5 * (P.vixSma20[k] as number);
      const sp10 = P.spx[k - 10] != null && P.spx[k] != null ? ((P.spx[k] as number) / (P.spx[k - 10] as number) - 1) * 100 : null;
      const nd10 = dual && P.qqq[k - 10] != null && P.qqq[k] != null ? ((P.qqq[k] as number) / (P.qqq[k - 10] as number) - 1) * 100 : null;
      const t0 = [
        { key: 'depth', ok: spd <= C.sp.t0Depth || (dual && nd <= C.ndx.t0Depth), value: dual ? nd : spd, need: dual ? C.ndx.t0Depth : C.sp.t0Depth },
        { key: 'speed', ok: (sp10 ?? 0) <= C.sp.t0Speed || (dual && (nd10 ?? 0) <= C.ndx.t0Speed), value: dual ? nd10 : sp10, need: dual ? C.ndx.t0Speed : C.sp.t0Speed },
        { key: 'panic', ok: panic, value: ratio, need: C.t0Ratio },
        { key: 'credit', ok: oas != null && oas < C.t0Oas, value: oas, need: C.t0Oas },
      ];
      // T1 · pánico terminando
      const sectorNow = dual && permitNdx && !permitSp;
      const t1 = [
        { key: 'permit', ok: permit, value: dual ? nd : spd, need: dual ? C.ndx.permit : C.sp.permit },
        { key: 'noVeto', ok: !veto },
        ...creditChecks,
        { key: 'volVote', ok: volVote },
        ...(sectorNow && sectorRule === 'extraVote' ? [{ key: 'extraVote', ok: decelVote }] : []),
      ];
      // T2 · desaceleración confirmada (caída alcanzada en el episodio)
      const t2 = [
        { key: 'afterT1', ok: !!fired.T1 && k - fired.T1.k >= C.minGapT2, value: fired.T1 ? k - fired.T1.k : null, need: C.minGapT2 },
        { key: 'ddReached', ok: spDdMax <= C.sp.t2 || (dual && ndxDdMax <= C.ndx.t2), value: dual ? ndxDdMax : spDdMax, need: dual ? C.ndx.t2 : C.sp.t2 },
        { key: 'noVeto', ok: !veto },
        ...creditChecks,
        { key: 'votes2', ok: votes >= 2, value: votes, need: 2 },
      ];
      // T3 · validación: retest del mínimo con votos, o respaldo de 3 cierres sobre la EMA50 ascendente
      const rebounded = minIdx >= 0 && (() => { let mx = 0; for (let j = minIdx; j <= k; j++) if ((px[j] ?? 0) > mx) mx = px[j] as number; return mx >= minP * 1.08; })();
      const retest = rebounded && p <= minP * 1.03 && votes >= 1;
      const above3 = k >= 2 && [0, 1, 2].every((d) => px[k - d] != null && P.e50[k - d] != null && (px[k - d] as number) > (P.e50[k - d] as number));
      const e50Up = P.e50[k] != null && P.e50[k - 5] != null && (P.e50[k] as number) > (P.e50[k - 5] as number);
      const t3 = [
        { key: 'afterT2', ok: !!fired.T2 && k - fired.T2.k >= C.minGapT3, value: fired.T2 ? k - fired.T2.k : null, need: C.minGapT3 },
        { key: 'noVeto', ok: !veto },
        ...creditChecks,
        { key: 'retestOrEma', ok: retest || (above3 && e50Up), value: retest ? 'retest' : above3 && e50Up ? 'ema50' : null },
      ];
      // T4 · valuación profunda (independiente)
      const capeOk = s.cape[k] != null && s.capeMedian20[k] != null && (s.cape[k] as number) < (s.capeMedian20[k] as number);
      const oasOff = oas != null && P.oasMax252[k] != null && oas <= (P.oasMax252[k] as number) * (1 - C.t4OasOff);
      const t4 = [
        { key: 'ddReached', ok: spDdMax <= C.sp.t4 || (dual && ndxDdMax <= C.ndx.t4), value: dual ? ndxDdMax : spDdMax, need: dual ? C.ndx.t4 : C.sp.t4 },
        { key: 'capeBelowMedian', ok: capeOk, value: s.cape[k], need: s.capeMedian20[k] },
        { key: 'oasOffHigh', ok: oasOff, value: oas != null && P.oasMax252[k] ? (oas / (P.oasMax252[k] as number) - 1) * 100 : null, need: -C.t4OasOff * 100 },
        { key: 'votes1', ok: votes >= 1, value: votes, need: 1 },
      ];
      const all = (cs: Check[]) => cs.every((c) => c.ok);
      const fire = (id: TrancheId, f: { k: number; size: number; backup?: boolean }) => { fired[id] = f; opts.onFire?.({ date: s.dates[k], id, price: p, size: f.size, backup: !!f.backup }); };
      if (!fired.T0 && all(t0)) fire('T0', { k, size: 1 });
      if (!fired.T1 && all(t1)) fire('T1', { k, size: sectorNow && sectorRule === 'half' ? 0.5 : 1 });
      if (!fired.T2 && all(t2)) fire('T2', { k, size: 1 });
      if (!fired.T3 && all(t3)) fire('T3', { k, size: 1 });
      if (!fired.T4 && all(t4)) fire('T4', { k, size: 1 });
      else if (!fired.T4 && k - start >= C.t4BackupDays && P.e200[k] != null && p > (P.e200[k] as number)) fire('T4', { k, size: 1, backup: true });
      if (k === D) Object.assign(checksAt, { T0: t0, T1: t1, T2: t2, T3: t3, T4: t4 });
    }
    if (k === D) snap = { veto, volVote, decelVote, votes, spDd, ndxDd, ratio, boll, recover };
  }

  if (open) opts.onEpisodeEnd?.(summarize(null));
  const ids: TrancheId[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
  const tranches: TrancheState[] = ids.map((id) => {
    const f = fired[id];
    const lev3x = f?.backup ? 0 : C.lev3x[id];
    const ret = (a: Num, b: Num) => (a != null && b != null && a > 0 ? (b / a - 1) * 100 : null);
    const pnl = f ? ret(px[f.k], px[D]) : null;
    const r3 = f && dual && s.tqqq ? ret(s.tqqq[f.k], s.tqqq[D]) : null;
    const pnlMix = pnl == null ? null : lev3x === 0 ? pnl : r3 != null ? (1 - lev3x) * pnl + lev3x * r3 : null;
    return {
      id, weight: C.weights[id], size: f?.size ?? 0, lev3x,
      status: f ? (f.k === D ? 'today' : 'fired') : 'pending',
      date: f ? s.dates[f.k] : null, price: f ? px[f.k] : null, backup: f?.backup, checks: checksAt[id] ?? [],
      pnl, pnlMix,
    };
  });
  let deployed = 0, leverage = 0, cost = 0;
  for (const t of tranches) if (t.status !== 'pending') {
    const w = t.weight * t.size; deployed += w; leverage += w * (1 - t.lev3x + 3 * t.lev3x); cost += w * (t.price as number);
  }
  const avgPrice = deployed > 0 ? cost / deployed : null;
  const wavg = (key: 'pnl' | 'pnlMix') => {
    const xs = tranches.filter((t) => t.status !== 'pending');
    if (!xs.length || xs.some((t) => t[key] == null)) return null;
    const w = xs.reduce((a, t) => a + t.weight * t.size, 0);
    return xs.reduce((a, t) => a + t.weight * t.size * (t[key] as number), 0) / w;
  };
  const captured = open && avgPrice != null && peak > minP ? ((peak - avgPrice) / (peak - minP)) * 100 : null;
  const sn = snap!;
  const t0Now = checksAt.T0?.every((c) => c.ok) ?? false;
  const light: TranchesResult['light'] = !open ? 'gray' : t0Now ? 'purple' : sn.veto ? 'red' : sn.votes > 0 ? 'green' : 'amber';

  return {
    date: s.dates[D], route, sectorRule, light,
    episode: open ? {
      start: s.dates[start], peakDate: s.dates[peakIdx], peak, price: px[D] as number, dd: ((px[D] as number) / peak - 1) * 100, ddMax,
      minDate: s.dates[minIdx], min: minP, days: D - start, sectorOnly,
      spDd: sn.spDd, ndxDd: sn.ndxDd, spDdMax, ndxDdMax: dual ? ndxDdMax : null,
    } : null,
    lastEpisode: open ? null : lastEp,
    today: {
      price: px[D], spDd: sn.spDd, ndxDd: sn.ndxDd, veto: sn.veto, oas: P.oas[D], oasMax63: P.oasMax63[D], oasSma20: P.oasSma20[D],
      ratio: sn.ratio, volSource: sn.ratio != null ? 'ratio' : 'fallback', volVote: sn.volVote, volArmedAt: open && armedAt >= start ? s.dates[armedAt] : null, // solo si se armó en este episodio
      volSignal, vix: P.vix[D], vixMax20: P.vixMax20[D], bht: s.bht?.[D] ?? null,
      decelVote: sn.decelVote, slope: P.slope[D] != null ? (P.slope[D] as number) * 100 : null, curv: P.curv[D] != null ? (P.curv[D] as number) * 100 : null,
      slopeMin: open ? slopeMin * 100 : null, recover: sn.recover != null ? sn.recover * 100 : null, boll: sn.boll,
      votes: sn.votes, cape: s.cape[D], capeMedian20: s.capeMedian20[D], credit: creditAt(P, D),
    },
    ath: { spx: athAt(s.dates, P.spx, D), qqq: dual ? athAt(s.dates, P.qqq, D) : null, tqqq: dual && s.tqqq ? athAt(s.dates, s.tqqq, D) : null },
    tranches, deployed, leverage, avgPrice, captured, pnl: wavg('pnl'), pnlMix: wavg('pnlMix'),
  };
}

/** Mediana de 20 años del CAPE para cada día: mediana de los 240 meses previos (un mes de rezago). */
export function capeMedian20(dates: string[], monthly: Map<string, number>): (number | null)[] {
  const months = [...monthly.keys()].sort();
  const medByMonth = new Map<string, number>();
  for (let i = 240; i <= months.length; i++) {
    const win = months.slice(i - 240, i).map((m) => monthly.get(m)!).sort((a, b) => a - b);
    const mid = win.length / 2;
    const med = win.length % 2 ? win[Math.floor(mid)] : (win[mid - 1] + win[mid]) / 2;
    // mediana disponible desde el mes siguiente al último del window
    const [y, m] = months[i - 1].split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    medByMonth.set(next, med);
  }
  let last: number | null = null;
  const sortedMed = [...medByMonth.keys()].sort();
  let j = 0;
  return dates.map((d) => {
    const ym = d.slice(0, 7);
    while (j < sortedMed.length && sortedMed[j] <= ym) { last = medByMonth.get(sortedMed[j])!; j++; }
    return last;
  });
}

type Rows = Array<{ d: string; v: unknown }>;
/** Serie diaria del módulo desde la BD (la usan el servicio y prisma/validate-tranches.ts): S&P 500, QQQ empalmado
 *  (historical_prices desde 1999 + bt_market_data), VIX (+ provisional ^VIX), VIX3M, HY OAS, CAPE diario y mensual. */
export async function loadTrancheSeries(query: (sql: string) => Promise<Rows>): Promise<TrancheSeries> {
  const toMap = (r: Rows) => new Map(r.filter((x) => x.v != null).map((x) => [x.d, Number(x.v)] as [string, number]));
  const md = (t: string) => query(`SELECT date::text AS d, close AS v FROM bt_market_data WHERE ticker = '${t}' AND date >= '1989-01-01'`).then(toMap);
  const [spx, vixF, vixY, vix3m, oasBaa, tqqq, qOld, qNew, capeD, capeM, bht] = await Promise.all([
    md('^GSPC'), md('VIXCLS'), md('^VIX'), md('^VIX3M'), md(CREDIT_BASE), md('TQQQ'),
    query(`SELECT h.date::text AS d, h.close AS v FROM historical_prices h JOIN tickers t ON t.id = h.ticker_id WHERE t.symbol = 'QQQ'`).then(toMap),
    md('QQQ'),
    query(`SELECT date::text AS d, cape AS v FROM bt_shiller_daily`).then(toMap),
    query(`SELECT h.date::text AS d, h.value AS v FROM indicator_histories h JOIN indicators i ON i.id = h.indicator_id WHERE i.key = 'schiller_pe'`).then(toMap),
    query(`SELECT date::text AS d, value AS v FROM bt_thermo_history`).then(toMap),
  ]);
  const vix = withProvisional(vixF, vixY);
  const oas = creditFromBaa(oasBaa)!; // serie de crédito del modelo (1.913477 × BAA10Y)
  const qqq = spliceSeries(qOld, qNew);
  const dates = [...spx.keys()].filter((d) => d >= '1990-01-02').sort();
  // CAPE mensual: Shiller (desde 1881) y, después de su último mes, el CAPE diario de cierre de mes.
  const monthly = new Map<string, number>();
  for (const [d, v] of capeM) monthly.set(d.slice(0, 7), v);
  const lastM = [...monthly.keys()].sort().pop() ?? '';
  for (const [d, v] of [...capeD].sort((a, b) => a[0].localeCompare(b[0]))) if (d.slice(0, 7) > lastM) monthly.set(d.slice(0, 7), v);
  const at = (m: Map<string, number>) => dates.map((d) => m.get(d) ?? null);
  return { dates, spx: at(spx), qqq: at(qqq), tqqq: at(tqqq), bht: at(bht), vix: at(vix), vix3m: at(vix3m), oas: at(oas), cape: at(capeD), capeMedian20: capeMedian20(dates, monthly) };
}

// ── Tranches de VENTA ─────────────────────────────────────────────────────────────────────────────────────────────
// Escalera de 5 ventas (espejo de la compra), estudiada 1993–2026 sobre S&P 500 y QQQ:
//  V1 Codicia BHT ≥ 70 (15%) · V2 Codicia extrema BHT ≥ 75 (20%) · V3 Euforia BHT ≥ 80 (20%): ventas por valuación que
//  esperan la primera debilidad (precio ≥3% bajo su máximo de 20 días) y 15 sesiones entre ellas.
//  V4 Primera grieta: BHT ≥ 70 y cierre bajo la SMA50 (20%). V5 Tendencia rota: 3 cierres bajo la SMA200 con BHT ≥ 60, o
//  Death Cross con BHT ≥ 55 (25%; solo después de otra venta). Una venta por día. Cada venta saca primero el 3× que quede
//  (así el apalancamiento de lo que queda siempre baja).
//  Ciclo: abre la primera vez que el BHT llega a 70; se reinicia tras 20 sesiones con BHT < 55 (la recompra la gobierna
//  el módulo de compra). Con el filtro de debilidad: S&P vendió a ~11% del techo posterior y evitó 24% de caída
//  (vs 13% y 23% sin filtro); QQQ 15% y 40% (vs 18% y 38%).
export type SellId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5';
export const SELL_CFG = {
  weights: { V1: 0.15, V2: 0.2, V3: 0.2, V4: 0.2, V5: 0.25 } as Record<SellId, number>,
  /** Parte que sale del 3× en cada venta (el resto del 1×); si ya no queda 3×, sale del 1×. */
  from3x: { V1: 1, V2: 1, V3: 1, V4: 1, V5: 1 } as Record<SellId, number>,
  bht: { V1: 70, V2: 75, V3: 80, V4: 70, V5: 60, V5dc: 55 }, pullback: 0.97, gap: 15, resetBht: 55, resetDays: 20,
  /** Posición de partida: la escalera de compra completa (1× 65.5% · 3× 34.5% del capital). */
  start1x: 0.655, start3x: 0.345,
};
export type SellState = {
  id: SellId; weight: number; from3x: number; status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null;
  /** % de cambio del precio desde la venta (negativo = la venta evitó esa caída). */
  pnl: number | null; checks: Check[];
};
export type SellResult = {
  date: string; route: TrancheRoute; active: boolean; light: 'gray' | 'amber' | 'orange' | 'red';
  cycle: null | { start: string; days: number; peak: number; peakDate: string; fromPeak: number };
  lastCycle: null | { start: string; end: string };
  today: { price: number | null; bht: number | null; hi20: number | null; fromHi20: number | null; sma50: number | null; sma200: number | null; below200days: number; deathCross: boolean; weak: boolean; credit: CreditState };
  /** El ciclo abrió (o sigue) por crisis de crédito y no por valuación. */
  creditCycle: boolean;
  tranches: SellState[]; sold: number; leverage: number; avgPrice: number | null; pnl: number | null;
};

/** Venta histórica de la escalera (para marcarla en la gráfica). credit: el ciclo lo abrió la crisis de crédito. */
export type SellEvent = { date: string; id: SellId; price: number; credit: boolean };
export function computeSellTranches(P: PreparedTranches, date: string, onSale?: (e: SellEvent) => void): SellResult | null {
  const { s, route, px } = P;
  let D = -1;
  for (let k = s.dates.length - 1; k >= 0; k--) if (s.dates[k] <= date) { D = k; break; }
  if (D < 0 || px[D] == null) return null;
  const C = SELL_CFG;
  const bht = ffill(s.bht ?? s.dates.map(() => null));
  const s50 = sma(px, 50), s200 = sma(px, 200), hi20 = rollingMax(px, 20);
  let open = false, start = -1, low = 0, lastVal = -999, peak = 0, peakIdx = -1, below = 0, calm = 0, creditCycle = false;
  let lastCycle: SellResult['lastCycle'] = null;
  const fired: Partial<Record<SellId, number>> = {};
  let checksAt: Partial<Record<SellId, Check[]>> = {};
  let snap: SellResult['today'] | null = null;
  for (let k = 0; k <= D; k++) {
    const p = px[k], b = bht[k];
    if (p == null) continue;
    below = s200[k] != null && p < (s200[k] as number) ? below + 1 : 0;
    low = b != null && b < C.resetBht ? low + 1 : 0;
    // Crisis de crédito (divergencia crédito-bolsa, CREDIT_CFG): abre ciclo y quita el filtro de BHT a V4/V5.
    const st = P.credDiv[k];
    calm = st ? 0 : calm + 1;
    if (open && low >= C.resetDays && calm >= C.resetDays) { lastCycle = { start: s.dates[start], end: s.dates[k] }; open = false; creditCycle = false; for (const id of Object.keys(fired)) delete fired[id as SellId]; }
    if (!open && ((b != null && b >= C.bht.V1) || st)) { open = true; start = k; peak = 0; lastVal = -999; creditCycle = st && !(b != null && b >= C.bht.V1); }
    if (open && st) creditCycle = creditCycle || Object.keys(fired).length === 0;
    if (open && p > peak) { peak = p; peakIdx = k; }
    const weak = hi20[k] != null && p <= C.pullback * (hi20[k] as number);
    const dc = s50[k] != null && s200[k] != null && k > 0 && s50[k - 1] != null && s200[k - 1] != null && (s50[k] as number) < (s200[k] as number) && (s50[k - 1] as number) >= (s200[k - 1] as number);
    const spaced = k - lastVal >= C.gap;
    const bv = b ?? 0;
    if (open) {
      const anyFired = Object.keys(fired).length > 0;
      const cs: Record<SellId, Check[]> = {
        V1: [{ key: 'bht', ok: bv >= C.bht.V1, value: b, need: C.bht.V1 }, { key: 'weak', ok: weak, value: hi20[k] ? (p / (hi20[k] as number) - 1) * 100 : null, need: -3 }, { key: 'gap', ok: spaced }],
        V2: [{ key: 'bht', ok: bv >= C.bht.V2, value: b, need: C.bht.V2 }, { key: 'weak', ok: weak, value: hi20[k] ? (p / (hi20[k] as number) - 1) * 100 : null, need: -3 }, { key: 'gap', ok: spaced }],
        V3: [{ key: 'bht', ok: bv >= C.bht.V3, value: b, need: C.bht.V3 }, { key: 'weak', ok: weak, value: hi20[k] ? (p / (hi20[k] as number) - 1) * 100 : null, need: -3 }, { key: 'gap', ok: spaced }],
        V4: [{ key: st ? 'creditStress' : 'bht', ok: bv >= C.bht.V4 || st, value: b, need: C.bht.V4 }, { key: 'below50', ok: s50[k] != null && p < (s50[k] as number), value: s50[k] ? (p / (s50[k] as number) - 1) * 100 : null }],
        V5: [{ key: 'trendBroken', ok: (below >= 3 && (bv >= C.bht.V5 || st)) || (dc && (bv >= C.bht.V5dc || st)), value: below, need: 3 }, { key: st ? 'creditStress' : 'afterSale', ok: anyFired || st }],
      };
      for (const id of ['V1', 'V2', 'V3', 'V4', 'V5'] as SellId[]) {
        if (fired[id] == null && cs[id].every((c) => c.ok)) { fired[id] = k; if (id === 'V1' || id === 'V2' || id === 'V3') lastVal = k; onSale?.({ date: s.dates[k], id, price: p, credit: creditCycle }); break; }
      }
      if (k === D) checksAt = cs;
    }
    if (k === D) snap = {
      price: p, bht: b, hi20: hi20[k], fromHi20: hi20[k] ? (p / (hi20[k] as number) - 1) * 100 : null, sma50: s50[k], sma200: s200[k],
      below200days: below, deathCross: s50[k] != null && s200[k] != null && (s50[k] as number) < (s200[k] as number), weak, credit: creditAt(P, k),
    };
  }
  const ids: SellId[] = ['V1', 'V2', 'V3', 'V4', 'V5'];
  const tranches: SellState[] = ids.map((id) => {
    const k = fired[id];
    return {
      id, weight: C.weights[id], from3x: C.from3x[id], status: k == null ? 'pending' : k === D ? 'today' : 'fired',
      date: k != null ? s.dates[k] : null, price: k != null ? px[k] : null,
      pnl: k != null && px[k] ? ((px[D] as number) / (px[k] as number) - 1) * 100 : null, checks: checksAt[id] ?? [],
    };
  });
  // Lo que queda: se vende primero el 3× (V1–V3) y, si ya no queda, del 1×.
  let one = C.start1x, three = C.start3x, sold = 0, cost = 0;
  for (const t of tranches) if (t.status !== 'pending') {
    const w = t.weight; let from3 = Math.min(three, w * t.from3x); let from1 = Math.min(one, w - from3); from3 += Math.min(three - from3, w - from3 - from1);
    three -= from3; one -= from1; sold += w; cost += w * (t.price as number);
  }
  const left = one + three;
  const avgPrice = sold > 0 ? cost / sold : null;
  const firedN = tranches.filter((t) => t.status !== 'pending').length;
  const light: SellResult['light'] = !open ? 'gray' : tranches[4].status !== 'pending' ? 'red' : firedN >= 2 ? 'orange' : 'amber';
  return {
    date: s.dates[D], route, active: open, light,
    cycle: open ? { start: s.dates[start], days: D - start, peak, peakDate: s.dates[peakIdx], fromPeak: ((px[D] as number) / peak - 1) * 100 } : null,
    lastCycle: open ? null : lastCycle, creditCycle: open && creditCycle,
    today: snap!, tranches, sold, leverage: left > 0 ? (one + 3 * three) / left : 0, avgPrice,
    pnl: avgPrice != null ? ((px[D] as number) / avgPrice - 1) * 100 : null,
  };
}
