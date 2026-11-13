import { PriceMap, getClosestPrice } from './thermo-history';

// Retornos forward por índice: solo horizontes maduros (objetivo <= último dato).
export const FWD_HORIZONS = [1, 2, 3, 5];

export function fwdReturn(map: PriceMap | undefined, isoDate: string, years: number, maxDate: string): number | null {
  const d = new Date(isoDate);
  d.setFullYear(d.getFullYear() + years);
  const target = d.toISOString().slice(0, 10);
  if (target > maxDate) return null;
  const p0 = getClosestPrice(map, isoDate);
  const p1 = getClosestPrice(map, target);
  if (p0 == null || p1 == null || p0 === 0) return null;
  return (p1 / p0 - 1) * 100;
}

export interface FwdDay {
  spx: number | null; ndx: number | null; tqqq: number | null;
  spxFw: (number | null)[]; ndxFw: (number | null)[]; tqqqFw: (number | null)[];
}

export function computeFwdDay(
  isoDate: string,
  maps: { spx?: PriceMap; ndx?: PriceMap; tqqq?: PriceMap },
  maxDates: { spx: string; ndx: string; tqqq: string },
): FwdDay {
  const one = (map?: PriceMap, max?: string) => {
    const price = getClosestPrice(map, isoDate);
    const fw = FWD_HORIZONS.map((y) => (map && max ? fwdReturn(map, isoDate, y, max) : null));
    return { price, fw };
  };
  const a = one(maps.spx, maxDates.spx);
  const b = one(maps.ndx, maxDates.ndx);
  const c = one(maps.tqqq, maxDates.tqqq);
  return { spx: a.price, ndx: b.price, tqqq: c.price, spxFw: a.fw, ndxFw: b.fw, tqqqFw: c.fw };
}

// Historia mensual del termómetro por componente: último día hábil de cada mes.
export type PartPoint = { value: number | null; score: number | null; weight: number | null };
export type MonthlyParts = { month: string; date: string; parts: Record<string, PartPoint> };

/** Filas diarias (orden cualquiera) → últimos `n` meses, un punto por mes (su último día con datos), más reciente primero. */
export function monthlyPartsFromDaily(rows: { date: string; parts: unknown }[], n = 12): MonthlyParts[] {
  const byMonth = new Map<string, { date: string; parts: unknown }>();
  for (const r of rows) {
    if (!Array.isArray(r.parts) || !r.parts.length) continue;
    const m = r.date.slice(0, 7);
    const cur = byMonth.get(m);
    if (!cur || r.date > cur.date) byMonth.set(m, r);
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, n)
    .map(([month, r]) => {
      const parts: Record<string, PartPoint> = {};
      for (const p of r.parts as any[]) if (p && typeof p.key === 'string') parts[p.key] = { value: num(p.value), score: num(p.score), weight: num(p.weight) };
      return { month, date: r.date, parts };
    });
}
