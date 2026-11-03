// Termómetro BuyHoldTime: réplica exacta de la lógica del frontend
// (IndicatorsPanel.tsx) para historificar el valor al cierre en BD.
// Bandas y pesos idénticos; subconjunto disponible por fecha.
// CAPE usa las bandas anuales de packages/bht-bands/bands.json según el año del dato.
import { capeSegsForDate } from './bht-bands';
export type Seg = [number, number, number, number];

export const CAPE_SEGS: Seg[] = [
  [-Infinity, 29, 0, 25], [29, 35, 25, 50], [35, 40, 50, 70],
  [40, 43, 70, 100], [43, Infinity, 100, 100],
];
export const PE_SEGS: Seg[] = [
  [-Infinity, 20, 0, 25], [20, 24, 25, 50], [24, 27, 50, 80],
  [27, 30, 80, 100], [30, Infinity, 100, 100],
];
export const FWD_SEGS: Seg[] = [
  [-Infinity, 15, 0, 25], [15, 19, 25, 50], [19, 22, 50, 80],
  [22, 24, 80, 100], [24, Infinity, 100, 100],
];
export const RATIO_SEGS: Seg[] = [
  [-Infinity, 0.9, 0, 20], [0.9, 1.0, 20, 50], [1.0, 1.2, 50, 90],
  [1.2, 1.3, 90, 100], [1.3, Infinity, 100, 100],
];
export const CPI_SEGS: Seg[] = [
  [-Infinity, 1.0, 0, 8], [1.0, 1.5, 8, 20], [1.5, 2.0, 20, 35], [2.0, 2.5, 35, 50],
  [2.5, 3.0, 50, 62], [3.0, 4.0, 62, 74], [4.0, 6.0, 74, 86], [6.0, 10.0, 86, 100], [10.0, Infinity, 100, 100],
];
// CPI momentum: nivel del YoY (40%) + delta vs media 6M de YoY (60%).
// Un 3.5 acelerando desde 2 pesa más que un 7 cayendo desde 9.
export const CPI_LVL_SEGS: Seg[] = [
  [-Infinity, 1.0, 0, 10], [1.0, 1.5, 10, 25], [1.5, 2.0, 25, 40],
  [2.0, 2.5, 40, 55], [2.5, 3.0, 55, 70], [3.0, 4.0, 70, 85], [4.0, Infinity, 85, 100],
];
export const CPI_TRD_SEGS: Seg[] = [
  [-Infinity, -1.5, 0, 10], [-1.5, -0.5, 10, 30], [-0.5, 0.0, 30, 50],
  [0.0, 0.5, 50, 70], [0.5, 1.5, 70, 90], [1.5, Infinity, 90, 100],
];
export const FED_SEGS: Seg[] = [
  [-Infinity, 0.5, 0, 8], [0.5, 1.5, 8, 20], [1.5, 2.5, 20, 35], [2.5, 3.5, 35, 50],
  [3.5, 4.5, 50, 62], [4.5, 5.5, 62, 74], [5.5, 7.0, 74, 86], [7.0, 12.0, 86, 100], [12.0, Infinity, 100, 100],
];
// Y2M (2Y Momentum): combina nivel del Treasury 2Y (40%) con su delta vs
// media móvil 6M (60%). El 2Y descuenta la política Fed meses antes del anuncio.
export const Y2M_LVL_SEGS: Seg[] = [
  [-Infinity, 1.5, 0, 15], [1.5, 2.5, 15, 30], [2.5, 3.5, 30, 50],
  [3.5, 4.5, 50, 70], [4.5, 5.5, 70, 88], [5.5, Infinity, 88, 100],
];
export const Y2M_TRD_SEGS: Seg[] = [
  [-Infinity, -1.0, 0, 10], [-1.0, -0.4, 10, 30], [-0.4, 0.0, 30, 50],
  [0.0, 0.4, 50, 70], [0.4, 1.0, 70, 90], [1.0, Infinity, 90, 100],
];
export const Y30_SEGS: Seg[] = [
  [-Infinity, 2.0, 0, 8], [2.0, 3.0, 8, 20], [3.0, 3.5, 20, 35], [3.5, 4.0, 35, 50],
  [4.0, 4.5, 50, 62], [4.5, 5.0, 62, 74], [5.0, 6.0, 74, 86], [6.0, 10.0, 86, 100], [10.0, Infinity, 100, 100],
];
// Y30M (30Y Momentum): mismo esquema que Y2M — nivel del Treasury 30Y (40%) +
// delta vs MA6M (60%), con la misma regla de tendencia. Si los bonos se aceleran
// al alza, frenan economía y liquidez.
export const Y30M_LVL_SEGS: Seg[] = [
  [-Infinity, 2.0, 0, 15], [2.0, 3.0, 15, 30], [3.0, 3.5, 30, 50],
  [3.5, 4.0, 50, 70], [4.0, 5.0, 70, 88], [5.0, Infinity, 88, 100],
];
export const HY_SEGS: Seg[] = [
  [-Infinity, 3.0, 0, 12], [3.0, 3.5, 12, 25], [3.5, 4.0, 25, 38], [4.0, 5.0, 38, 55],
  [5.0, 6.5, 55, 68], [6.5, 8.0, 68, 80], [8.0, 11.0, 80, 90], [11.0, Infinity, 90, 100],
];
export const MG_SEGS: Seg[] = [
  [-Infinity, 2.0, 0, 20], [2.0, 3.0, 20, 50], [3.0, 4.0, 50, 70],
  [4.0, 4.5, 70, 85], [4.5, 5.0, 85, 100], [5.0, Infinity, 100, 100],
];
// MG momentum: nivel del ratio (40%) + desvío vs MA24M del ratio (60%).
export const MG_TRD_SEGS: Seg[] = [
  [-Infinity, -0.9, 0, 10], [-0.9, -0.5, 10, 30], [-0.5, -0.15, 30, 50],
  [-0.15, 0.15, 50, 50], [0.15, 0.5, 50, 70], [0.5, 0.9, 70, 90], [0.9, Infinity, 90, 100],
];
export const VIX_SEGS: Seg[] = [
  [-Infinity, 12, 90, 100], [12, 15, 78, 90], [15, 20, 60, 78], [20, 25, 35, 60], [25, 30, 10, 35], [30, Infinity, 0, 10],
];
// Fear & Greed estirado: el índice rara vez toca 0/100; ≤10 => 0 y ≥80 => 100, centro intacto.
export const FG_SEGS: Seg[] = [
  [-Infinity, 10, 0, 0], [10, 15, 0, 8], [15, 25, 8, 25], [25, 45, 25, 45],
  [45, 55, 45, 60], [55, 70, 60, 85], [70, 80, 85, 100], [80, Infinity, 100, 100],
];
export function fgScore(v: number): number {
  return bandScore(FG_SEGS, v);
}
export const MS_SEGS: Seg[] = [
  [-Infinity, 3.5, 0, 8], [3.5, 4.5, 8, 20], [4.5, 5.5, 20, 35], [5.5, 6.5, 35, 50],
  [6.5, 7.5, 50, 62], [7.5, 9.0, 62, 74], [9.0, 11.0, 74, 88], [11.0, 13.0, 88, 100], [13.0, Infinity, 100, 100],
];
export const GDP_SEGS: Seg[] = [
  [-Infinity, 0, 0, 10], [0, 1.0, 10, 25], [1.0, 2.0, 25, 45], [2.0, 3.0, 45, 70],
  [3.0, 4.0, 70, 90], [4.0, Infinity, 90, 100],
];

export function bandScore(segs: Seg[], v: number): number {
  for (const [lo, hi, sLo, sHi] of segs) {
    if (v >= lo && v < hi) return sLo + (v - Math.max(lo, -1e9)) * ((sHi - sLo) / (Math.min(hi, 1e9) - Math.max(lo, -1e9) || 1));
  }
  return 100;
}

export type PriceMap = Map<string, number>;
export type Series = Record<string, PriceMap>;

export function isValidIsoDate(s: any): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s.slice(0, 10)).getTime());
}

export function getClosestPrice(map: PriceMap | undefined, isoDate: string, lookback = 7): number | null {
  if (!map || !isValidIsoDate(isoDate)) return null;
  for (let i = 0; i < lookback; i++) {
    const d = new Date(isoDate);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const v = map.get(k);
    if (v != null) return v;
  }
  return null;
}

export function getRecentPrice(map: PriceMap | undefined, isoDate: string, lookback = 7): number | null {
  const v = getClosestPrice(map, isoDate, lookback);
  if (v != null) return v;
  if (!map || map.size === 0) return null;
  let best: string | null = null;
  for (const k of map.keys()) {
    if (k <= isoDate && (best == null || k > best)) best = k;
  }
  return best ? map.get(best)! : null;
}

export function getCpiYoY(map: PriceMap | undefined, isoDate: string): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  let curDate: string | null = null;
  for (let i = 0; i < 40; i++) { const d = new Date(isoDate); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (map.has(k)) { curDate = k; break; } }
  if (!curDate) { for (const k of map.keys()) if (k <= isoDate && (curDate == null || k > curDate)) curDate = k; }
  if (!curDate) return null;
  const cur = map.get(curDate)!;
  const cd = new Date(curDate); cd.setFullYear(cd.getFullYear() - 1);
  const prevIso = cd.toISOString().slice(0, 10);
  const prev = getRecentPrice(map, prevIso, 40);
  if (prev == null || prev === 0) return null;
  return (cur / prev - 1) * 100;
}

export function getMa126(map: PriceMap | undefined, isoDate: string, n = 126, minObs = 100): number | null {
  // Media móvil de los últimos n cierres diarios <= fecha (walk de observaciones,
  // tolera fines de semana/feriados sin publicar). Null si hay menos de minObs.
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const vals: number[] = [];
  for (let i = 0; i < 400 && vals.length < n; i++) {
    const d = new Date(isoDate); d.setDate(d.getDate() - i);
    const v = map.get(d.toISOString().slice(0, 10));
    if (v != null) vals.push(v);
  }
  if (vals.length < minObs) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function y2mScore(y: number, ma: number): number {
  return 0.4 * bandScore(Y2M_LVL_SEGS, y) + 0.6 * bandScore(Y2M_TRD_SEGS, y - ma);
}

export function y30mScore(y: number, ma: number): number {
  return 0.4 * bandScore(Y30M_LVL_SEGS, y) + 0.6 * bandScore(Y2M_TRD_SEGS, y - ma);
}

export interface HyBonus { bonus: number; hy: number | null; z: number | null; d1: number | null; armed: boolean; label: string; fed: number | null }

export function fedRescue(fed: PriceMap | undefined, isoDate: string): number | null {
  // Rescate Fed (ZIRP tras recortes): efectiva <0.75 habiendo estado >0.75 en los 12M previos.
  // Umbral 0.75 (no 0.50) porque la efectiva imprime 0.52 en nov-08 ya en rescate.
  if (!fed || fed.size === 0 || !isValidIsoDate(isoDate)) return null;
  const cur = getClosestPrice(fed, isoDate, 15);
  if (cur == null || cur >= 0.75) return null;
  const b = new Date(isoDate); b.setMonth(b.getMonth() - 12);
  const cut = b.toISOString().slice(0, 10);
  let mx = -Infinity;
  for (const [k, v] of fed) if (k <= isoDate.slice(0, 10) && k >= cut && v > mx) mx = v;
  if (!(mx > 0.75)) return null;
  return cur;
}

function hyBack(map: PriceMap | undefined, isoDate: string, months: number): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const d = new Date(isoDate); d.setMonth(d.getMonth() - months);
  return getClosestPrice(map, d.toISOString().slice(0, 10), 45);
}

export function getHySigma24(map: PriceMap | undefined, isoDate: string): number | null {
  // σ de la serie mensual Δ3M en 24M (piso 0.20 para no explotar en calma total).
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const ds: number[] = [];
  const base = new Date(isoDate);
  for (let k = 0; k < 24; k++) {
    const ref = new Date(base.getFullYear(), base.getMonth() - k, 0).toISOString().slice(0, 10);
    if (ref > isoDate.slice(0, 10)) continue;
    const a = getClosestPrice(map, ref, 12);
    const b = hyBack(map, ref, 3);
    if (a != null && b != null) ds.push(a - b);
  }
  if (ds.length < 18) return null;
  const m = ds.reduce((x, y) => x + y, 0) / ds.length;
  return Math.max(0.20, Math.sqrt(ds.reduce((x, y) => x + (y - m) ** 2, 0) / ds.length));
}

export function getHyArmed(map: PriceMap | undefined, isoDate: string): boolean {
  // Complacencia: HY < P20(36M) en algún momento de los últimos 6M.
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return false;
  const vals: number[] = [];
  const base = new Date(isoDate);
  const cut = new Date(base.getFullYear() - 3, base.getMonth(), base.getDate()).toISOString().slice(0, 10);
  for (const [d, v] of map) if (d <= isoDate.slice(0, 10) && d >= cut) vals.push(v);
  if (vals.length < 500) return false;
  vals.sort((a, b) => a - b);
  const p20 = vals[Math.floor(0.2 * (vals.length - 1))];
  for (let k = 0; k < 6; k++) {
    const ref = new Date(base.getFullYear(), base.getMonth() - k, 0).toISOString().slice(0, 10);
    if (ref > isoDate.slice(0, 10)) continue;
    const v = getClosestPrice(map, ref, 12);
    if (v != null && v < p20) return true;
  }
  return false;
}

export function getHyBonus(map: PriceMap | undefined, isoDate: string, fedMap?: PriceMap): HyBonus {
  // Bonus asimétrico Régimen 3: la complacencia suma, nunca resta.
  const v = map && isValidIsoDate(isoDate) ? getClosestPrice(map, isoDate) : null;
  if (v == null) return { bonus: 0, hy: null, z: null, d1: null, armed: false, label: 'sin dato', fed: null };
  const d1v = hyBack(map, isoDate, 1);
  const d1 = d1v == null ? null : v - d1v;
  const d3v = hyBack(map, isoDate, 3);
  const d3 = d3v == null ? null : v - d3v;
  const s = getHySigma24(map, isoDate);
  const z = d3 == null || s == null || s === 0 ? null : d3 / s;
  const armed = getHyArmed(map, isoDate);
  // Tramos extremos por nivel + impulso (solo semáforo, no tocan los gatillos del Régimen 3).
  if (v > 10 && d3 != null && d3 > 0) return cap({ bonus: 35, hy: v, z, d1, armed, label: `crítico HY>10 Δ3M +${d3.toFixed(2)}`, fed: null });
  if (v > 9 && d3 != null && d3 > 0) return cap({ bonus: 30, hy: v, z, d1, armed, label: `severo HY>9 Δ3M +${d3.toFixed(2)}`, fed: null });
  if (v > 8 && d1 != null && d1 > 0) return cap({ bonus: 25, hy: v, z, d1, armed, label: `alto HY>8 Δ1M +${d1.toFixed(2)}`, fed: null });
  if (d1 != null && d1 >= 1.0) return cap({ bonus: 20, hy: v, z, d1, armed, label: `G2 Δ1M +${d1.toFixed(2)}`, fed: null });
  if (z != null && z > 1.5 && v > 5.0) return cap({ bonus: 10, hy: v, z, d1, armed, label: `G1 z ${z.toFixed(2)}`, fed: null });
  // Estrés sostenido (solo semáforo, no toca los gatillos del Régimen 3):
  // spread elevado en las 3 puntas (actual, 1M y 3M atrás) aunque no acelere.
  const m3 = d1v != null && d3v != null ? (v + d1v + d3v) / 3 : null;
  if (m3 != null && m3 >= 5.75) return { bonus: 5, hy: v, z, d1, armed, label: `sostenido ${m3.toFixed(2)}`, fed: fedRescue(fedMap, isoDate) };
  if (armed) return { bonus: 5, hy: v, z, d1, armed, label: 'armado', fed: fedRescue(fedMap, isoDate) };
  return { bonus: 0, hy: v, z, d1, armed, label: '—', fed: fedRescue(fedMap, isoDate) };
  function cap(out: HyBonus): HyBonus {
    // Tope rescate Fed: con la Fed rescatando (ZIRP tras recortes) el bonus no pasa de +5,
    // salvo que el crédito siga acelerando (Δ3M ≥ +0.5): ahí manda la protección.
    if (out.bonus > 5 && (d3 == null || d3 < 0.5)) {
      const f = fedRescue(fedMap, isoDate);
      if (f != null) return { ...out, bonus: 5, fed: f, label: `${out.label} · tope Fed` };
    }
    return { ...out, fed: fedRescue(fedMap, isoDate) };
  }
}

export function getMonthlyPct(map: PriceMap | undefined, isoDate: string, monthsBack: number): number | null {
  // % vs la fila de hace N meses (series mensuales como M2SL/BOGMBASE/CPI).
  // Base mediodía UTC: evita que getDate/getMonth locales corran el día/mes en UTC−X.
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  let anchor: string | null = null;
  for (let i = 0; i < 40; i++) { const d = new Date(isoDate + 'T12:00:00Z'); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (map.has(k)) { anchor = k; break; } }
  if (!anchor) { for (const k of map.keys()) if (k <= isoDate && (anchor == null || k > anchor)) anchor = k; }
  if (!anchor) return null;
  const a = new Date(anchor + 'T12:00:00Z'); a.setMonth(a.getMonth() - monthsBack);
  const prev = getRecentPrice(map, a.toISOString().slice(0, 10), 40);
  const cur = map.get(anchor)!;
  if (prev == null || prev === 0) return null;
  return (cur / prev - 1) * 100;
}

export interface LiqBonus { bonus: number; yoy: number | null; m0d3: number | null; drop: number | null; label: string }

export function getLiqBonus(m2map: PriceMap | undefined, m0map: PriceMap | undefined, isoDate: string, cpiMap?: PriceMap): LiqBonus {
  // Bonus simétrico de liquidez M2/M0: el viento a favor resta (oportunidad),
  // el viento en contra suma (riesgo). Prioridad: bazuca > headwind > tailwind.
  // Headwind v2: exige inflación haciendo máximos (CPI YoY >= máx 6M); si la
  // inflación ya cede, el constraint monetario se afloja aunque M2 siga débil.
  const none = (label: string): LiqBonus => ({ bonus: 0, yoy: null, m0d3: null, drop: null, label });
  if (!isValidIsoDate(isoDate)) return none('sin dato');
  const yoy = getMonthlyPct(m2map, isoDate, 12);
  if (yoy == null) return none('sin dato');
  const m0d3 = getMonthlyPct(m0map, isoDate, 3);
  const d3 = new Date(isoDate + 'T12:00:00Z');
  const tMonth = (((d3.getMonth() - 3) % 12) + 12) % 12;
  d3.setMonth(d3.getMonth() - 3);
  // Clamp anti-overflow: 31 jul −3M daría "31 abr"→1 may y corrompería yoy3.
  if (d3.getMonth() !== tMonth) d3.setDate(0); // último día del mes objetivo
  const yoy3 = getMonthlyPct(m2map, d3.toISOString().slice(0, 10), 12);
  let peak = -Infinity;
  for (let m = 0; m < 12; m++) {
    const q = new Date(isoDate + 'T12:00:00Z'); q.setDate(1); q.setMonth(q.getMonth() - m);
    const v = getMonthlyPct(m2map, q.toISOString().slice(0, 10), 12);
    if (v != null && v > peak) peak = v;
  }
  const drop = peak > 0 ? Math.max(0, (peak - yoy) / peak * 100) : 0;
  if (m0d3 != null && m0d3 > 30 && yoy > 8) return { bonus: -25, yoy, m0d3, drop, label: `megabazuca M0 Δ3M +${m0d3.toFixed(1)}% M2 +${yoy.toFixed(1)}%` };
  if (m0d3 != null && m0d3 > 5 && yoy > 8) return { bonus: -20, yoy, m0d3, drop, label: `bazuca M0 Δ3M +${m0d3.toFixed(1)}% M2 +${yoy.toFixed(1)}%` };
  if (drop >= 50) {
    const cpi = getCpiYoY(cpiMap, isoDate);
    let cpiMax: number | null = null;
    if (cpi != null) {
      for (let m = 1; m <= 6; m++) {
        const q = new Date(isoDate + 'T12:00:00Z'); q.setDate(1); q.setMonth(q.getMonth() - m);
        const v = getCpiYoY(cpiMap, q.toISOString().slice(0, 10));
        if (v != null && (cpiMax == null || v > cpiMax)) cpiMax = v;
      }
    }
    // Sin CPI disponible: comportamiento anterior (solo caída).
    if (cpi == null || cpiMax == null || cpi >= cpiMax) {
      return { bonus: 10, yoy, m0d3, drop, label: `viento en contra M2 −${drop.toFixed(0)}% del pico` };
    }
    return { bonus: 0, yoy, m0d3, drop, label: '—' };
  }
  // Veto M0: sin expansión de base monetaria no hay tailwind (fail closed si no hay dato M0).
  if (yoy > 4 && yoy3 != null && yoy > yoy3 && m0d3 != null && m0d3 > 0) return { bonus: -10, yoy, m0d3, drop, label: `viento a favor M2 +${yoy.toFixed(1)}%` };
  return { bonus: 0, yoy, m0d3, drop, label: '—' };
}

export function getCpiMa6(map: PriceMap | undefined, isoDate: string, n = 6, minObs = 4): number | null {
  // Media de los últimos n YoY mensuales <= fecha (para series mensuales como CPI).
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  let anchor: string | null = null;
  for (let i = 0; i < 40; i++) { const d = new Date(isoDate); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (map.has(k)) { anchor = k; break; } }
  if (!anchor) { for (const k of map.keys()) if (k <= isoDate && (anchor == null || k > anchor)) anchor = k; }
  if (!anchor) return null;
  const a = new Date(anchor);
  const vals: number[] = [];
  for (let k = 0; k < n; k++) {
    const ref = new Date(a); ref.setMonth(ref.getMonth() - k);
    const y = getCpiYoY(map, ref.toISOString().slice(0, 10));
    if (y != null) vals.push(y);
  }
  if (vals.length < minObs) return null;
  return vals.reduce((x, y) => x + y, 0) / vals.length;
}

export function cpiScore(yoy: number, ma: number): number {
  return 0.4 * bandScore(CPI_LVL_SEGS, yoy) + 0.6 * bandScore(CPI_TRD_SEGS, yoy - ma);
}

export function getMarginGdpRatio(s: Series, isoDate: string): number | null {
  const finra = getRecentPrice(s['FINRA_DEBIT'], isoDate, 45);
  const gdp = getRecentPrice(s['GDP'], isoDate, 120);
  if (finra == null || gdp == null || gdp === 0) return null;
  return (finra / 1000) / gdp * 100;
}

export function getMarginGdpMa24(s: Series, isoDate: string, n = 24, minReal = 6): number | null {
  // MA del ratio mensual. Antes de 1999 no hay 24 meses: se promedia lo disponible
  // de la época (mínimo minReal), lo que deja la tendencia neutra y el nivel puntuando.
  if (!isValidIsoDate(isoDate)) return null;
  const vals: number[] = [];
  const base = new Date(isoDate.slice(0, 10));
  for (let k = 0; k < 40 && vals.length < n; k++) {
    const e = new Date(base.getFullYear(), base.getMonth() - k + 1, 0);
    const ek = e.toISOString().slice(0, 10);
    if (ek > isoDate.slice(0, 10)) continue;
    const finra = getRecentPrice(s['FINRA_DEBIT'], ek, 45);
    const gdp = getRecentPrice(s['GDP'], ek, 120);
    if (finra != null && gdp) vals.push((finra / 1000) / gdp * 100);
  }
  if (vals.length < minReal) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function mgScore(ratio: number, ma: number): number {
  return 0.4 * bandScore(MG_SEGS, ratio) + 0.6 * bandScore(MG_TRD_SEGS, ratio - ma);
}

export function pibScore(yoy: number): number {
  // Procíclico (sobrecalentamiento): el suelo da score bajo por construcción
  // (2009: -3.2% => ~10) y no frena la recompra; el pico da score alto.
  return bandScore(GDP_SEGS, yoy);
}

export function getGdpc1YoY(s: Series, isoDate: string): number | null {
  // Trimestral con rezago de publicación: último trimestre disponible <= fecha.
  const map = s['GDPC1'];
  if (!map) return null;
  let curDate: string | null = null;
  for (const k of map.keys()) if (k <= isoDate && (curDate == null || k > curDate)) curDate = k;
  if (!curDate) return null;
  const curReal = map.get(curDate)!;
  const d = new Date(curDate); d.setFullYear(d.getFullYear() - 1);
  const prev = getRecentPrice(map, d.toISOString().slice(0, 10), 400);
  if (prev == null || prev === 0) return null;
  return (curReal / prev - 1) * 100;
}

export interface ThermoPart { key: string; score: number; weight: number; value: number }
export interface ThermoDay { value: number; numerator: number; denominator: number; coverage: number; parts: ThermoPart[]; bonus: number; bonusLabel: string; liqBonus: number; liqBonusLabel: string }

export function computeThermoDay(
  isoDate: string,
  s: Series,
  cape: { cape: number | null; ratio: number | null },
): ThermoDay | null {
  const parts: ThermoPart[] = [];
  const push = (key: string, score: number | null, weight: number, value: number | null) => {
    if (score != null && value != null) parts.push({ key, score, weight, value });
  };
  if (cape.cape != null) push('CAPE', bandScore(capeSegsForDate(isoDate), cape.cape), 20, cape.cape);
  const spx = getClosestPrice(s['^GSPC'], isoDate);
  const fwdEps = getRecentPrice(s['SPX_FWD_EPS'], isoDate, 130);
  push('FWD', spx != null && fwdEps != null && fwdEps !== 0 ? bandScore(FWD_SEGS, spx / fwdEps) : null, 10, spx != null && fwdEps ? spx / fwdEps : null);
  if (cape.ratio != null) push('RATIO', bandScore(RATIO_SEGS, cape.ratio), 15, cape.ratio);
  const cpi = getCpiYoY(s['CPIAUCSL'], isoDate);
  const cpiMa = getCpiMa6(s['CPIAUCSL'], isoDate);
  push('CPI', cpi != null && cpiMa != null ? cpiScore(cpi, cpiMa) : null, 10, cpi);
  const core = getCpiYoY(s['CPILFESL'], isoDate);
  const coreMa = getCpiMa6(s['CPILFESL'], isoDate);
  push('CORE', core != null && coreMa != null ? cpiScore(core, coreMa) : null, 10, core);
  // Y2M reemplaza a FED: el 2Y descuenta la política monetaria sin su rezago.
  const y2 = getClosestPrice(s['DGS2'], isoDate);
  const y2ma = getMa126(s['DGS2'], isoDate);
  push('Y2M', y2 != null && y2ma != null ? y2mScore(y2, y2ma) : null, 10, y2);
  const y30 = getClosestPrice(s['DGS30'], isoDate);
  const y30ma = getMa126(s['DGS30'], isoDate);
  push('30Y', y30 != null && y30ma != null ? y30mScore(y30, y30ma) : null, 10, y30);
  // HY fuera del promedio: bonus asimétrico de crisis de liquidez (Régimen 3).
  const hyB = getHyBonus(s['BAMLH0A0HYM2'], isoDate, s['DFEDTARU']);
  const mg = getMarginGdpRatio(s, isoDate);
  const mgMa = getMarginGdpMa24(s, isoDate);
  push('MG', mg != null && mgMa != null ? mgScore(mg, mgMa) : null, 10, mg);
  const vix = getClosestPrice(s['VIXCLS'], isoDate);
  push('VIX', vix != null ? bandScore(VIX_SEGS, vix) : null, 10, vix);
  const fg = getClosestPrice(s['FEAR_GREED'], isoDate);
  push('FG', fg != null ? fgScore(fg) : null, 10, fg);
  const ms = getRecentPrice(s['MSACSR'], isoDate, 60);
  push('MS', ms != null ? bandScore(MS_SEGS, ms) : null, 5, ms);
  const gdpc1 = getGdpc1YoY(s, isoDate);
  push('PIB', gdpc1 != null ? pibScore(gdpc1) : null, 5, gdpc1);
  if (!parts.length) return null;
  // Bonus liquidez M2/M0 (simétrico: resta en oportunidad, suma en riesgo).
  const liqB = getLiqBonus(s['M2SL'], s['BOGMBASE'], isoDate, s['CPIAUCSL']);
  const numerator = parts.reduce((m, p) => m + p.score * p.weight, 0);
  const denominator = parts.reduce((m, p) => m + p.weight, 0);
  const value = Math.round(Math.min(100, Math.max(0, numerator / denominator + hyB.bonus + liqB.bonus)) * 10) / 10;
  return { value, numerator, denominator, coverage: parts.length, parts, bonus: hyB.bonus, bonusLabel: hyB.label, liqBonus: liqB.bonus, liqBonusLabel: liqB.label };
}
