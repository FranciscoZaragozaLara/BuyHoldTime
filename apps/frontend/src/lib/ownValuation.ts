// Valuación propia de la ficha de una acción, solo con datos de EDGAR, la cotización y el P/E terminal del sector
// (tabla propia sector_terminal_pe). Sustituye al GF Value y GF Score de GuruFocus.
//
// Valor estimado = EPS de los próximos 12 meses (proyección de la ficha: modelo propio + consenso de analistas, ver
// backend domain/eps-projection.ts) × P/E terminal del sector. Es una referencia transparente, no un precio objetivo.

/** P/E con el precio y el EPS de 12 meses de EDGAR; si no hay, el de la cotización; menor a 3 se descarta. */
export function trailingPe(price: number | null | undefined, epsTtm: number | null | undefined, quotePe?: number | null): number | null {
  if (price != null && price > 0 && epsTtm != null && epsTtm > 0 && price / epsTtm >= 3) return price / epsTtm;
  return quotePe != null && quotePe >= 3 ? quotePe : null;
}

export interface FairValue { value: number; epsNext12m: number; terminalPe: number; diffPct: number | null }

export function fairValue(epsNext12m: number | null | undefined, terminalPe: number | null | undefined, price?: number | null): FairValue | null {
  if (epsNext12m == null || epsNext12m <= 0 || terminalPe == null || terminalPe <= 0) return null;
  const value = epsNext12m * terminalPe;
  return { value, epsNext12m, terminalPe, diffPct: price != null && price > 0 ? (price / value - 1) * 100 : null };
}

export type ValuationLabel = 'undervalued' | 'fair' | 'overvalued';

/** Precio vs valor estimado: más de 20 % arriba = cara; más de 15 % abajo = barata. */
export function valuationLabel(diffPct: number | null): ValuationLabel | null {
  if (diffPct == null) return null;
  return diffPct > 20 ? 'overvalued' : diffPct < -15 ? 'undervalued' : 'fair';
}
