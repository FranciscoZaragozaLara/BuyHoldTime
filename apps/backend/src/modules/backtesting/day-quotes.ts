// Cotización del día para el encabezado del hover del BHT: precio, cambio diario y % desde el máximo
// (ATH; si ocurrió hace más de 5 años, el máximo de los últimos 5 años: misma regla que la caída desde ATH).
import { athAt } from './tranches';

export type DayQuote = { price: number; change: number | null; fromHigh: number | null; high: number | null; highDate: string | null; window5y: boolean };

export function dayQuote(dates: string[], px: Array<number | null>, D: number): DayQuote | null {
  const price = px[D];
  if (D < 0 || price == null) return null;
  let prev: number | null = null;
  for (let k = D - 1; k >= 0; k--) if (px[k] != null) { prev = px[k]; break; }
  const a = athAt(dates, px, D);
  return {
    price,
    change: prev ? (price / prev - 1) * 100 : null,
    fromHigh: a ? a.pct : null, high: a ? a.price : null, highDate: a ? a.date : null, window5y: a?.window5y ?? false,
  };
}
