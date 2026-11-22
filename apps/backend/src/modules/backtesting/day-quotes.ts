// Cotización del día para el encabezado del hover del BHT: precio, cambio diario, % desde el máximo
// (ATH; si ocurrió hace más de 5 años, el máximo de los últimos 5 años: misma regla que la caída desde ATH) y
// % desde el último mínimo (piso de la última corrección fuerte, ≥ 15%).
import { athAt } from './tranches';

export type DayQuote = {
  price: number; change: number | null; fromHigh: number | null; high: number | null; highDate: string | null; window5y: boolean;
  fromBottom: number | null; bottom: number | null; bottomDate: string | null;
};

/** Corrección fuerte para el último mínimo: caída ≥ 15% (atrapa 2018, 2020, 2022 y abril de 2025 en el S&P 500, que
 *  con 20% se perderían; con 10% contaban sacudidas como la de marzo de 2021). TQQQ usa la fecha del mínimo de QQQ. */
export const BOTTOM_DROP = 0.15;

/**
 * Último mínimo hasta el día D (zigzag): una corrección empieza cuando el precio cae `drop` desde su máximo y su piso
 * es el cierre más bajo hasta que rebota `drop` desde ese piso (o hasta D si sigue en curso). Devuelve el piso de la
 * corrección más reciente; null si no hubo ninguna.
 */
export function lastBottom(dates: string[], px: Array<number | null>, D: number, drop: number): { price: number; date: string } | null {
  let up = true, hi = -Infinity, lo = Infinity, li = -1;
  let last: { price: number; date: string } | null = null;
  for (let k = 0; k <= D; k++) {
    const v = px[k];
    if (v == null) continue;
    if (up) {
      if (v > hi) hi = v;
      if (v <= hi * (1 - drop)) { up = false; lo = v; li = k; }
    } else {
      if (v < lo) { lo = v; li = k; }
      if (v >= lo * (1 + drop)) { up = true; hi = v; }
    }
    if (li >= 0) last = { price: lo, date: dates[li] };
  }
  return last;
}

/** bottomDate: fecha del mínimo impuesta (TQQQ usa la de QQQ); el precio es el cierre de ese día o el previo disponible. */
export function dayQuote(dates: string[], px: Array<number | null>, D: number, drop = BOTTOM_DROP, bottomDate?: string | null): DayQuote | null {
  const price = px[D];
  if (D < 0 || price == null) return null;
  let prev: number | null = null;
  for (let k = D - 1; k >= 0; k--) if (px[k] != null) { prev = px[k]; break; }
  const a = athAt(dates, px, D);
  let b: { price: number; date: string } | null;
  if (bottomDate !== undefined) {
    b = null;
    if (bottomDate) for (let k = Math.min(D, dates.length - 1); k >= 0; k--) if (dates[k] <= bottomDate && px[k] != null) { b = { price: px[k] as number, date: dates[k] }; break; }
  } else b = lastBottom(dates, px, D, drop);
  return {
    price,
    change: prev ? (price / prev - 1) * 100 : null,
    fromHigh: a ? a.pct : null, high: a ? a.price : null, highDate: a ? a.date : null, window5y: a?.window5y ?? false,
    fromBottom: b ? (price / b.price - 1) * 100 : null, bottom: b?.price ?? null, bottomDate: b?.date ?? null,
  };
}
