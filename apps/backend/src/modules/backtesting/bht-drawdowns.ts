// Vista "Drawdowns" del popover del BHT (se calcula bajo demanda, solo al pulsar el botón):
// 1) Caída máxima del instrumento en cada año posterior a la fecha (años 1..5): desde el pico acumulado desde la
//    compra hasta el valle de ese año (fecha y precio de ambos, % de caída y precio del valle contra la compra).
// 2) El sistema BuyHoldTime desde esa fecha (escaleras de venta V1–V5, compra T0–T4 y red de seguridad, las mismas de
//    la gráfica y de la pestaña Tranches) contra Hold: lo agrega el servicio con systemSince (reentry.ts). Antes había
//    aquí una escalera propia (vender con BHT 72/77/82/87 y recomprar con < 60/55/50/45) que contradecía a las demás.
// 3) Desde la compra hasta hoy: la caída máxima (pico → valle) y el pico máximo, con precio, %, fecha y BHT del día.
import { addYears, lastOnOrBefore, type Instrument, type StrategySeries } from './bht-strategy';
import type { SystemSince } from './reentry';

export const DD_YEARS = 5;

export type YearDrawdown = {
  year: number; from: string; to: string; partial: boolean;
  peakDate: string | null; peakPrice: number | null; troughDate: string | null; troughPrice: number | null;
  ddPct: number | null; vsBasePct: number | null;
};
export type MaxDd = { pct: number; peakDate: string | null; troughDate: string | null };
export type PricePoint = { date: string; price: number; bht: number | null };
export type SinceBuy = {
  /** Caída máxima desde la compra: del pico previo al valle (% y nominal), y el valle contra la compra. */
  maxDd: { pct: number; nominal: number; vsBasePct: number; peak: PricePoint; trough: PricePoint } | null;
  /** Precio más alto alcanzado desde la compra (% y nominal contra la compra). */
  maxPeak: (PricePoint & { pct: number; nominal: number }) | null;
};
export type DrawdownResult = {
  date: string; instrument: Instrument; bht: number;
  base: { price: number | null; today: string; todayPrice: number | null };
  years: YearDrawdown[];
  sinceBuy: SinceBuy;
  hold: { pct: number | null; maxDd: MaxDd | null };
  /** Sistema real desde la fecha (lo agrega el servicio; ruta VOO para el S&P 500 y QQQ para QQQ/TQQQ). */
  system?: SystemSince | null;
};

/** Caída máxima de una serie de valores (desde su pico acumulado). */
export function maxDrawdown(dates: string[], values: number[]): MaxDd | null {
  if (!values.length) return null;
  let peak = values[0], peakD = dates[0], best: MaxDd = { pct: 0, peakDate: null, troughDate: null };
  for (let k = 0; k < values.length; k++) {
    if (values[k] > peak) { peak = values[k]; peakD = dates[k]; }
    const dd = (values[k] / peak - 1) * 100;
    if (dd < best.pct) best = { pct: dd, peakDate: peakD, troughDate: dates[k] };
  }
  return best;
}

export function computeBhtDrawdowns(s: StrategySeries, date: string, instrument: Instrument): DrawdownResult | null {
  const i = lastOnOrBefore(s.dates, date);
  if (i < 0 || s.bht[i] == null) return null;
  const px = s.px[instrument];
  const last = s.dates.length - 1, today = s.dates[last];
  const p0 = px[i] ?? null;
  // Último precio disponible (hoy puede no tener cierre aún).
  let lastPx: number | null = null;
  for (let k = last; k >= i && lastPx == null; k--) lastPx = px[k];

  // 1) Caída máxima por año, desde el pico acumulado desde la compra.
  const years: YearDrawdown[] = [];
  let peak = p0, peakD: string | null = p0 != null ? s.dates[i] : null;
  let j = i + 1;
  for (let y = 1; y <= DD_YEARS; y++) {
    const from = addYears(s.dates[i], y - 1), to = addYears(s.dates[i], y);
    const row: YearDrawdown = { year: y, from, to, partial: to > today, peakDate: null, peakPrice: null, troughDate: null, troughPrice: null, ddPct: null, vsBasePct: null };
    if (from > today || p0 == null) { years.push(row); continue; }
    let best: { dd: number; k: number; peak: number; peakD: string } | null = null;
    for (; j <= last && s.dates[j] <= to; j++) {
      const p = px[j];
      if (p == null) continue;
      if (peak == null || p > peak) { peak = p; peakD = s.dates[j]; }
      const dd = (p / peak - 1) * 100;
      if (!best || dd < best.dd) best = { dd, k: j, peak, peakD: peakD! };
    }
    if (best) {
      Object.assign(row, {
        peakDate: best.peakD, peakPrice: best.peak, troughDate: s.dates[best.k], troughPrice: px[best.k],
        ddPct: best.dd, vsBasePct: (px[best.k]! / p0 - 1) * 100,
      });
    }
    years.push(row);
  }

  // 3) Desde la compra hasta hoy: caída máxima y pico máximo, con el BHT del día (último BHT ≤ ese día).
  const sinceBuy: SinceBuy = { maxDd: null, maxPeak: null };
  if (p0 != null) {
    let lastBht: number | null = null;
    const bhtAt: (number | null)[] = [];
    for (let k = 0; k <= last; k++) { if (s.bht[k] != null) lastBht = s.bht[k]; bhtAt[k] = lastBht; }
    const pt = (k: number): PricePoint => ({ date: s.dates[k], price: px[k]!, bht: bhtAt[k] });
    let peakK = i, hiK = i, best: { dd: number; peakK: number; k: number } | null = null;
    for (let k = i + 1; k <= last; k++) {
      const p = px[k];
      if (p == null) continue;
      if (p > px[peakK]!) peakK = k;
      if (p > px[hiK]!) hiK = k;
      const dd = (p / px[peakK]! - 1) * 100;
      if (dd < 0 && (!best || dd < best.dd)) best = { dd, peakK, k };
    }
    if (best) {
      sinceBuy.maxDd = {
        pct: best.dd, nominal: px[best.k]! - px[best.peakK]!, vsBasePct: (px[best.k]! / p0 - 1) * 100,
        peak: pt(best.peakK), trough: pt(best.k),
      };
    }
    if (hiK > i) sinceBuy.maxPeak = { ...pt(hiK), pct: (px[hiK]! / p0 - 1) * 100, nominal: px[hiK]! - p0 };
  }

  // Hold completo del instrumento desde la fecha (rendimiento a hoy y caída máxima).
  const hd: string[] = [], hv: number[] = [];
  if (p0 != null) for (let k = i; k <= last; k++) if (px[k] != null) { hd.push(s.dates[k]); hv.push(px[k]! / p0); }
  return {
    date: s.dates[i], instrument, bht: s.bht[i]!,
    base: { price: p0, today, todayPrice: lastPx },
    years,
    sinceBuy,
    hold: { pct: p0 != null && lastPx != null ? (lastPx / p0 - 1) * 100 : null, maxDd: maxDrawdown(hd, hv) },
  };
}
