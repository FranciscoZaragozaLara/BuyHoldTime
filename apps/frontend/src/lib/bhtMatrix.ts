// Matriz BHT × tendencia (la del popover "Estrategia"): celdas por banda del BHT y régimen tendencial con el
// rendimiento promedio a 12 meses y el riesgo del camino. La usa la tabla de rendimientos históricos de la home.
import { BHT_BANDS } from '@/components/backtesting/bhtBands';

/** pct = % de los días de la ventana que caen en la celda (frecuencia). */
export type MatrixCell = { band: number; regime: string; n: number; pct?: number | null; avg12m: number | null; pos12m: number | null; avgMdd: number | null; pDd15: number | null };

const mix = (a: string, b: string, t: number) => {
  const h = (c: string, k: number) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `#${[0, 1, 2].map((k) => Math.round(h(a, k) + (h(b, k) - h(a, k)) * t).toString(16).padStart(2, '0')).join('')}`;
};
/** Bandas de la matriz (7): los cortes del semáforo más 56 y 75 (mismos que el backend, `MATRIX_BAND_LO`).
 *  parent = banda del semáforo (5) a la que pertenece; la segunda mitad de una banda partida toma un tono hacia la siguiente. */
export const MATRIX_BANDS = [
  { lo: 0, range: '0–39', parent: 0, color: BHT_BANDS[0].color },
  { lo: 40, range: '40–49', parent: 1, color: BHT_BANDS[1].color },
  { lo: 50, range: '50–55', parent: 2, color: BHT_BANDS[2].color },
  { lo: 56, range: '56–61', parent: 2, color: mix(BHT_BANDS[2].color, BHT_BANDS[3].color, 0.45) },
  { lo: 62, range: '62–69', parent: 3, color: BHT_BANDS[3].color },
  { lo: 70, range: '70–74', parent: 4, color: mix(BHT_BANDS[3].color, BHT_BANDS[4].color, 0.55) },
  { lo: 75, range: '75–100', parent: 4, color: BHT_BANDS[4].color },
] as const;
export const matrixBandOf = (v: number) => { let k = 0; while (k + 1 < MATRIX_BANDS.length && v >= MATRIX_BANDS[k + 1].lo) k++; return k; };
/** Frecuencia de una banda (fila): suma de las frecuencias de sus celdas. */
export const bandPct = (cells: MatrixCell[] | null | undefined, band: number) => (cells ?? []).filter((c) => c.band === band).reduce((t, c) => t + (c.pct ?? 0), 0);
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
