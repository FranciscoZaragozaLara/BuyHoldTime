// Vista "Drawdowns" del popover del BHT (se calcula bajo demanda, solo al pulsar el botón):
// 1) Episodios de caída desde la fecha hasta hoy: cada caída ≥ umbral (10% en S&P 500/QQQ, 30% en TQQQ) desde un
//    pico hasta su valle, que termina al recuperar ese pico (o sigue en curso). No se traslapan: cada uno tiene su
//    propio pico.
// 2) El sistema BuyHoldTime desde esa fecha (escaleras de venta V1–V5, compra T0–T4 y red de seguridad, las mismas de
//    la gráfica y de la pestaña Tranches) contra Hold: lo agrega el servicio con systemSince (reentry.ts). Antes había
//    aquí una escalera propia (vender con BHT 72/77/82/87 y recomprar con < 60/55/50/45) que contradecía a las demás.
// 3) Desde la compra hasta hoy: la caída máxima (pico → valle) y el pico máximo, con precio, %, fecha y BHT del día.
import { daysBetween, lastOnOrBefore, type Instrument, type StrategySeries } from './bht-strategy';
import type { SystemSince } from './reentry';

/** Caída mínima para contar un episodio (desde su pico): 10% en 1× (corrección) y 30% en TQQQ (~3×). */
export const EPISODE_MIN_DD: Record<Instrument, number> = { spx: 10, qqq: 10, tqqq: 30 };
export type DrawdownEpisode = {
  peakDate: string; peakPrice: number; peakBht: number | null; peakVsBasePct: number;
  troughDate: string; troughPrice: number; troughBht: number | null; vsBasePct: number;
  /** Del pico al valle (%). */
  ddPct: number;
  /** Día en que el precio volvió al pico (null = sin recuperar todavía). */
  recoveryDate: string | null;
  /** Días naturales del pico al valle y del pico a la recuperación. */
  daysToTrough: number; daysToRecovery: number | null;
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
  /** Episodios de caída ≥ minDd desde la fecha (el último puede seguir en curso). */
  episodes: DrawdownEpisode[];
  minDd: number;
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

  // BHT vigente cada día (último BHT ≤ ese día).
  const bhtAt: (number | null)[] = [];
  { let lb: number | null = null; for (let k = 0; k <= last; k++) { if (s.bht[k] != null) lb = s.bht[k]; bhtAt[k] = lb; } }

  // 1) Episodios de caída: pico → valle (≥ minDd) → recuperación del pico.
  const minDd = EPISODE_MIN_DD[instrument];
  const episodes: DrawdownEpisode[] = [];
  if (p0 != null) {
    let pk = i, tr = i;
    const push = (rec: number | null) => {
      const dd = (px[tr]! / px[pk]! - 1) * 100;
      if (dd > -minDd) return;
      episodes.push({
        peakDate: s.dates[pk], peakPrice: px[pk]!, peakBht: bhtAt[pk], peakVsBasePct: (px[pk]! / p0 - 1) * 100,
        troughDate: s.dates[tr], troughPrice: px[tr]!, troughBht: bhtAt[tr], vsBasePct: (px[tr]! / p0 - 1) * 100,
        ddPct: dd, recoveryDate: rec != null ? s.dates[rec] : null,
        daysToTrough: daysBetween(s.dates[pk], s.dates[tr]), daysToRecovery: rec != null ? daysBetween(s.dates[pk], s.dates[rec]) : null,
      });
    };
    for (let k = i + 1; k <= last; k++) {
      const p = px[k];
      if (p == null) continue;
      if (p >= px[pk]!) { if (tr !== pk) push(k); pk = k; tr = k; }
      else if (p < px[tr]!) tr = k;
    }
    if (tr !== pk) push(null); // en curso
  }

  // 3) Desde la compra hasta hoy: caída máxima y pico máximo, con el BHT del día (último BHT ≤ ese día).
  const sinceBuy: SinceBuy = { maxDd: null, maxPeak: null };
  if (p0 != null) {
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
    episodes, minDd,
    sinceBuy,
    hold: { pct: p0 != null && lastPx != null ? (lastPx / p0 - 1) * 100 : null, maxDd: maxDrawdown(hd, hv) },
  };
}
