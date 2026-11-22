// Termómetro BuyHoldTime: réplica exacta de la lógica del frontend
// (IndicatorsPanel.tsx) para historificar el valor al cierre en BD.
// Bandas y pesos idénticos; subconjunto disponible por fecha.
// CAPE usa las bandas anuales de packages/bht-bands/bands.json según el año del dato; el resto de
// componentes, packages/bht-bands/thermo-segs.json (mismo archivo que usa el frontend).
import { capeSegsForDate, defaultCapeSegs, thermoSegs } from './bht-bands';
export type Seg = [number, number, number, number];

export const CAPE_SEGS: Seg[] = defaultCapeSegs();
export const PE_SEGS: Seg[] = thermoSegs('PE');
// P/E estimado (EPS de Birinyi vía WSJ desde nov-2026): bandas ×1.07 respecto a las de Yardeni,
// cuyo EPS era ~7% mayor, para que barato/justo/caro signifiquen lo mismo.
export const FWD_SEGS: Seg[] = thermoSegs('FWD');
export const RATIO_SEGS: Seg[] = thermoSegs('RATIO');
export const CPI_SEGS: Seg[] = thermoSegs('CPI');
// CPI momentum: nivel del YoY (40%) + delta vs media 6M de YoY (60%).
// Un 3.5 acelerando desde 2 pesa más que un 7 cayendo desde 9.
export const CPI_LVL_SEGS: Seg[] = thermoSegs('CPI_LVL');
export const CPI_TRD_SEGS: Seg[] = thermoSegs('CPI_TRD');
export const FED_SEGS: Seg[] = thermoSegs('FED');
// Y2M (2Y Momentum): combina nivel del Treasury 2Y (40%) con su delta vs
// media móvil 6M (60%). El 2Y descuenta la política Fed meses antes del anuncio.
export const Y2M_LVL_SEGS: Seg[] = thermoSegs('Y2M_LVL');
export const Y2M_TRD_SEGS: Seg[] = thermoSegs('Y2M_TRD');
export const Y30_SEGS: Seg[] = thermoSegs('Y30');
// Y30M (30Y Momentum): mismo esquema que Y2M — nivel del Treasury 30Y (40%) +
// delta vs MA6M (60%), con la misma regla de tendencia. Si los bonos se aceleran
// al alza, frenan economía y liquidez.
export const Y30M_LVL_SEGS: Seg[] = thermoSegs('Y30M_LVL');
export const HY_SEGS: Seg[] = thermoSegs('HY');
export const MG_SEGS: Seg[] = thermoSegs('MG');
// MG momentum: nivel del ratio (40%) + desvío vs MA24M del ratio (60%).
export const MG_TRD_SEGS: Seg[] = thermoSegs('MG_TRD');
export const VIX_SEGS: Seg[] = thermoSegs('VIX');
// Fear & Greed estirado: el índice rara vez toca 0/100; ≤10 => 0 y ≥80 => 100, centro intacto.
export const FG_SEGS: Seg[] = thermoSegs('FG');
export function fgScore(v: number): number {
  return bandScore(FG_SEGS, v);
}
export const MS_SEGS: Seg[] = thermoSegs('MS');
export const GDP_SEGS: Seg[] = thermoSegs('GDP');

export function bandScore(segs: Seg[], v: number): number {
  for (const [lo, hi, sLo, sHi] of segs) {
    if (v >= lo && v < hi) return sLo + (v - Math.max(lo, -1e9)) * ((sHi - sLo) / (Math.min(hi, 1e9) - Math.max(lo, -1e9) || 1));
  }
  return 100;
}

export type PriceMap = Map<string, number>;
export type Series = Record<string, PriceMap>;

/**
 * Serie de crédito del modelo («HY» del bonus, veto y señal de crisis de crédito de los tranches): 1.913477 × BAA10Y
 * (spread Baa − Tesoro 10 años de Moody's, FRED). Es exactamente la historia con la que se calibró todo (el «HY OAS»
 * guardado antes de ago-2023 era ese proxy: FRED solo publica 3 años del ICE real). Usarla también en vivo mantiene
 * los umbrales consistentes; el HY OAS real (BAMLH0A0HYM2) queda solo como dato informativo.
 */
export const CREDIT_BASE = 'BAA10Y';
export const HY_BAA_SCALE = 1.913477;
const creditCache = new WeakMap<PriceMap, PriceMap>();
export function creditFromBaa(baa: PriceMap | undefined): PriceMap | undefined {
  if (!baa) return undefined;
  const hit = creditCache.get(baa);
  if (hit) return hit;
  const out: PriceMap = new Map();
  for (const [d, v] of baa) out.set(d, v * HY_BAA_SCALE);
  creditCache.set(baa, out);
  return out;
}

/**
 * Rezago de publicación (días desde la fecha guardada hasta que el dato se conoce). Las series mensuales y
 * trimestrales se guardan con la fecha de su periodo (día 1), no con la de publicación: sin esto la historia
 * usaba cada dato ~6–17 semanas antes de existir (estudio nov-2026: M2/M0 movía el BHT hasta 30 pts).
 * Aproximaciones: FINRA ~día 20 de M+1; CPI ~día 13 de M+1; M2/M0 ~4.ª semana de M+1; ventas de casas ~día 25
 * de M+1; PIB avance ~1 mes tras el cierre del trimestre.
 */
export const PUB_LAG_DAYS: Readonly<Record<string, number>> = {
  FINRA_DEBIT: 50, CPIAUCSL: 43, CPILFESL: 43, M2SL: 57, BOGMBASE: 57, MSACSR: 55, GDP: 120, GDPC1: 120,
};
const lagCache = new WeakMap<PriceMap, PriceMap>();
const lagged = new WeakSet<PriceMap>();
/** La serie con cada fecha corrida a su fecha de publicación (memorizada por mapa; nunca corre dos veces). */
export function lagSeries(map: PriceMap, days: number): PriceMap {
  if (lagged.has(map) || !days) return map;
  const hit = lagCache.get(map);
  if (hit) return hit;
  const out: PriceMap = new Map();
  for (const [d, v] of map) {
    const x = new Date(`${d.slice(0, 10)}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + days);
    out.set(x.toISOString().slice(0, 10), v);
  }
  lagged.add(out);
  lagCache.set(map, out);
  return out;
}
/** Series con el rezago de publicación aplicado a las que lo tienen (las diarias no cambian). */
export function withPubLag(s: Series): Series {
  const out: Series = { ...s };
  for (const [t, days] of Object.entries(PUB_LAG_DAYS)) if (s[t]) out[t] = lagSeries(s[t], days);
  return out;
}

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

// Complacencia (HY < P20 36M en los últimos 6M): riesgo latente, no estrés → bonus menor.
export const HY_ARMED_BONUS = 2;

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
  if (armed) return { bonus: HY_ARMED_BONUS, hy: v, z, d1, armed, label: 'armado', fed: fedRescue(fedMap, isoDate) };
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

const sortedKeysCache = new WeakMap<PriceMap, string[]>();
/**
 * Publicaciones de una serie mensual con rezago (sus claves = fecha en que se conoce cada dato) hasta isoDate, de la
 * más reciente hacia atrás (máx. n). Las comparaciones «N meses antes» van por publicaciones y no por calendario: con
 * 57 días de rezago, «2 meses antes» por calendario a veces cae antes de una publicación y se salta o repite un mes.
 */
export function releasesUpTo(map: PriceMap | undefined, isoDate: string, n: number): string[] {
  if (!map || map.size === 0) return [];
  let keys = sortedKeysCache.get(map);
  if (!keys || keys.length !== map.size) { keys = [...map.keys()].sort(); sortedKeysCache.set(map, keys); }
  let lo = 0, hi = keys.length - 1, j = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= isoDate) { j = mid; lo = mid + 1; } else hi = mid - 1; }
  const out: string[] = [];
  for (let k = j; k >= 0 && out.length < n; k--) out.push(keys[k]);
  return out;
}

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
  // Por publicaciones de M2: la de hace 3 meses (yoy3) y el pico del YoY en las últimas 12.
  const rel = releasesUpTo(m2map, isoDate, 12);
  const yoy3 = rel.length > 3 ? getMonthlyPct(m2map, rel[3], 12) : null;
  let peak = -Infinity;
  for (const r of rel) {
    const v = getMonthlyPct(m2map, r, 12);
    if (v != null && v > peak) peak = v;
  }
  const drop = peak > 0 ? Math.max(0, (peak - yoy) / peak * 100) : 0;
  if (m0d3 != null && m0d3 > 30 && yoy > 8) return { bonus: -25, yoy, m0d3, drop, label: `megabazuca M0 Δ3M +${m0d3.toFixed(1)}% M2 +${yoy.toFixed(1)}%` };
  if (m0d3 != null && m0d3 > 5 && yoy > 8) return { bonus: -20, yoy, m0d3, drop, label: `bazuca M0 Δ3M +${m0d3.toFixed(1)}% M2 +${yoy.toFixed(1)}%` };
  if (drop >= 50) {
    const cpi = getCpiYoY(cpiMap, isoDate);
    let cpiMax: number | null = null;
    if (cpi != null) {
      // Máximo del CPI YoY en las 6 publicaciones anteriores.
      for (const r of releasesUpTo(cpiMap, isoDate, 7).slice(1)) {
        const v = getCpiYoY(cpiMap, r);
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

/** Misma fecha N meses antes, sin overflow de fin de mes (31 jul −2M → 31 may; 31 mar −1M → 28/29 feb). */
function liqMonthsBack(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  const t = (((d.getMonth() - n) % 12) + 12) % 12;
  d.setMonth(d.getMonth() - n);
  if (d.getMonth() !== t) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Bonus de liquidez suavizado (estudio nov-2026, variante L5): promedio del bonus crudo de este mes y los
 * 2 anteriores, salvo bazuca (≤ −20) y viento en contra (+10), que entran inmediatos. El viento a favor (−10)
 * dependía del signo de M0 Δ3M y prendía/apagaba mes a mes (saltos de hasta 30 pts en el BHT).
 * 1993→hoy: aciertos de BHT ≥ 70 57% → 60%, salidas prematuras 24% → 22%, saltos ≥ 15 pts/mes 514 → 401.
 */
export function getLiqBonusSmoothed(m2map: PriceMap | undefined, m0map: PriceMap | undefined, isoDate: string, cpiMap?: PriceMap): LiqBonus {
  const cur = getLiqBonus(m2map, m0map, isoDate, cpiMap);
  if (cur.label === 'sin dato' || cur.bonus <= -20 || cur.bonus === 10) return cur;
  // Las 2 publicaciones de M2 anteriores (no «1 y 2 meses antes» por calendario, que a veces se salta un mes).
  const rel = releasesUpTo(m2map, isoDate, 3);
  const b1 = getLiqBonus(m2map, m0map, rel[1] ?? liqMonthsBack(isoDate, 1), cpiMap).bonus;
  const b2 = getLiqBonus(m2map, m0map, rel[2] ?? liqMonthsBack(isoDate, 2), cpiMap).bonus;
  const bonus = Math.round((cur.bonus + b1 + b2) / 3) || 0;
  if (bonus === cur.bonus) return cur;
  const label = bonus === 0 ? '—' : `${bonus < 0 ? 'viento a favor' : 'viento en contra'} prom. 3M (${[cur.bonus, b1, b2].map((x) => (x > 0 ? `+${x}` : `${x}`)).join('/')})`;
  return { ...cur, bonus, label };
}

export interface OilBonus { bonus: number; ratio: number | null; price: number | null; label: string }

/** Anclas mensuales: última obs ≤ día 1 de cada mes hacia atrás (sin overflow de fin de mes). */
function monthlyAnchors(map: PriceMap, anchor: string, n: number): number[] {
  const vals: number[] = [];
  for (let m = 0; m < n; m++) {
    const q = new Date(anchor + 'T12:00:00Z'); q.setDate(1); q.setMonth(q.getMonth() - m);
    const v = getRecentPrice(map, q.toISOString().slice(0, 10), 10);
    if (v != null) vals.push(v);
  }
  return vals;
}

export function getOilRatio(wtiMap: PriceMap | undefined, isoDate: string): { ratio: number | null; price: number | null } {
  // Ratio WTI / SMA36M: numerador = último cierre, base = media de 36 anclas mensuales.
  // Mata el efecto-base del YoY (rebote desde crash no flaggea shock si el nivel es barato).
  if (!wtiMap || wtiMap.size === 0 || !isValidIsoDate(isoDate)) return { ratio: null, price: null };
  const price = getRecentPrice(wtiMap, isoDate, 10);
  if (price == null) return { ratio: null, price: null };
  let anchor: string | null = null;
  for (let i = 0; i < 40; i++) { const d = new Date(isoDate + 'T12:00:00Z'); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (wtiMap.has(k)) { anchor = k; break; } }
  if (!anchor) { for (const k of wtiMap.keys()) if (k <= isoDate && (anchor == null || k > anchor)) anchor = k; }
  if (!anchor) return { ratio: null, price: null };
  const vals = monthlyAnchors(wtiMap, anchor, 36);
  if (vals.length < 30) return { ratio: null, price }; // fail closed sin 3Y de historia
  return { ratio: price / (vals.reduce((a, b) => a + b, 0) / vals.length), price };
}

export function getOilBonus(wtiMap: PriceMap | undefined, isoDate: string): OilBonus {
  // Bonus simétrico de petróleo WTI por ratio vs SMA36M (bandas validadas 2003-2026).
  const { ratio, price } = getOilRatio(wtiMap, isoDate);
  if (ratio == null) return { bonus: 0, ratio, price, label: 'sin dato' };
  const f = (r: number) => `×${r.toFixed(2)}`;
  if (ratio >= 1.45) {
    // Guarda anti-spike: sin mes previo ya caro (≥1.20) el +10 se topa a +5.
    const q = new Date(isoDate + 'T12:00:00Z'); q.setDate(1); q.setMonth(q.getMonth() - 1);
    const prev = getOilRatio(wtiMap, q.toISOString().slice(0, 10)).ratio;
    if (prev != null && prev < 1.20) return { bonus: 5, ratio, price, label: `caro WTI ${f(ratio)} (sin persistencia)` };
    return { bonus: 10, ratio, price, label: `shock WTI ${f(ratio)}` };
  }
  if (ratio >= 1.20) return { bonus: 5, ratio, price, label: `caro WTI ${f(ratio)}` };
  if (ratio >= 0.90) return { bonus: 0, ratio, price, label: '—' };
  if (ratio >= 0.70) return { bonus: -5, ratio, price, label: `barato WTI ${f(ratio)}` };
  return { bonus: -10, ratio, price, label: `alivio WTI ${f(ratio)}` };
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

/** Series que usa el termómetro (BD bt_market_data). */
export const THERMO_TICKERS = ['^GSPC', 'SPX_EPS', 'SPX_FWD_EPS', 'CPIAUCSL', 'CPILFESL', 'DFEDTARU', 'DGS2', 'DGS30', 'BAA10Y', 'FINRA_DEBIT', 'GDP', 'GDPC1', 'MSACSR', 'VIXCLS', 'FEAR_GREED', 'M2SL', 'BOGMBASE', 'DCOILWTICO'];
/** Series a las que se les anexa el dato en vivo para el termómetro de hoy. */
export const THERMO_LIVE_TICKERS = ['^GSPC', 'CPIAUCSL', 'CPILFESL', 'DGS2', 'DGS30', 'MSACSR', 'GDPC1', 'VIXCLS', 'FEAR_GREED', 'BAA10Y', 'M2SL', 'BOGMBASE', 'DCOILWTICO'];

export interface ThermoPart { key: string; score: number; weight: number; value: number }
export interface ThermoDay { value: number; numerator: number; denominator: number; coverage: number; parts: ThermoPart[]; bonus: number; bonusLabel: string; liqBonus: number; liqBonusLabel: string; oilBonus: number; oilBonusLabel: string }

export function computeThermoDay(
  isoDate: string,
  s: Series,
  cape: { cape: number | null; ratio: number | null },
): ThermoDay | null {
  s = withPubLag(s); // punto en el tiempo: cada dato mensual/trimestral cuenta desde que se publicó
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
  const hyB = getHyBonus(creditFromBaa(s[CREDIT_BASE]), isoDate, s['DFEDTARU']);
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
  const liqB = getLiqBonusSmoothed(s['M2SL'], s['BOGMBASE'], isoDate, s['CPIAUCSL']);
  // Bonus petróleo WTI por ratio vs SMA36M (simétrico, fuera del promedio).
  const oilB = getOilBonus(s['DCOILWTICO'], isoDate);
  const numerator = parts.reduce((m, p) => m + p.score * p.weight, 0);
  const denominator = parts.reduce((m, p) => m + p.weight, 0);
  const value = Math.round(Math.min(100, Math.max(0, numerator / denominator + hyB.bonus + liqB.bonus + oilB.bonus)) * 10) / 10;
  return { value, numerator, denominator, coverage: parts.length, parts, bonus: hyB.bonus, bonusLabel: hyB.label, liqBonus: liqB.bonus, liqBonusLabel: liqB.label, oilBonus: oilB.bonus, oilBonusLabel: oilB.label };
}

export type LivePoints = Record<string, { date: string; value: number }>;

/**
 * Termómetro de hoy con datos en vivo: la misma computeThermoDay que guarda el
 * histórico, con el punto en vivo anexado a cada serie (sin mutar las originales).
 * Fuente única del BHT en vivo y de los bonus HY/LIQ/Oil que muestra el frontend.
 */
export function computeThermoLive(
  isoDate: string, s: Series, cape: { cape: number | null; ratio: number | null }, live: LivePoints = {},
) {
  const series: Series = { ...s };
  for (const [t, p] of Object.entries(live)) {
    if (!p || !isValidIsoDate(p.date) || !Number.isFinite(p.value) || p.date.slice(0, 10) > isoDate) continue;
    const m = new Map(s[t] ?? []);
    m.set(p.date.slice(0, 10), p.value);
    series[t] = m;
  }
  const day = computeThermoDay(isoDate, series, cape);
  const hy = getHyBonus(creditFromBaa(series[CREDIT_BASE]), isoDate, series['DFEDTARU']);
  const L = withPubLag(series);
  const liq = getLiqBonusSmoothed(L['M2SL'], L['BOGMBASE'], isoDate, L['CPIAUCSL']);
  const oil = getOilBonus(series['DCOILWTICO'], isoDate);
  return { day, hy, liq, oil };
}
