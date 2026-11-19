// Vista "Estrategia" del popover del BHT (se calcula bajo demanda, solo al pulsar el botón):
// 1) Rango del BHT del día ±2 puntos (63 → 61–65): días históricos y de los últimos 5 años en ese rango.
// 2) Rendimiento promedio de esos días a 1, 2, 3 y 5 años y pico máximo dentro de 5 años, proyectado
//    sobre el precio del día (precio nominal esperado y fecha).
// 3) Comprando en esta fecha y manteniendo hasta hoy, para cada instrumento: rendimiento total y CAGR; y lo mismo
//    si se vendiera en el pico máximo alcanzado desde la compra.
// Los tramos de compra/venta y las caídas por año están en la vista Drawdowns (bht-drawdowns.ts).
export type Instrument = 'spx' | 'qqq' | 'tqqq';
/** Días del rango que entran a los promedios: toda la historia o solo los últimos 5 años. */
export type SampleWindow = 'all' | '5y';
export type StrategySeries = { dates: string[]; bht: (number | null)[]; px: Record<Instrument, (number | null)[]> };

export const HORIZONS = [1, 2, 3, 5] as const;
const PEAK_YEARS = 5;
const DAY = 86_400_000;

/** Tasa anual compuesta equivalente a un rendimiento total en `years` años (null sin dato o con pérdida total). */
export const cagr = (totalPct: number | null, years: number): number | null =>
  totalPct == null || years <= 0 || totalPct <= -100 ? null : (Math.pow(1 + totalPct / 100, 1 / years) - 1) * 100;

export const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Índice del primer día ≥ d (búsqueda binaria); -1 si no hay. */
export function firstOnOrAfter(dates: string[], d: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < d) lo = mid + 1; else hi = mid; }
  return lo < dates.length ? lo : -1;
}
/** Índice del último día ≤ d; -1 si no hay. */
export function lastOnOrBefore(dates: string[], d: string): number {
  const i = firstOnOrAfter(dates, d);
  if (i === -1) return dates.length - 1;
  return dates[i] === d ? i : i - 1;
}

export type StrategyResult = {
  date: string; instrument: Instrument; window: SampleWindow; bht: number; range: [number, number];
  frequency: { all: { count: number; total: number; pct: number }; last5y: { count: number; total: number; pct: number } };
  /** Percentil del BHT del día: % de días con BHT ≤ al de hoy (bajo = barato, mejor momento de compra). */
  percentile: { all: number; last5y: number };
  base: { price: number | null; today: string; todayPrice: number | null };
  perf: Array<{ years: number; n: number; avgPct: number | null; medianPct: number | null; positivePct: number | null; nominal: number | null; targetDate: string; cagrPct: number | null }>;
  /** Comprar en la fecha y mantener hasta hoy (último cierre), por instrumento. CAGR solo con ≥ 1 año. */
  sinceDate: Record<Instrument, {
    buyPrice: number | null; lastPrice: number | null; lastDate: string | null; years: number | null; totalPct: number | null; cagrPct: number | null;
    /** Vendiendo en el precio más alto desde la compra (null si nunca superó el precio de compra). */
    peak: { price: number; date: string; bht: number | null; years: number; totalPct: number; cagrPct: number | null } | null;
  }>;
  peak: { n: number; avgPct: number | null; avgDays: number | null; nominal: number | null; date: string | null };
};

export function computeBhtStrategy(s: StrategySeries, date: string, instrument: Instrument, window: SampleWindow = 'all'): StrategyResult | null {
  const i = lastOnOrBefore(s.dates, date);
  if (i < 0 || s.bht[i] == null) return null;
  const px = s.px[instrument];
  const bht = s.bht[i]!;
  const center = Math.round(bht);
  const range: [number, number] = [center - 2, center + 2];
  const inRange = (b: number | null) => b != null && Math.round(b) >= range[0] && Math.round(b) <= range[1];
  const last = s.dates.length - 1, today = s.dates[last];
  const from5y = addYears(today, -5);

  // 1) Frecuencia (días con BHT).
  let allN = 0, allC = 0, n5 = 0, c5 = 0, allLe = 0, le5 = 0;
  const samples: number[] = [];
  s.bht.forEach((b, k) => {
    if (b == null) return;
    allN++;
    if (b <= bht) { allLe++; if (s.dates[k] >= from5y) le5++; }
    const hit = inRange(b);
    if (hit) allC++;
    if (s.dates[k] >= from5y) { n5++; if (hit) c5++; }
    if (hit && (window === 'all' || s.dates[k] >= from5y)) samples.push(k);
  });
  const pct = (c: number, n: number) => (n ? (c / n) * 100 : 0);

  // 2) Rendimiento a N años (precio del primer día ≥ fecha + N años) y pico dentro de 5 años.
  const basePrice = px[i];
  const perf = HORIZONS.map((years) => {
    const rets: number[] = [];
    for (const k of samples) {
      const p0 = px[k];
      if (p0 == null) continue;
      const j = firstOnOrAfter(s.dates, addYears(s.dates[k], years));
      if (j === -1 || px[j] == null) continue;
      rets.push((px[j]! / p0 - 1) * 100);
    }
    const a = avg(rets);
    return {
      years, n: rets.length, avgPct: a, medianPct: median(rets),
      positivePct: rets.length ? (rets.filter((r) => r > 0).length / rets.length) * 100 : null,
      nominal: a != null && basePrice != null ? basePrice * (1 + a / 100) : null,
      targetDate: addYears(s.dates[i], years),
      cagrPct: cagr(a, years),
    };
  });
  const peakPcts: number[] = [], peakDays: number[] = [];
  for (const k of samples) {
    const p0 = px[k];
    if (p0 == null) continue;
    const end = addYears(s.dates[k], PEAK_YEARS);
    // Toda la historia: solo ventanas completas de 5 años. Últimos 5 años: ninguna está completa, así que se usa
    // el pico hasta hoy (ventana parcial).
    if (end > today && window === 'all') continue;
    let best = p0, bestJ = k;
    for (let j = k + 1; j < s.dates.length && s.dates[j] <= end; j++) { const p = px[j]; if (p != null && p > best) { best = p; bestJ = j; } }
    peakPcts.push((best / p0 - 1) * 100);
    peakDays.push(daysBetween(s.dates[k], s.dates[bestJ]));
  }
  const pkPct = avg(peakPcts), pkDays = avg(peakDays);

  const todayPrice = px[last];

  // 3) Comprar en la fecha y mantener hasta el último cierre disponible, para cada instrumento.
  const sinceDate = {} as StrategyResult['sinceDate'];
  for (const inst of ['spx', 'qqq', 'tqqq'] as Instrument[]) {
    const p = s.px[inst];
    const p0 = p[i] ?? null;
    let k = last;
    while (k > i && p[k] == null) k--;
    const pN = k > i ? p[k] : null;
    const yrs = pN != null ? daysBetween(s.dates[i], s.dates[k]) / 365.25 : null;
    const total = p0 != null && pN != null ? (pN / p0 - 1) * 100 : null;
    // Pico: el cierre más alto después de la compra (con el último BHT disponible ese día).
    let hi = -1;
    if (p0 != null) for (let j = i + 1; j <= last; j++) { const v = p[j]; if (v != null && v > p0 && (hi < 0 || v > p[hi]!)) hi = j; }
    let peak: StrategyResult['sinceDate'][Instrument]['peak'] = null;
    if (hi > 0) {
      let b: number | null = null;
      for (let j = hi; j >= 0 && b == null; j--) b = s.bht[j];
      const py = daysBetween(s.dates[i], s.dates[hi]) / 365.25;
      const pt = (p[hi]! / p0! - 1) * 100;
      peak = { price: p[hi]!, date: s.dates[hi], bht: b, years: py, totalPct: pt, cagrPct: py >= 1 ? cagr(pt, py) : null };
    }
    sinceDate[inst] = {
      buyPrice: p0, lastPrice: pN ?? null, lastDate: pN != null ? s.dates[k] : null,
      years: yrs, totalPct: total, cagrPct: yrs != null && yrs >= 1 ? cagr(total, yrs) : null,
      peak,
    };
  }

  return {
    date: s.dates[i], instrument, window, bht, range,
    frequency: { all: { count: allC, total: allN, pct: pct(allC, allN) }, last5y: { count: c5, total: n5, pct: pct(c5, n5) } },
    percentile: { all: pct(allLe, allN), last5y: pct(le5, n5) },
    base: { price: basePrice ?? null, today, todayPrice: todayPrice ?? null },
    perf,
    sinceDate,
    peak: {
      n: peakPcts.length, avgPct: pkPct, avgDays: pkDays,
      nominal: pkPct != null && basePrice != null ? basePrice * (1 + pkPct / 100) : null,
      date: pkDays != null ? addDays(s.dates[i], Math.round(pkDays)) : null,
    },
  };
}
