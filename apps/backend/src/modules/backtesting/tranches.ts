// Módulo de Reentrada por Tranches (MRT v1.3, BackTesting/docs/BuyHoldTime_Modulo_Reentrada_v1.3.md), adaptado:
//  - Permiso por caída del PRECIO contra su máximo de 12 meses (el doc usa la del CAPE, que en semanas casi coincide).
//  - Volatilidad = estructura de plazos VIX/VIX3M en las dos rutas (no existe un VXN a 3 meses para formar el ratio);
//    antes de 2007 (sin VIX3M), el respaldo del doc con niveles de VIX.
//  - T4: CAPE debajo de su mediana de 20 años (mensual, con un mes de rezago).
//  - Sin voto de amplitud (no hay % de acciones sobre su SMA50).
// Ruta 'voo' = S&P 500 (VOO/UPRO); ruta 'qqq' = Nasdaq-100 con QQQ como proxy (QQQ/TQQQ), permiso dual con el S&P.
// Se recorre día a día desde el inicio de la serie hasta la fecha pedida: así se sabe cuándo se disparó cada tranche.

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
  vix: (number | null)[];
  vix3m: (number | null)[];
  oas: (number | null)[];
  cape: (number | null)[];
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
  decelSmin: -0.015, decelRecover: 0.5, minGapT2: 5, minGapT3: 10, t4OasOff: 0.15, t4BackupDays: 252,
};

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

export type Check = { key: string; ok: boolean; value?: number | string | null; need?: number | string | null };
export type TrancheState = {
  id: TrancheId; weight: number; size: number; lev3x: number;
  status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null; backup?: boolean; checks: Check[];
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
    decelVote: boolean; slope: number | null; curv: number | null; slopeMin: number | null; recover: number | null; boll: boolean;
    votes: number; cape: number | null; capeMedian20: number | null;
  };
  tranches: TrancheState[];
  deployed: number; leverage: number; avgPrice: number | null; captured: number | null;
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
  const vixMax10 = rollingMax(vix, 10), vixSma20 = sma(vix, 20);
  return { s, route, spx, qqq, vix, vix3m, oas, px, spMax, qMax, e50, e200, slope, curv, lower, oasMax63, oasSma20, oasMax252, vixMax10, vixSma20 };
}
export type PreparedTranches = ReturnType<typeof prepareTranches>;

export function computeTranches(P: PreparedTranches, date: string, sectorRule: SectorRule = 'half'): TranchesResult | null {
  const { s, route, px } = P;
  let D = -1;
  for (let k = s.dates.length - 1; k >= 0; k--) if (s.dates[k] <= date) { D = k; break; }
  if (D < 0 || px[D] == null) return null;
  const C = TRANCHE_CFG;
  const dual = route === 'qqq';

  // Estado
  let open = false, start = -1, peak = 0, peakIdx = -1, minP = Infinity, minIdx = -1, ddMax = 0, spDdMax = 0, ndxDdMax = 0, sectorOnly = false;
  let lastEp: TranchesResult['lastEpisode'] = null;
  let armed = false, volOnAt = -1, armedAt = -1;
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
        open = false; for (const id of Object.keys(fired)) delete fired[id as TrancheId];
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

    // Voto de volatilidad (corrección 1: se anula si el ratio vuelve a pasar de 1). Sin VIX3M: respaldo con niveles de VIX.
    const ratio = ratioAt(k);
    let volVote = false;
    if (ratio != null) {
      if (ratio > C.volArm) { armed = true; armedAt = k; volOnAt = -1; }
      else if (armed && ratio < 1) { volOnAt = k; armed = false; }
      if (ratio > 1) volOnAt = -1;
    } else {
      const v = P.vix[k], m10 = P.vixMax10[k];
      if (v != null && m10 != null) {
        if (v >= m10 && m10 >= 25) { armed = true; armedAt = k; volOnAt = -1; }
        else if (armed && v <= 0.75 * m10) { volOnAt = k; armed = false; }
      }
    }
    volVote = volOnAt >= 0 && k - volOnAt < C.volWindow;

    // Voto de desaceleración: curvatura de la EMA50 con filtro de magnitud, o reingreso a la banda de Bollinger −2σ.
    const S = P.slope[k], Cv = P.curv[k];
    curvRun = Cv != null && Cv > 0 ? curvRun + 1 : 0;
    if (S != null && open) slopeMin = Math.min(slopeMin, S);
    const recover = S != null && slopeMin < 0 ? (S - slopeMin) / -slopeMin : null;
    const curvVote = S != null && curvRun >= 3 && slopeMin <= C.decelSmin && (recover ?? 0) >= C.decelRecover && S < 0;
    const lo = P.lower[k], loPrev = k > 0 ? P.lower[k - 1] : null, pPrev = k > 0 ? px[k - 1] : null;
    if (lo != null && loPrev != null && pPrev != null && pPrev < loPrev && p > lo) bollAt = k;
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
        { key: 'volVote', ok: volVote },
        ...(sectorNow && sectorRule === 'extraVote' ? [{ key: 'extraVote', ok: decelVote }] : []),
      ];
      // T2 · desaceleración confirmada (caída alcanzada en el episodio)
      const t2 = [
        { key: 'afterT1', ok: !!fired.T1 && k - fired.T1.k >= C.minGapT2, value: fired.T1 ? k - fired.T1.k : null, need: C.minGapT2 },
        { key: 'ddReached', ok: spDdMax <= C.sp.t2 || (dual && ndxDdMax <= C.ndx.t2), value: dual ? ndxDdMax : spDdMax, need: dual ? C.ndx.t2 : C.sp.t2 },
        { key: 'noVeto', ok: !veto },
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
      if (!fired.T0 && all(t0)) fired.T0 = { k, size: 1 };
      if (!fired.T1 && all(t1)) fired.T1 = { k, size: sectorNow && sectorRule === 'half' ? 0.5 : 1 };
      if (!fired.T2 && all(t2)) fired.T2 = { k, size: 1 };
      if (!fired.T3 && all(t3)) fired.T3 = { k, size: 1 };
      if (!fired.T4 && all(t4)) fired.T4 = { k, size: 1 };
      else if (!fired.T4 && k - start >= C.t4BackupDays && P.e200[k] != null && p > (P.e200[k] as number)) fired.T4 = { k, size: 1, backup: true };
      if (k === D) Object.assign(checksAt, { T0: t0, T1: t1, T2: t2, T3: t3, T4: t4 });
    }
    if (k === D) snap = { veto, volVote, decelVote, votes, spDd, ndxDd, ratio, boll, recover };
  }

  const ids: TrancheId[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
  const tranches: TrancheState[] = ids.map((id) => {
    const f = fired[id];
    const lev3x = f?.backup ? 0 : C.lev3x[id];
    return {
      id, weight: C.weights[id], size: f?.size ?? 0, lev3x,
      status: f ? (f.k === D ? 'today' : 'fired') : 'pending',
      date: f ? s.dates[f.k] : null, price: f ? px[f.k] : null, backup: f?.backup, checks: checksAt[id] ?? [],
    };
  });
  let deployed = 0, leverage = 0, cost = 0;
  for (const t of tranches) if (t.status !== 'pending') {
    const w = t.weight * t.size; deployed += w; leverage += w * (1 - t.lev3x + 3 * t.lev3x); cost += w * (t.price as number);
  }
  const avgPrice = deployed > 0 ? cost / deployed : null;
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
      ratio: sn.ratio, volSource: sn.ratio != null ? 'ratio' : 'fallback', volVote: sn.volVote, volArmedAt: armedAt >= 0 ? s.dates[armedAt] : null,
      decelVote: sn.decelVote, slope: P.slope[D] != null ? (P.slope[D] as number) * 100 : null, curv: P.curv[D] != null ? (P.curv[D] as number) * 100 : null,
      slopeMin: open ? slopeMin * 100 : null, recover: sn.recover != null ? sn.recover * 100 : null, boll: sn.boll,
      votes: sn.votes, cape: s.cape[D], capeMedian20: s.capeMedian20[D],
    },
    tranches, deployed, leverage, avgPrice, captured,
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
  const [spx, vixF, vixY, vix3m, oas, qOld, qNew, capeD, capeM] = await Promise.all([
    md('^GSPC'), md('VIXCLS'), md('^VIX'), md('^VIX3M'), md('BAMLH0A0HYM2'),
    query(`SELECT h.date::text AS d, h.close AS v FROM historical_prices h JOIN tickers t ON t.id = h.ticker_id WHERE t.symbol = 'QQQ'`).then(toMap),
    md('QQQ'),
    query(`SELECT date::text AS d, cape AS v FROM bt_shiller_daily`).then(toMap),
    query(`SELECT h.date::text AS d, h.value AS v FROM indicator_histories h JOIN indicators i ON i.id = h.indicator_id WHERE i.key = 'schiller_pe'`).then(toMap),
  ]);
  const vix = withProvisional(vixF, vixY);
  const qqq = spliceSeries(qOld, qNew);
  const dates = [...spx.keys()].filter((d) => d >= '1990-01-02').sort();
  // CAPE mensual: Shiller (desde 1881) y, después de su último mes, el CAPE diario de cierre de mes.
  const monthly = new Map<string, number>();
  for (const [d, v] of capeM) monthly.set(d.slice(0, 7), v);
  const lastM = [...monthly.keys()].sort().pop() ?? '';
  for (const [d, v] of [...capeD].sort((a, b) => a[0].localeCompare(b[0]))) if (d.slice(0, 7) > lastM) monthly.set(d.slice(0, 7), v);
  const at = (m: Map<string, number>) => dates.map((d) => m.get(d) ?? null);
  return { dates, spx: at(spx), qqq: at(qqq), vix: at(vix), vix3m: at(vix3m), oas: at(oas), cape: at(capeD), capeMedian20: capeMedian20(dates, monthly) };
}
