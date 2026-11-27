// Respaldo de la proyección de EPS cuando el backend no manda una (GET /tickers/:symbol → projection, ver
// domain/eps-projection.ts): la ficha lo usa con el EPS de la cotización y 6 % anual. Con trimestres calcula una
// tendencia simple (promedio de CAGR de EPS e ingresos a 3 años, 0–20 %).
import type { AnalystProjection } from './epsChartData';

type Quarter = { date: string; eps?: number | null; epsDiluted?: number | null; revenue?: number | null };

export const OWN_GROWTH = { min: 0, max: 0.2, fallback: 0.06, maxYears: 3, maxAgeDays: 200 } as const;

export interface OwnGrowth {
  /** Tasa anual usada (0.12 = 12 %). */
  rate: number;
  basis: 'history' | 'default';
  epsCagr: number | null;
  revCagr: number | null;
  /** Años de historia comparados (1–3). */
  years: number | null;
}

const DAY = 864e5;
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;

/** Serie trimestral consecutiva más reciente (≈ 3 meses entre fechas), más reciente primero. */
function consecutive(points: Array<[string, number]>): Array<[string, number]> {
  const byDate = new Map(points);
  const qs = [...byDate].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  let run = qs.length ? 1 : 0;
  while (run < qs.length) {
    const gap = days(qs[run - 1][0], qs[run][0]);
    if (gap < 60 || gap > 120) break;
    run++;
  }
  return qs.slice(0, run);
}

const sum4 = (qs: Array<[string, number]>, from: number) => qs.slice(from, from + 4).reduce((m, q) => m + q[1], 0);

function cagr(qs: Array<[string, number]>): { rate: number; years: number } | null {
  const years = Math.min(OWN_GROWTH.maxYears, Math.floor((qs.length - 4) / 4));
  if (years < 1) return null;
  const now = sum4(qs, 0), then = sum4(qs, years * 4);
  return now > 0 && then > 0 ? { rate: Math.pow(now / then, 1 / years) - 1, years } : null;
}

const series = (quarters: Quarter[], pick: (q: Quarter) => number | null | undefined): Array<[string, number]> =>
  quarters.flatMap((q) => {
    const v = pick(q);
    return q.date && v != null && Number.isFinite(Number(v)) ? [[q.date.slice(0, 10), Number(v)] as [string, number]] : [];
  });

export function ownGrowth(quarters: Quarter[] | null | undefined): OwnGrowth {
  const qs = quarters ?? [];
  const eps = cagr(consecutive(series(qs, (q) => q.epsDiluted ?? q.eps)));
  const rev = cagr(consecutive(series(qs, (q) => q.revenue)));
  const rates = [eps?.rate, rev?.rate].filter((r): r is number => r != null);
  if (!rates.length) return { rate: OWN_GROWTH.fallback, basis: 'default', epsCagr: null, revCagr: null, years: null };
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  return {
    rate: Math.min(OWN_GROWTH.max, Math.max(OWN_GROWTH.min, avg)),
    basis: 'history',
    epsCagr: eps?.rate ?? null,
    revCagr: rev?.rate ?? null,
    years: Math.max(eps?.years ?? 0, rev?.years ?? 0) || null,
  };
}

/** EPS de los últimos 12 meses (4 trimestres consecutivos, el último reciente) y la fecha de cierre; null si no hay. */
export function epsTtm(quarters: Quarter[] | null | undefined, today: string): { eps: number; asOf: string } | null {
  const qs = consecutive(series(quarters ?? [], (q) => q.epsDiluted ?? q.eps));
  if (qs.length < 4 || days(today, qs[0][0]) > OWN_GROWTH.maxAgeDays) return null;
  return { eps: sum4(qs, 0), asOf: qs[0][0] };
}

/**
 * EPS proyectado por año calendario (año en curso + 4) con la tendencia propia. `fallbackEps` (p. ej. el EPS de la
 * cotización) se usa si EDGAR no tiene 12 meses recientes; sin base positiva no hay proyección.
 */
export function ownProjections(quarters: Quarter[] | null | undefined, today: string, fallbackEps?: number | null): { projections: AnalystProjection[]; growth: OwnGrowth } {
  const growth = ownGrowth(quarters);
  const base = epsTtm(quarters, today) ?? (fallbackEps != null && fallbackEps > 0 ? { eps: fallbackEps, asOf: today } : null);
  if (!base || base.eps <= 0) return { projections: [], growth };
  const year0 = Number(today.slice(0, 4));
  const projections: AnalystProjection[] = [];
  for (let y = year0; y <= year0 + 4 && projections.length < 4; y++) {
    const t = days(`${y}-12-31`, base.asOf) / 365.25;
    if (t <= 0) continue;
    const at = (yrs: number) => Number((base.eps * Math.pow(1 + growth.rate, yrs)).toFixed(2));
    projections.push({ calendarYear: y, label: `${y}E`, epsBaseTtm: at(t), epsBaseFwd: at(t + 1) });
  }
  return { projections, growth };
}
