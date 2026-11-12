export interface EpsQuarter {
  date: string;
  eps?: number | null;
  epsDiluted?: number | null;
}

const quarterEps = (q: EpsQuarter): number => q.epsDiluted ?? q.eps ?? 0;

/**
 * EPS de un año calendario solar.
 *
 * - Año completo (4 trimestres) o año pasado: suma de sus trimestres.
 * - Año en curso incompleto (menos de 4 trimestres): EPS de los últimos 4 trimestres
 *   (TTM) hasta el más reciente del año. Sumar solo 3 trimestres daría un EPS ~25 %
 *   menor, un crecimiento negativo falso y un P/E inflado.
 *
 * `allQuarters` puede venir en cualquier orden.
 */
export function solarYearEps(
  yearQuarters: EpsQuarter[],
  allQuarters: EpsQuarter[],
  calYear: number,
  currentYear: number,
): { eps: number; isTtm: boolean } {
  const round = (n: number) => parseFloat(n.toFixed(2));
  if (yearQuarters.length >= 4 || calYear < currentYear) {
    return { eps: round(yearQuarters.reduce((acc, q) => acc + quarterEps(q), 0)), isTtm: false };
  }
  const lastDate = yearQuarters.reduce((max, q) => (q.date > max ? q.date : max), '');
  const ttm = [...allQuarters]
    .filter((q) => q.date <= lastDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 4);
  return { eps: round(ttm.reduce((acc, q) => acc + quarterEps(q), 0)), isTtm: true };
}
