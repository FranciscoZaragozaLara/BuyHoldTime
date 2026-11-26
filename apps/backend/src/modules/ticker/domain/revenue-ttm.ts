// Ingresos de los últimos 12 meses (TTM) para la lista de /prices: suma de los 4 trimestres más recientes de EDGAR
// (historical_eps_quarterly) y crecimiento contra los 4 anteriores. Solo cuenta si los trimestres son consecutivos
// (≈ 3 meses entre fechas) y el último no es viejo: un hueco o una serie que dejó de actualizarse daría un TTM falso.

export type QuarterRevenue = { date: string; revenue: number | null };
export type RevenueTtm = { ttm: number; lastQuarter: string; yoy: number | null };

const DAY = 864e5;
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;
/** Último trimestre aceptado: a lo más ~6.5 meses antes de hoy (un trimestre + plazo de reporte + margen). */
export const REVENUE_MAX_AGE_DAYS = 200;

export function revenueTtm(quarters: QuarterRevenue[], today: string): RevenueTtm | null {
  const byDate = new Map<string, number>();
  for (const q of quarters) if (q.date && q.revenue != null && Number.isFinite(q.revenue)) byDate.set(q.date, q.revenue);
  const qs = [...byDate].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // más reciente primero
  if (qs.length < 4 || days(today, qs[0][0]) > REVENUE_MAX_AGE_DAYS) return null;
  // Cuántos trimestres consecutivos hay desde el más reciente (fechas separadas 60–120 días).
  let run = 1;
  while (run < Math.min(qs.length, 8) && days(qs[run - 1][0], qs[run][0]) >= 60 && days(qs[run - 1][0], qs[run][0]) <= 120) run++;
  if (run < 4) return null;
  const sum = (from: number) => qs.slice(from, from + 4).reduce((m, q) => m + q[1], 0);
  const ttm = sum(0);
  const prev = run >= 8 ? sum(4) : null;
  return { ttm, lastQuarter: qs[0][0], yoy: prev != null && prev > 0 ? (ttm / prev - 1) * 100 : null };
}
