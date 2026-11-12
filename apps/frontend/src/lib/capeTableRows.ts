/**
 * Filas de la tabla "CAPE Shiller — SP500 / Nasdaq / TQQQ".
 *
 * Las filas salen de la serie CAPE diaria. Si esa serie falta (endpoint vacío o
 * caído), se usan los días hábiles del SP500 (^GSPC, en BD) desde `from`, para
 * que la tabla siga mostrando precios, tasas y BHT con las columnas CAPE en "—"
 * en lugar de quedar vacía.
 */
export function buildCapeTableRows<T extends { date: string }>(
  cape: T[],
  spxDates: Iterable<string> | undefined,
  from = '1990-01-01',
): (T | { date: string })[] {
  if (cape.length) return cape;
  if (!spxDates) return [];
  const isWeekday = (d: string) => {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    return wd >= 1 && wd <= 5;
  };
  return Array.from(new Set(Array.from(spxDates, (d) => d.slice(0, 10))))
    .filter((d) => d >= from && isWeekday(d))
    .sort()
    .map((date) => ({ date }));
}
