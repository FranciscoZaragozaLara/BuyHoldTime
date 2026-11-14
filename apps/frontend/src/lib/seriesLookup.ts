// Búsquedas sobre series diarias/mensuales (Map 'YYYY-MM-DD' → valor) para la tabla CAPE,
// las cards de indicadores y el termómetro en vivo. Funciones puras (antes dentro de IndicatorsPanel).
export type Series = Map<string, number> | undefined;

const MS_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

// Guarda anti-crash: una fecha live basura (p.ej. date:"<link href" del endpoint live)
// tumbaba TODA la tabla con "Invalid time value". Fecha inválida => sin dato.
export function isValidIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s.slice(0, 10)).getTime());
}

/** Valor del día o de hasta `lookback − 1` días antes. */
export function getClosestPrice(map: Series, isoDate: string, lookback = 7): number | null {
  if (!map || !isValidIsoDate(isoDate)) return null;
  for (let i = 0; i < lookback; i++) {
    const d = new Date(isoDate);
    d.setDate(d.getDate() - i);
    const v = map.get(d.toISOString().slice(0, 10));
    if (v != null) return v;
  }
  return null;
}

/** Como getClosestPrice y, si no hay, el último valor ≤ fecha (mensuales/trimestrales con rezago). */
export function getRecentPrice(map: Series, isoDate: string, lookback = 7): number | null {
  const v = getClosestPrice(map, isoDate, lookback);
  if (v != null) return v;
  if (!map || map.size === 0) return null;
  let best: string | null = null;
  for (const k of map.keys()) if (k <= isoDate && (best == null || k > best)) best = k;
  return best ? map.get(best)! : null;
}

/** Fecha de la observación más reciente ≤ isoDate (busca 40 días y luego cualquier anterior). */
function anchorDate(map: Map<string, number>, isoDate: string, noonUtc = false): string | null {
  for (let i = 0; i < 40; i++) {
    const d = new Date(noonUtc ? `${isoDate}T12:00:00Z` : isoDate);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    if (map.has(k)) return k;
  }
  let a: string | null = null;
  for (const k of map.keys()) if (k <= isoDate && (a == null || k > a)) a = k;
  return a;
}

/** Inflación YoY de una serie mensual (mes más reciente ≤ fecha vs 12 meses antes). */
export function getCpiYoY(map: Series, isoDate: string): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const curDate = anchorDate(map, isoDate);
  if (!curDate) return null;
  const cur = map.get(curDate)!;
  const cd = new Date(curDate); cd.setFullYear(cd.getFullYear() - 1);
  const prev = getRecentPrice(map, cd.toISOString().slice(0, 10), 40);
  if (prev == null || prev === 0) return null;
  return (cur / prev - 1) * 100;
}

/** Media de los últimos n YoY mensuales ≤ fecha. */
export function getCpiMa6(map: Series, isoDate: string, n = 6, minObs = 4): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const anchor = anchorDate(map, isoDate);
  if (!anchor) return null;
  const a = new Date(anchor);
  const vals: number[] = [];
  for (let k = 0; k < n; k++) { const ref = new Date(a); ref.setMonth(ref.getMonth() - k); const y = getCpiYoY(map, ref.toISOString().slice(0, 10)); if (y != null) vals.push(y); }
  if (vals.length < minObs) return null;
  return vals.reduce((x, y) => x + y, 0) / vals.length;
}

/** Media móvil de los últimos n cierres ≤ fecha. */
export function getMa126(map: Series, isoDate: string, n = 126, minObs = 100): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const vals: number[] = [];
  for (let i = 0; i < 400 && vals.length < n; i++) { const d = new Date(isoDate); d.setDate(d.getDate() - i); const v = map.get(d.toISOString().slice(0, 10)); if (v != null) vals.push(v); }
  if (vals.length < minObs) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** % vs la fila de hace N meses (series mensuales FRED). Espejo de getMonthlyPct del backend. */
export function monthlyPctLive(map: Series, isoDate: string, monthsBack: number): number | null {
  if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
  const anchor = anchorDate(map, isoDate);
  if (!anchor) return null;
  const a = new Date(anchor); a.setMonth(a.getMonth() - monthsBack);
  const prev = getRecentPrice(map, a.toISOString().slice(0, 10), 40);
  const cur = map.get(anchor)!;
  if (prev == null || prev === 0) return null;
  return (cur / prev - 1) * 100;
}

/** Ratio WTI / SMA36M con anclas mensuales. Espejo del backend (bandas 0.70/0.90/1.20/1.45). */
export function oilRatioLive(wtim: Series, isoDate: string): { ratio: number | null; price: number | null } {
  if (!wtim || wtim.size === 0 || !isValidIsoDate(isoDate)) return { ratio: null, price: null };
  const price = getRecentPrice(wtim, isoDate, 10);
  if (price == null) return { ratio: null, price: null };
  const anchor = anchorDate(wtim, isoDate, true);
  if (!anchor) return { ratio: null, price: null };
  const vals: number[] = [];
  for (let m = 0; m < 36; m++) { const q = new Date(`${anchor}T12:00:00Z`); q.setDate(1); q.setMonth(q.getMonth() - m); const v = getRecentPrice(wtim, q.toISOString().slice(0, 10), 10); if (v != null) vals.push(v); }
  if (vals.length < 30) return { ratio: null, price };
  return { ratio: price / (vals.reduce((a, b) => a + b, 0) / vals.length), price };
}

/** Margen FINRA / PIB nominal en % (FINRA en millones, PIB en miles de millones). */
export function marginGdpRatio(finra: Series, gdp: Series, isoDate: string): number | null {
  const f = getRecentPrice(finra, isoDate, 45);
  const g = getRecentPrice(gdp, isoDate, 120);
  if (f == null || g == null || g === 0) return null;
  return (f / 1000) / g * 100;
}

/** MA del ratio Margen/PIB mensual; antes de 1999 promedia lo disponible de la época. */
export function marginGdpMa24(finra: Series, gdp: Series, isoDate: string, n = 24, minReal = 6): number | null {
  if (!isValidIsoDate(isoDate)) return null;
  const vals: number[] = [];
  const base = new Date(isoDate.slice(0, 10));
  for (let k = 0; k < 40 && vals.length < n; k++) {
    const ek = new Date(base.getFullYear(), base.getMonth() - k + 1, 0).toISOString().slice(0, 10);
    if (ek > isoDate.slice(0, 10)) continue;
    const r = marginGdpRatio(finra, gdp, ek);
    if (r != null) vals.push(r);
  }
  if (vals.length < minReal) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Amplitud: Net Advancing Volume y Up/Down Ratio. */
export function breadthValues(adv: Series, dec: Series, isoDate: string): { net: number | null; ratio: number | null } {
  const a = getClosestPrice(adv, isoDate);
  const d = getClosestPrice(dec, isoDate);
  if (a == null || d == null || (a === 0 && d === 0)) return { net: null, ratio: null };
  return { net: a - d, ratio: d > 0 ? a / d : null };
}

function obvSequence(closes: Series, vols: Series): { d: string; obv: number; v: number }[] {
  if (!closes || !vols) return [];
  let acc = 0; let prev: number | null = null;
  const seq: { d: string; obv: number; v: number }[] = [];
  for (const d of Array.from(closes.keys()).sort()) {
    const c = closes.get(d); const v = vols.get(d) ?? 0;
    if (c == null) continue;
    if (prev != null) { if (c > prev) acc += v; else if (c < prev) acc -= v; }
    prev = c; seq.push({ d, obv: acc, v });
  }
  return seq;
}

/** OBV: volumen acumulado con el signo del cambio de cierre. */
export function buildObvMap(closes: Series, vols: Series): Map<string, number> {
  return new Map(obvSequence(closes, vols).map((s) => [s.d, s.obv]));
}

/** Fuerza diaria = ΔOBV / SMA20(volumen); Tend-OBV = z-score 20d del OBV. */
export function buildObvForce(closes: Series, vols: Series): { fuerzaMap: Map<string, number>; obvzMap: Map<string, number> } {
  const fz = new Map<string, number>(); const tz = new Map<string, number>();
  const seq = obvSequence(closes, vols);
  for (let i = 19; i < seq.length; i++) {
    let volSum = 0; let obvSum = 0;
    for (let j = i - 19; j <= i; j++) { volSum += seq[j].v; obvSum += seq[j].obv; }
    const smaVol = volSum / 20;
    if (smaVol > 0) fz.set(seq[i].d, (seq[i].obv - seq[i - 1].obv) / smaVol);
    const mean = obvSum / 20;
    let varSum = 0;
    for (let j = i - 19; j <= i; j++) varSum += (seq[j].obv - mean) ** 2;
    const sd = Math.sqrt(varSum / 20);
    if (sd > 0) tz.set(seq[i].d, (seq[i].obv - mean) / sd);
  }
  return { fuerzaMap: fz, obvzMap: tz };
}

/** Cambio vs el cierre/mes/año anterior. `todayPrice` reemplaza el cierre de hoy (precio en vivo). */
export function periodChange(map: Series, isoDate: string, view: 'daily' | 'monthly' | 'yearly', todayPrice: number | null, now = new Date()): number | null {
  let price = getClosestPrice(map, isoDate);
  if (isoDate.slice(0, 10) === todayIso(now) && todayPrice != null) price = todayPrice;
  if (price == null) return null;
  const pd = new Date(isoDate.slice(0, 10));
  let lookback = 7;
  if (view === 'monthly') { pd.setMonth(pd.getMonth() - 1); lookback = 45; }
  else if (view === 'yearly') { pd.setFullYear(pd.getFullYear() - 1); lookback = 400; }
  else pd.setDate(pd.getDate() - 1);
  const prev = getClosestPrice(map, pd.toISOString().slice(0, 10), lookback);
  if (prev == null || prev === 0) return null;
  return (price / prev - 1) * 100;
}

/** Precio 12 meses después (solo si ya pasó). */
export function price1YLater(map: Series, isoDate: string, now = new Date()): number | null {
  const d = new Date(isoDate); d.setMonth(d.getMonth() + 12);
  const targetIso = d.toISOString().slice(0, 10);
  if (new Date(targetIso) > now) return null;
  return getClosestPrice(map, targetIso);
}

export function isPerf1YMature(isoDate: string, now = new Date()): boolean {
  const d = new Date(isoDate); d.setMonth(d.getMonth() + 12);
  return d.toISOString().slice(0, 10) <= todayIso(now);
}

export function perf1YElapsedMonths(isoDate: string, now = new Date()): string {
  const m = (now.getTime() - new Date(isoDate.slice(0, 10)).getTime()) / (MS_YEAR / 12);
  return m > 0 ? m.toFixed(0) : '0';
}

/** Rendimiento de la fecha a hoy (0 si es hoy). */
export function perfTotal(map: Series, isoDate: string, todayPrice: number | null, now = new Date()): number | null {
  const price = getClosestPrice(map, isoDate);
  if (price == null) return null;
  if (todayPrice == null || todayPrice === 0) return null;
  if (isoDate.slice(0, 10) === todayIso(now)) return 0;
  return (todayPrice / price - 1) * 100;
}

/** CAGR de la fecha a hoy; null si pasó menos de ~1 mes. */
export function cagr(map: Series, isoDate: string, todayPrice: number | null, now = new Date()): number | null {
  const price = getClosestPrice(map, isoDate);
  if (price == null || price <= 0) return null;
  if (todayPrice == null || todayPrice <= 0) return null;
  const t = todayIso(now);
  if (isoDate.slice(0, 10) === t) return 0;
  const years = (new Date(t).getTime() - new Date(isoDate.slice(0, 10)).getTime()) / MS_YEAR;
  if (years <= 0.08) return null;
  return (Math.pow(todayPrice / price, 1 / years) - 1) * 100;
}

/** Retorno a 12 meses si ya maduró; si no, el anualizado parcial a hoy (como el CAGR). */
export function perf1Y(map: Series, isoDate: string, todayPrice: number | null, now = new Date()): number | null {
  const price = getClosestPrice(map, isoDate);
  if (price == null) return null;
  const d = new Date(isoDate); d.setMonth(d.getMonth() + 12);
  const targetIso = d.toISOString().slice(0, 10);
  if (new Date(targetIso) <= now) {
    const p1 = getClosestPrice(map, targetIso);
    return p1 == null ? null : (p1 / price - 1) * 100;
  }
  if (todayPrice == null || todayPrice <= 0 || price <= 0) return null;
  return cagr(map, isoDate, todayPrice, now);
}
