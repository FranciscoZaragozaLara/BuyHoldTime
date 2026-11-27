// Fundamentales de los últimos 12 meses (TTM) para la lista de /prices, desde los trimestres de EDGAR
// (historical_eps_quarterly): ingresos, EPS diluido, utilidad operativa (EBIT) y margen operativo, cada uno con su cambio
// contra los 12 meses previos, y el P/E de hoy contra el de hace un año.
//
// Cada métrica suma sus 4 trimestres más recientes solo si son consecutivos (≈ 3 meses entre fechas) y el último no es
// viejo: un hueco o una serie que dejó de actualizarse daría un TTM falso. El crecimiento usa los 4 trimestres previos
// (necesita 8 consecutivos) y es null si la base es ≤ 0: de pérdida a ganancia no hay un % que signifique algo.

export type QuarterFundamentals = { date: string; revenue: number | null; eps: number | null; operatingIncome: number | null; netIncome?: number | null };
export type Ttm = { ttm: number; prev: number | null; yoy: number | null; lastQuarter: string };
export type PeChange = { now: number; prev: number; yoy: number };
export type Fundamentals = {
  revenue: Ttm | null;
  eps: Ttm | null;
  ebit: Ttm | null;
  /** Margen operativo (EBIT ÷ ingresos, %) de los últimos 12 meses y de los 12 previos. */
  margin: { now: number; prev: number | null } | null;
  /** P/E con el precio en vivo y el EPS TTM, contra el precio de hace un año y el EPS TTM de entonces. */
  pe: PeChange | null;
  /** Precio ÷ ventas por acción (acciones diluidas implícitas = utilidad neta TTM ÷ EPS TTM); null sin utilidad neta. */
  ps: number | null;
  /** Rendimiento de las utilidades: EPS TTM ÷ precio, en %. */
  earningsYield: number | null;
};

const DAY = 864e5;
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;
/** Último trimestre aceptado: a lo más ~6.5 meses antes de hoy (un trimestre + plazo de reporte + margen). */
export const TTM_MAX_AGE_DAYS = 200;
/** P/E por debajo de esto = utilidades en otra moneda o por otra clase de acción que el precio. */
export const MIN_PLAUSIBLE_PE = 3;

/** TTM de una serie trimestral (fecha → valor); null si no hay 4 trimestres consecutivos recientes. */
export function ttmOf(points: Array<[string, number | null | undefined]>, today: string): Ttm | null {
  const byDate = new Map<string, number>();
  for (const [d, v] of points) if (d && v != null && Number.isFinite(v)) byDate.set(d, v);
  const qs = [...byDate].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // más reciente primero
  if (qs.length < 4 || days(today, qs[0][0]) > TTM_MAX_AGE_DAYS) return null;
  let run = 1;
  while (run < Math.min(qs.length, 8)) {
    const gap = days(qs[run - 1][0], qs[run][0]);
    if (gap < 60 || gap > 120) break;
    run++;
  }
  if (run < 4) return null;
  const sum = (from: number) => qs.slice(from, from + 4).reduce((m, q) => m + q[1], 0);
  const ttm = sum(0);
  const prev = run >= 8 ? sum(4) : null;
  return { ttm, prev, yoy: prev != null && prev > 0 ? (ttm / prev - 1) * 100 : null, lastQuarter: qs[0][0] };
}

/**
 * @param price  precio en vivo (o último cierre)
 * @param price1y cierre de hace un año (el mismo de "1A" en la lista)
 */
export function fundamentals(quarters: QuarterFundamentals[], today: string, price: number | null, price1y: number | null): Fundamentals | null {
  const revenue = ttmOf(quarters.map((q) => [q.date, q.revenue]), today);
  const eps = ttmOf(quarters.map((q) => [q.date, q.eps]), today);
  const ebit = ttmOf(quarters.map((q) => [q.date, q.operatingIncome]), today);
  if (!revenue && !eps && !ebit) return null;
  // Unidades distintas a las del precio (ADR de una empresa que reporta en su moneda, p. ej. TSM en NT$ por acción
  // local contra un ADR en USD): un P/E menor a 3 no es real. Sin forma de convertir, mejor nada que montos falsos.
  if (eps && eps.ttm > 0 && price != null && price > 0 && price / eps.ttm < MIN_PLAUSIBLE_PE) return null;
  // Margen solo si EBIT e ingresos cubren los mismos trimestres.
  const margin = revenue && ebit && revenue.lastQuarter === ebit.lastQuarter && revenue.ttm > 0
    ? { now: (ebit.ttm / revenue.ttm) * 100, prev: ebit.prev != null && revenue.prev != null && revenue.prev > 0 ? (ebit.prev / revenue.prev) * 100 : null }
    : null;
  // P/E: solo con utilidades positivas en ambos momentos (con pérdidas el P/E no se define).
  const pe = eps && eps.ttm > 0 && eps.prev != null && eps.prev > 0 && price != null && price > 0 && price1y != null && price1y > 0
    ? (() => { const now = price / eps.ttm, prev = price1y / eps.prev!; return { now, prev, yoy: (now / prev - 1) * 100 }; })()
    : null;
  // P/S sin depender de un conteo de acciones (que en EDGAR no viene ajustado por splits): las acciones diluidas
  // implícitas salen de la utilidad neta y el EPS del mismo periodo.
  const ni = quarters.some((q) => q.netIncome != null) ? ttmOf(quarters.map((q) => [q.date, q.netIncome]), today) : null;
  const ps = revenue && eps && ni && ni.lastQuarter === eps.lastQuarter && revenue.lastQuarter === eps.lastQuarter
    && eps.ttm > 0 && ni.ttm > 0 && revenue.ttm > 0 && price != null && price > 0
    ? price / (revenue.ttm / (ni.ttm / eps.ttm))
    : null;
  const earningsYield = eps && price != null && price > 0 ? (eps.ttm / price) * 100 : null;
  return { revenue, eps, ebit, margin, pe, ps, earningsYield };
}
