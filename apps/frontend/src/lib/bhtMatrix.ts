// Matriz BHT × tendencia (la del popover "Estrategia"): celdas por banda del BHT y régimen tendencial con el
// rendimiento promedio a 12 meses y el riesgo del camino. La usa la tabla de rendimientos históricos de la home.
export type MatrixCell = { band: number; regime: string; n: number; avg12m: number | null; pos12m: number | null; avgMdd: number | null; pDd15: number | null };
export type MatrixInstrument = 'spx' | 'qqq' | 'tqqq';
export type MatrixWindow = '5y' | 'all';
export const MATRIX_INSTRUMENTS: MatrixInstrument[] = ['spx', 'qqq', 'tqqq'];
export const MATRIX_LABEL: Record<MatrixInstrument, string> = { spx: 'S&P 500', qqq: 'Nasdaq-100', tqqq: 'TQQQ 3×' };

/** Celda de la combinación de hoy; null si no existe o no tiene días. */
export function matrixCell(cells: MatrixCell[] | null | undefined, band: number, regime: string | null | undefined): MatrixCell | null {
  if (!cells || !regime) return null;
  const c = cells.find((x) => x.band === band && x.regime === regime);
  return c && c.n > 0 ? c : null;
}

/** Celdas de la matriz de un instrumento desde /api/backtesting/bht-strategy (la matriz no depende de la fecha). */
export async function fetchMatrixCells(base: string, date: string, inst: MatrixInstrument, win: MatrixWindow, init?: RequestInit): Promise<MatrixCell[] | null> {
  try {
    const r = await fetch(`${base}/api/backtesting/bht-strategy?date=${date}&instrument=${inst}&window=${win}`, init);
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.matrix?.cells) ? (j.matrix.cells as MatrixCell[]) : null;
  } catch {
    return null;
  }
}
