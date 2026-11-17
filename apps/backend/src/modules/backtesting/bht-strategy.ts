// Vista "Estrategia" del popover del BHT (se calcula bajo demanda, solo al pulsar el botón):
// 1) Rango del BHT del día ±2 puntos (63 → 61–65): días históricos y de los últimos 5 años en ese rango.
// 2) Rendimiento promedio de esos días a 1, 2, 3 y 5 años y pico máximo dentro de 5 años, proyectado
//    sobre el precio del día (precio nominal esperado y fecha).
// 3) Venta en 4 tramos iguales cuando el BHT llega a 72, 77, 82 y 87+: lo que pasó desde ese día
//    (tramos sin vender valuados a hoy, comparado con mantener hasta hoy) y lo esperado según el rango.
export type Instrument = 'spx' | 'qqq' | 'tqqq';
export type StrategySeries = { dates: string[]; bht: (number | null)[]; px: Record<Instrument, (number | null)[]> };

export const HORIZONS = [1, 2, 3, 5] as const;
export const TRANCHES = [72, 77, 82, 87] as const;
const PEAK_YEARS = 5;
const DAY = 86_400_000;

const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Índice del primer día ≥ d (búsqueda binaria); -1 si no hay. */
function firstOnOrAfter(dates: string[], d: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < d) lo = mid + 1; else hi = mid; }
  return lo < dates.length ? lo : -1;
}
/** Índice del último día ≤ d; -1 si no hay. */
function lastOnOrBefore(dates: string[], d: string): number {
  const i = firstOnOrAfter(dates, d);
  if (i === -1) return dates.length - 1;
  return dates[i] === d ? i : i - 1;
}

export type StrategyResult = {
  date: string; instrument: Instrument; bht: number; range: [number, number];
  frequency: { all: { count: number; total: number; pct: number }; last5y: { count: number; total: number; pct: number } };
  base: { price: number | null; today: string; todayPrice: number | null };
  perf: Array<{ years: number; n: number; avgPct: number | null; medianPct: number | null; positivePct: number | null; nominal: number | null; targetDate: string }>;
  peak: { n: number; avgPct: number | null; avgDays: number | null; nominal: number | null; date: string | null };
  tranches: {
    actual: Array<{ threshold: number; date: string | null; price: number | null; pct: number | null; days: number | null }>;
    strategyPct: number | null; holdPct: number | null; soldCount: number;
    expected: Array<{ threshold: number; n: number; reachedPct: number | null; avgDays: number | null; avgPct: number | null }>;
  };
};

/** Primer día después de `i` en que el BHT alcanza cada umbral (un mismo día puede cubrir varios). */
function trancheHits(s: StrategySeries, i: number): Array<number | null> {
  const hits: Array<number | null> = TRANCHES.map(() => null);
  let next = 0;
  for (let j = i + 1; j < s.dates.length && next < TRANCHES.length; j++) {
    const b = s.bht[j];
    if (b == null) continue;
    while (next < TRANCHES.length && b >= TRANCHES[next]) { hits[next] = j; next++; }
  }
  return hits;
}

export function computeBhtStrategy(s: StrategySeries, date: string, instrument: Instrument): StrategyResult | null {
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
  let allN = 0, allC = 0, n5 = 0, c5 = 0;
  const samples: number[] = [];
  s.bht.forEach((b, k) => {
    if (b == null) return;
    allN++;
    const hit = inRange(b);
    if (hit) { allC++; samples.push(k); }
    if (s.dates[k] >= from5y) { n5++; if (hit) c5++; }
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
    };
  });
  const peakPcts: number[] = [], peakDays: number[] = [];
  for (const k of samples) {
    const p0 = px[k];
    if (p0 == null) continue;
    const end = addYears(s.dates[k], PEAK_YEARS);
    if (end > today) continue; // ventana completa de 5 años
    let best = p0, bestJ = k;
    for (let j = k + 1; j < s.dates.length && s.dates[j] <= end; j++) { const p = px[j]; if (p != null && p > best) { best = p; bestJ = j; } }
    peakPcts.push((best / p0 - 1) * 100);
    peakDays.push(daysBetween(s.dates[k], s.dates[bestJ]));
  }
  const pkPct = avg(peakPcts), pkDays = avg(peakDays);

  // 3) Tramos: lo que pasó desde este día…
  const todayPrice = px[last];
  const hits = trancheHits(s, i);
  const actual = TRANCHES.map((threshold, t) => {
    const j = hits[t];
    const p = j != null ? px[j] : null;
    return {
      threshold, date: j != null ? s.dates[j] : null, price: p ?? null,
      pct: p != null && basePrice != null ? (p / basePrice - 1) * 100 : null,
      days: j != null ? daysBetween(s.dates[i], s.dates[j]) : null,
    };
  });
  let strategyPct: number | null = null, holdPct: number | null = null;
  if (basePrice != null && todayPrice != null) {
    holdPct = (todayPrice / basePrice - 1) * 100;
    // Tramo sin vender: se valúa al precio de hoy.
    strategyPct = actual.reduce((m, a) => m + (a.pct ?? holdPct!), 0) / TRANCHES.length;
  }
  // …y lo esperado según todos los días históricos del rango: % que alcanzó cada umbral, días promedio y
  // rendimiento promedio al vender (los días recientes aún pueden alcanzarlo, así que el % es un mínimo).
  const expected = TRANCHES.map((threshold) => ({ threshold, n: 0, reached: 0, days: [] as number[], rets: [] as number[] }));
  for (const k of samples) {
    const p0 = px[k];
    if (p0 == null) continue;
    const h = trancheHits(s, k);
    expected.forEach((e, t) => {
      e.n++;
      const j = h[t];
      if (j == null || px[j] == null) return;
      e.reached++;
      e.days.push(daysBetween(s.dates[k], s.dates[j]));
      e.rets.push((px[j]! / p0 - 1) * 100);
    });
  }

  return {
    date: s.dates[i], instrument, bht, range,
    frequency: { all: { count: allC, total: allN, pct: pct(allC, allN) }, last5y: { count: c5, total: n5, pct: pct(c5, n5) } },
    base: { price: basePrice ?? null, today, todayPrice: todayPrice ?? null },
    perf,
    peak: {
      n: peakPcts.length, avgPct: pkPct, avgDays: pkDays,
      nominal: pkPct != null && basePrice != null ? basePrice * (1 + pkPct / 100) : null,
      date: pkDays != null ? addDays(s.dates[i], Math.round(pkDays)) : null,
    },
    tranches: {
      actual, strategyPct, holdPct, soldCount: actual.filter((a) => a.date != null).length,
      expected: expected.map((e) => ({ threshold: e.threshold, n: e.n, reachedPct: e.n ? (e.reached / e.n) * 100 : null, avgDays: avg(e.days), avgPct: avg(e.rets) })),
    },
  };
}
