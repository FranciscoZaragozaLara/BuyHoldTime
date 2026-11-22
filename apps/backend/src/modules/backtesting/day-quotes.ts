// Cotización del día para el encabezado del hover del BHT: precio, cambio diario, % desde el máximo
// (ATH; si ocurrió hace más de 5 años, el máximo de los últimos 5 años: misma regla que la caída desde ATH) y
// % desde el último mínimo (piso de la última corrección).
import { athAt } from './tranches';

export type DayQuote = {
  price: number; change: number | null; fromHigh: number | null; high: number | null; highDate: string | null; window5y: boolean;
  fromBottom: number | null; bottom: number | null; bottomDate: string | null;
};

/** Umbral de corrección para el último mínimo: 10% en el S&P 500 y QQQ; 30% en TQQQ (3×). */
export const BOTTOM_DROP = { spx: 0.1, qqq: 0.1, tqqq: 0.3 } as const;

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

export function dayQuote(dates: string[], px: Array<number | null>, D: number, drop = 0.1): DayQuote | null {
  const price = px[D];
  if (D < 0 || price == null) return null;
  let prev: number | null = null;
  for (let k = D - 1; k >= 0; k--) if (px[k] != null) { prev = px[k]; break; }
  const a = athAt(dates, px, D);
  const b = lastBottom(dates, px, D, drop);
  return {
    price,
    change: prev ? (price / prev - 1) * 100 : null,
    fromHigh: a ? a.pct : null, high: a ? a.price : null, highDate: a ? a.date : null, window5y: a?.window5y ?? false,
    fromBottom: b ? (price / b.price - 1) * 100 : null, bottom: b?.price ?? null, bottomDate: b?.date ?? null,
  };
}
