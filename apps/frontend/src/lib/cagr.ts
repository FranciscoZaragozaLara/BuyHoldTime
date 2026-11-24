/** Años entre dos fechas ISO (365.25 días por año). */
export function yearsBetween(from: string, to: string): number {
  return (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / (365.25 * 86400000);
}

/**
 * CAGR (%) equivalente a un rendimiento total (%) en `years` años. Null con menos de 1 año (anualizar plazos cortos
 * exagera: +8% en 2 meses daría +59% al año) o si el total no es válido.
 */
export function cagrFromTotal(totalPct: number | null | undefined, years: number): number | null {
  if (totalPct == null || !Number.isFinite(totalPct) || years < 1) return null;
  const g = 1 + totalPct / 100;
  if (g <= 0) return -100;
  return (Math.pow(g, 1 / years) - 1) * 100;
}
