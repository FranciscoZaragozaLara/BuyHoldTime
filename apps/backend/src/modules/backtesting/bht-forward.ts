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
export type IndexCloses = { spx: number | null; ndx: number | null; tqqq: number | null };
export type MonthlyParts = {
  month: string; date: string; parts: Record<string, PartPoint>;
  /** Rendimiento % desde el cierre de ese día hasta el último cierre disponible. */
  perf: IndexCloses;
  /** Años atrás para las filas extra (2, 3); null en los 12 meses recientes. */
  yearsAgo: number | null;
};
type DailyRow = { date: string; parts: unknown; spx?: number | null; ndx?: number | null; tqqq?: number | null };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const perfTo = (base: number | null | undefined, now: number | null) =>
  base != null && base !== 0 && now != null ? (now / base - 1) * 100 : null;
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Filas diarias → últimos `n` meses (último día con datos de cada mes, más reciente primero)
 * y, después, una fila por cada valor de `extraYears` (mismo mes, N años atrás) si existe.
 * `latest` = últimos cierres para el rendimiento "a hoy".
 */
export function monthlyPartsFromDaily(rows: DailyRow[], n = 12, latest: IndexCloses = { spx: null, ndx: null, tqqq: null }, extraYears: number[] = []): MonthlyParts[] {
  const byMonth = new Map<string, DailyRow>();
  for (const r of rows) {
    if (!Array.isArray(r.parts) || !r.parts.length) continue;
    const m = r.date.slice(0, 7);
    const cur = byMonth.get(m);
    if (!cur || r.date > cur.date) byMonth.set(m, r);
  }
  const build = (month: string, r: DailyRow, yearsAgo: number | null): MonthlyParts => {
    const parts: Record<string, PartPoint> = {};
    for (const p of r.parts as any[]) if (p && typeof p.key === 'string') parts[p.key] = { value: num(p.value), score: num(p.score), weight: num(p.weight) };
    return {
      month, date: r.date, parts, yearsAgo,
      perf: { spx: perfTo(num(r.spx), latest.spx), ndx: perfTo(num(r.ndx), latest.ndx), tqqq: perfTo(num(r.tqqq), latest.tqqq) },
    };
  };
  const months = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : -1));
  const out = months.slice(0, n).map((m) => build(m, byMonth.get(m)!, null));
  if (months.length) {
    for (const y of extraYears) {
      const m = shiftMonth(months[0], -12 * y);
      const r = byMonth.get(m);
      if (r) out.push(build(m, r, y));
    }
  }
  return out;
}
