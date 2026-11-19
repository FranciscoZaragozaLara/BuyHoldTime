// Régimen tendencial del S&P 500 (acompaña al termómetro BHT): cierre del día contra sus medias simples de
// 50 y 200 sesiones. SMA (no EMA): en el estudio de 1993–2026 explican casi lo mismo, la SMA da menos cambios de
// señal y la de 200 es la referencia del mercado ("golden/death cross"). Casi toda la información está en la de 200:
// por debajo de ella el riesgo de caídas a 12 meses se duplica.
//   UPTREND    · Tendencia alcista: arriba de la 50 y de la 200.
//   PULLBACK   · Corrección: abajo de la 50, arriba de la 200 (retroceso dentro de una tendencia alcista).
//   REBOUND    · Rebote: arriba de la 50, abajo de la 200 (recuperación aún sin confirmar).
//   DOWNTREND  · Tendencia bajista: abajo de ambas.
import type { PriceMap } from './thermo-history';

export type TrendRegime = 'UPTREND' | 'PULLBACK' | 'REBOUND' | 'DOWNTREND';
export const TREND_REGIMES: TrendRegime[] = ['UPTREND', 'PULLBACK', 'REBOUND', 'DOWNTREND'];
export type TrendPoint = { regime: TrendRegime; close: number; sma50: number; sma200: number };

export function classifyTrend(close: number, sma50: number, sma200: number): TrendRegime {
  const a50 = close > sma50, a200 = close > sma200;
  return a200 ? (a50 ? 'UPTREND' : 'PULLBACK') : (a50 ? 'REBOUND' : 'DOWNTREND');
}

/** Régimen de cada sesión con al menos 200 cierres previos (incluido el del día). */
export function trendRegimeSeries(prices: PriceMap): Map<string, TrendPoint> {
  const dates = [...prices.keys()].sort();
  const px = dates.map((d) => prices.get(d)!);
  const out = new Map<string, TrendPoint>();
  let s50 = 0, s200 = 0;
  for (let i = 0; i < px.length; i++) {
    s50 += px[i]; s200 += px[i];
    if (i >= 50) s50 -= px[i - 50];
    if (i >= 200) s200 -= px[i - 200];
    if (i < 199) continue;
    const sma50 = s50 / 50, sma200 = s200 / 200;
    out.set(dates[i], { regime: classifyTrend(px[i], sma50, sma200), close: px[i], sma50, sma200 });
  }
  return out;
}

/** Régimen de una fecha (si no hubo sesión ese día, el de la última sesión anterior). */
export function trendAt(series: Map<string, TrendPoint>, sortedDates: string[], date: string): TrendPoint | null {
  let lo = 0, hi = sortedDates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sortedDates[m] <= date) lo = m + 1; else hi = m; }
  return lo > 0 ? series.get(sortedDates[lo - 1]) ?? null : null;
}

/**
 * Régimen de hoy con el precio en vivo: las medias se recalculan con el último cierre reemplazado (o agregado)
 * por el precio en vivo. `closes` ordenado por fecha.
 */
export function liveTrend(closes: Array<{ date: string; close: number }>, today: string, livePrice: number): TrendPoint | null {
  const xs = closes.filter((c) => c.date < today).map((c) => c.close);
  xs.push(livePrice);
  if (xs.length < 200) return null;
  const avg = (n: number) => xs.slice(-n).reduce((a, b) => a + b, 0) / n;
  const sma50 = avg(50), sma200 = avg(200);
  return { regime: classifyTrend(livePrice, sma50, sma200), close: livePrice, sma50, sma200 };
}
