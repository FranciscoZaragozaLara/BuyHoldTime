// Navegación con teclado en las gráficas del BHT: ← → mueven el crosshair un día con dato.

/** Índice al moverse `delta` días desde `cur` en `dates` (ordenadas). Sin fecha actual arranca en la última;
 *  si `cur` no está, parte del último día ≤ cur. Siempre dentro de los límites; -1 si no hay fechas. */
export function stepIndex(dates: string[], cur: string | null | undefined, delta: number): number {
  if (!dates.length) return -1;
  if (!cur) return dates.length - 1;
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= cur) lo = mid + 1; else hi = mid; }
  const base = lo - 1; // último ≤ cur (-1 si cur es anterior a todas)
  if (base < 0) return delta > 0 ? Math.min(delta - 1, dates.length - 1) : 0;
  return Math.max(0, Math.min(dates.length - 1, base + delta));
}
