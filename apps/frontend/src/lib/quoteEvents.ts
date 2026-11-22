// Eventos del día por instrumento para el detalle del BHT: nuevo máximo (ATH, o de 5 años si el ATH es más viejo)
// o nuevo mínimo de la corrección fuerte en curso (≥ 15%). Función pura.

export type DayQuoteLite = { fromHigh: number | null; highDate: string | null; window5y: boolean; fromBottom?: number | null; bottomDate?: string | null };
export type QuoteEvent = { kind: 'high' | 'low'; window5y: boolean; fromHigh: number | null };

/** day: fecha del cierre (detail.date). Máximo: el máximo es de ese día. Mínimo: el piso de la corrección es de ese día. */
export function quoteEvent(q: DayQuoteLite | null | undefined, day: string): QuoteEvent | null {
  if (!q) return null;
  if (q.highDate === day && q.fromHigh != null && q.fromHigh >= -1e-9) return { kind: 'high', window5y: q.window5y, fromHigh: 0 };
  if (q.bottomDate === day && q.fromBottom != null && Math.abs(q.fromBottom) < 1e-9) return { kind: 'low', window5y: false, fromHigh: q.fromHigh };
  return null;
}
