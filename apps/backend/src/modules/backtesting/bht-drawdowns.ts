// Vista "Drawdowns" del popover del BHT (se calcula bajo demanda, solo al pulsar el botón):
// 1) Caída máxima del instrumento en cada año posterior a la fecha (años 1..5): desde el pico acumulado desde la
//    compra hasta el valle de ese año (fecha y precio de ambos, % de caída y precio del valle contra la compra).
// 2) Tramos con el BHT: se parte 100% invertido en 4 tramos iguales.
//    - Venta: escalera 72 → 77 → 82 → 87+, ≥15 días entre ventas; si el BHT baja de 62, la escalera vuelve a 72.
//    - Compra (con el efectivo de lo vendido): BHT < 60 → 55 → 50 → 45, ≥15 días entre compras; si el BHT sube
//      de 68, la escalera vuelve a 60.
//    Comparado con Hold completo (todo invertido hasta hoy): rendimiento a hoy y caída máxima de cada estrategia.
// 2b) Tramos + tendencia: misma escalera, pero una compra con el S&P 500 abajo de su SMA 200 queda pendiente y se
//     ejecuta al recuperarla (esperar confirmación); y con BHT ≥ 50 (Neutral o más caro), perder la SMA 200 vende un
//     tramo extra. Elegida en un backtest de compras mensuales 1994–2023 contra variantes (umbral 62/50/40, 1/2/4
//     tramos, con/sin filtro de compra): reduce la caída máxima promedio 7–11 puntos en S&P 500/QQQ con ~0.5 pt menos
//     de CAGR que los tramos sin tendencia, y en TQQQ mejora ambos.
// 3) Desde la compra hasta hoy: la caída máxima (pico → valle) y el pico máximo, con precio, %, fecha y BHT del día.
import { addYears, daysBetween, lastOnOrBefore, type Instrument, type StrategySeries } from './bht-strategy';

export const SELL_LEVELS = [72, 77, 82, 87] as const;
/** Compra cuando el BHT queda por debajo del nivel vigente. */
export const BUY_LEVELS = [60, 55, 50, 45] as const;
/** Días mínimos entre dos ventas y entre dos compras. */
export const MIN_GAP_DAYS = 15;
/** Si el BHT baja de este nivel, la escalera de venta vuelve a 72. */
export const SELL_RESET_BELOW = 62;
/** Si el BHT sube de este nivel, la escalera de compra vuelve a 60. */
export const BUY_RESET_ABOVE = 68;
export const DD_YEARS = 5;
const SLOTS = 4;

export type YearDrawdown = {
  year: number; from: string; to: string; partial: boolean;
  peakDate: string | null; peakPrice: number | null; troughDate: string | null; troughPrice: number | null;
  ddPct: number | null; vsBasePct: number | null;
};
export type TrancheTrade = {
  type: 'sell' | 'buy'; level: number; date: string; price: number;
  bhtPrev: number | null; bhtHit: number; vsBasePct: number; invested: number;
  /** ladder: escalón del BHT · trend: por la SMA 200 (compra pendiente que se ejecuta / venta al perderla). */
  reason?: 'ladder' | 'trend';
};
/** Con BHT ≥ este nivel (Neutral o más caro), perder la SMA 200 vende un tramo extra (variante con tendencia). */
export const TREND_SELL_MIN_BHT = 50;
const ABOVE_200 = new Set(['UPTREND', 'PULLBACK']);
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
  trades: TrancheTrade[];
  hold: { pct: number | null; maxDd: MaxDd | null };
  tranches: { pct: number | null; maxDd: MaxDd | null; invested: number; cashPct: number | null };
  /** Variante con filtro de tendencia (null si la serie no trae el régimen). */
  tranchesTrend: { pct: number | null; maxDd: MaxDd | null; invested: number; cashPct: number | null; trades: TrancheTrade[]; pending: number } | null;
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

/**
 * Simulación de los tramos desde el día `i` (compra al cierre de ese día). Cada tramo es 25% del capital
 * inicial: vender lo pasa a efectivo (sin rendimiento) y comprar usa el efectivo de un tramo vendido.
 * Devuelve las operaciones y el valor diario de la cartera y de Hold completo (base 1).
 */
export type TrendOpts = {
  trend?: boolean;
  /** BHT mínimo para vender al perder la SMA 200 (por defecto TREND_SELL_MIN_BHT). */
  sellMinBht?: number;
  /** Tramos que se venden al perder la SMA 200 (por defecto 1). */
  sellCount?: number;
  /** Filtrar compras abajo de la SMA 200 (por defecto sí). */
  buyFilter?: boolean;
};
export function simulateTranches(s: StrategySeries, i: number, instrument: Instrument, opts: TrendOpts = {}) {
  const useTrend = !!opts.trend && !!s.trend;
  const sellMinBht = opts.sellMinBht ?? TREND_SELL_MIN_BHT, sellCount = opts.sellCount ?? 1, buyFilter = opts.buyFilter ?? true;
  // Sin régimen conocido ese día no se filtra (se trata como arriba de la SMA 200).
  const above200 = (j: number) => !useTrend || s.trend![j] == null || ABOVE_200.has(s.trend![j]!);
  const px = s.px[instrument];
  const p0 = px[i];
  const trades: TrancheTrade[] = [];
  const dates: string[] = [], values: number[] = [], hold: number[] = [];
  if (p0 == null) return { trades, dates, values, hold, invested: 0, cash: 0, pending: 0 };
  // Tramo invertido: unidades; vendido: efectivo.
  const slots: Array<{ units: number } | { cash: number }> = Array.from({ length: SLOTS }, () => ({ units: 1 / SLOTS / p0 }));
  let sellLv = 0, buyLv = 0;
  let lastSell: string | null = null, lastBuy: string | null = null, prevB: number | null = s.bht[i];
  // Compras pendientes (bloqueadas por estar abajo de la SMA 200) y si el día anterior estaba arriba de ella.
  let pending = 0, wasAbove = above200(i);
  dates.push(s.dates[i]); values.push(1); hold.push(1);
  for (let j = i + 1; j < s.dates.length; j++) {
    const b = s.bht[j], p = px[j];
    if (p == null) continue;
    if (b != null) {
      if (b < SELL_RESET_BELOW) sellLv = 0;
      if (b > BUY_RESET_ABOVE) buyLv = 0;
      const inv = slots.findIndex((x) => 'units' in x);
      const cashIdx = slots.findIndex((x) => 'cash' in x);
      const gap = (last: string | null) => last == null || daysBetween(last, s.dates[j]) >= MIN_GAP_DAYS;
      const count = () => slots.filter((x) => 'units' in x).length;
      const up = above200(j);
      const sell = (level: number, reason: TrancheTrade['reason']) => {
        const u = (slots[inv] as { units: number }).units;
        slots[inv] = { cash: u * p };
        trades.push({ type: 'sell', level, date: s.dates[j], price: p, bhtPrev: prevB, bhtHit: b, vsBasePct: (p / p0 - 1) * 100, invested: count(), reason });
        lastSell = s.dates[j];
      };
      const buy = (level: number, reason: TrancheTrade['reason']) => {
        const c = (slots[cashIdx] as { cash: number }).cash;
        slots[cashIdx] = { units: c / p };
        trades.push({ type: 'buy', level, date: s.dates[j], price: p, bhtPrev: prevB, bhtHit: b, vsBasePct: (p / p0 - 1) * 100, invested: count(), reason });
        lastBuy = s.dates[j];
      };
      const cashSlots = slots.filter((x) => 'cash' in x).length;
      if (inv >= 0 && b >= SELL_LEVELS[sellLv] && gap(lastSell)) {
        sell(SELL_LEVELS[sellLv], 'ladder');
        sellLv = Math.min(sellLv + 1, SELL_LEVELS.length - 1);
      } else if (useTrend && inv >= 0 && wasAbove && !up && b >= sellMinBht && gap(lastSell)) {
        // Perdió la SMA 200 sin estar barato: vende `sellCount` tramos (los que haya invertidos).
        for (let k = 0; k < sellCount; k++) {
          const ix = slots.findIndex((x) => 'units' in x);
          if (ix < 0) break;
          const u = (slots[ix] as { units: number }).units;
          slots[ix] = { cash: u * p };
          trades.push({ type: 'sell', level: 200, date: s.dates[j], price: p, bhtPrev: prevB, bhtHit: b, vsBasePct: (p / p0 - 1) * 100, invested: count(), reason: 'trend' });
        }
        lastSell = s.dates[j];
      } else if (cashIdx >= 0 && cashSlots > pending && b < BUY_LEVELS[buyLv] && gap(lastBuy)) {
        if (up || !buyFilter) buy(BUY_LEVELS[buyLv], 'ladder');
        else { pending++; lastBuy = s.dates[j]; } // espera a que recupere la SMA 200
        buyLv = Math.min(buyLv + 1, BUY_LEVELS.length - 1);
      } else if (pending > 0 && up && cashIdx >= 0 && gap(lastBuy)) {
        buy(200, 'trend'); // recuperó la SMA 200: se ejecuta una compra pendiente
        pending--;
      }
      if (!slots.some((x) => 'cash' in x)) pending = 0;
      wasAbove = up;
      prevB = b;
    }
    dates.push(s.dates[j]);
    values.push(slots.reduce((m, x) => m + ('units' in x ? x.units * p : x.cash), 0));
    hold.push(p / p0);
  }
  const cash = slots.reduce((m, x) => m + ('cash' in x ? x.cash : 0), 0);
  return { trades, dates, values, hold, invested: slots.filter((x) => 'units' in x).length, cash, pending };
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

  // 2) Tramos con el BHT vs Hold completo.
  const sim = simulateTranches(s, i, instrument);
  const endVal = sim.values.length ? sim.values[sim.values.length - 1] : null;
  const simT = s.trend ? simulateTranches(s, i, instrument, { trend: true }) : null;
  const endT = simT?.values.length ? simT.values[simT.values.length - 1] : null;
  return {
    date: s.dates[i], instrument, bht: s.bht[i]!,
    base: { price: p0, today, todayPrice: lastPx },
    years,
    sinceBuy,
    trades: sim.trades,
    hold: { pct: p0 != null && lastPx != null ? (lastPx / p0 - 1) * 100 : null, maxDd: maxDrawdown(sim.dates, sim.hold) },
    tranches: {
      pct: endVal != null && p0 != null ? (endVal - 1) * 100 : null,
      maxDd: maxDrawdown(sim.dates, sim.values),
      invested: sim.invested,
      cashPct: endVal ? (sim.cash / endVal) * 100 : null,
    },
    tranchesTrend: simT ? {
      pct: endT != null && p0 != null ? (endT - 1) * 100 : null,
      maxDd: maxDrawdown(simT.dates, simT.values),
      invested: simT.invested,
      cashPct: endT ? (simT.cash / endT) * 100 : null,
      trades: simT.trades,
      pending: simT.pending,
    } : null,
  };
}
