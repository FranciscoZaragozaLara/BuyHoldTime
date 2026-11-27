// Proyección de EPS de la ficha de una acción: 40 % modelo propio con datos históricos (trimestres de EDGAR) y 60 % el
// consenso de analistas disponible, que suele incorporar la guía de las empresas. La mezcla se calcula aquí: los
// estimados crudos no salen al público. Solo se mezcla si hay modelo propio (sin él no se publica el consenso solo).
// ANALYST_BLEND=off → solo el modelo propio. Comparación y backtest en docs/plan/data-licensing-strategy.md.
//
// Modelo propio: EPS de los últimos 12 meses (normalizado si la utilidad neta se aparta de la operativa por partidas
// únicas) que crece con una tasa inicial (80 % crecimiento reciente de ingresos y utilidad operativa, 20 % el de hasta 3
// años; −20 %…100 %) que se desvanece hacia 6 % anual con constante de 2 años. Parámetros calibrados contra el
// consenso agregado del universo (no acción por acción).
import type { QuarterFundamentals } from './fundamentals-ttm';

export const PROJECTION_MODEL = { recentWeight: 0.8, cap: 1.0, floor: -0.2, tau: 2, longRun: 0.06, normalizeBand: 0.25 } as const;
export const ANALYST_WEIGHT = 0.6;
/** Estimados más viejos que esto no se usan. */
export const CONSENSUS_MAX_AGE_DAYS = 120;
/** Años mínimos desde el último trimestre para usar un cierre fiscal del consenso. */
export const CONSENSUS_MIN_HORIZON = 0.5;
const MAX_AGE_DAYS = 200;

const DAY = 864e5;
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Pt = [string, number];

/** Serie trimestral consecutiva más reciente (≈ 3 meses entre fechas), más reciente primero. */
function consecutive(points: Array<[string, number | null | undefined]>): Pt[] {
  const byDate = new Map<string, number>();
  for (const [d, v] of points) if (d && v != null && Number.isFinite(v)) byDate.set(d, v);
  const qs = [...byDate].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  let run = qs.length ? 1 : 0;
  while (run < qs.length) {
    const gap = days(qs[run - 1][0], qs[run][0]);
    if (gap < 60 || gap > 120) break;
    run++;
  }
  return qs.slice(0, run);
}
const ttm = (s: Pt[], k = 0) => (s.length >= k + 4 ? s.slice(k, k + 4).reduce((m, q) => m + q[1], 0) : null);
function growth(s: Pt[] | null, years: number): number | null {
  if (!s || years < 1) return null;
  const a = ttm(s, 0), b = ttm(s, 4 * years);
  return a != null && b != null && a > 0 && b > 0 ? Math.pow(a / b, 1 / years) - 1 : null;
}
const mean = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ModelProjection {
  /** EPS base (últimos 12 meses, normalizado si aplica). */
  base: number;
  /** Fecha del último trimestre (horizonte 0). */
  asOf: string;
  /** Tasa anual inicial antes de desvanecerse. */
  startGrowth: number;
  /** EPS de 12 meses a `h` años del último trimestre. */
  at: (h: number) => number;
}

export function modelProjection(quarters: QuarterFundamentals[], today: string): ModelProjection | null {
  const P = PROJECTION_MODEL;
  const eps = consecutive(quarters.map((q) => [q.date, q.eps]));
  if (eps.length < 4 || days(today, eps[0][0]) > MAX_AGE_DAYS) return null;
  let base = ttm(eps)!;
  if (base <= 0) return null;
  const rev = consecutive(quarters.map((q) => [q.date, q.revenue]));
  const oi = consecutive(quarters.map((q) => [q.date, q.operatingIncome]));
  const ni = consecutive(quarters.map((q) => [q.date, q.netIncome ?? null]));

  // Partidas debajo de la línea operativa (ganancias por inversiones, cargos únicos): si utilidad neta ÷ operativa se
  // aparta más de 25 % de su mediana de los 3 años previos, la base se lleva a esa proporción.
  if (oi.length >= 4 && ni.length >= 4 && oi[0][0] === eps[0][0] && ni[0][0] === eps[0][0]) {
    const oiNow = ttm(oi)!, niNow = ttm(ni)!;
    const hist = [4, 8, 12].flatMap((k) => {
      const o = ttm(oi, k), n = ttm(ni, k);
      return o != null && n != null && o > 0 && n > 0 ? [n / o] : [];
    });
    if (oiNow > 0 && niNow > 0 && hist.length) {
      const now = niNow / oiNow, h = median(hist);
      if (Math.abs(now / h - 1) > P.normalizeBand) base = (base * h) / now;
    }
  }

  const ops = oi.length >= 8 && (ttm(oi) ?? 0) > 0 ? oi : null;
  const upTo3 = (s: Pt[] | null) => (s ? growth(s, Math.min(3, Math.floor((s.length - 4) / 4))) : null);
  const recent = mean([growth(rev, 1), growth(ops, 1)]) ?? growth(eps, 1);
  const longer = mean([upTo3(rev), upTo3(ops)]) ?? upTo3(eps);
  let g0: number = P.longRun;
  if (recent != null || longer != null) g0 = P.recentWeight * (recent ?? longer!) + (1 - P.recentWeight) * (longer ?? recent!);
  g0 = Math.min(P.cap, Math.max(P.floor, g0));

  const at = (h: number) => {
    if (h <= 0) return base;
    const steps = 48, dt = h / steps;
    let lg = 0;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) * dt;
      lg += Math.log(1 + P.longRun + (g0 - P.longRun) * Math.exp(-t / P.tau)) * dt;
    }
    return base * Math.exp(lg);
  };
  return { base, asOf: eps[0][0], startGrowth: g0, at };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Consenso de EPS (fila contable "EPS ($)") como puntos (años desde el último trimestre, EPS) por cierre fiscal. */
export function consensusPoints(estimates: unknown, asOf: string): Array<[number, number]> {
  const e = estimates as { years?: string[]; estimates?: Array<{ metric?: string; values?: string[] }> } | null;
  if (!e?.years || !Array.isArray(e.estimates)) return [];
  const row = e.estimates.find((r) => (r.metric ?? '').trim() === 'EPS ($)');
  if (!row?.values) return [];
  const out: Array<[number, number]> = [];
  e.years.forEach((label, i) => {
    const m = /(\w{3}) (\d{4})/.exec(label ?? '');
    const v = Number(row.values![i]);
    const mo = m ? MONTHS.indexOf(m[1]) : -1;
    if (mo < 0 || !Number.isFinite(v) || v <= 0) return;
    const end = iso(new Date(Date.UTC(Number(m![2]), mo + 1, 0)));
    const h = days(end, asOf) / 365.25;
    // Un año fiscal que cierra en menos de 6 meses ya está casi todo reportado (con sus partidas únicas): no es pronóstico.
    if (h >= CONSENSUS_MIN_HORIZON) out.push([h, v]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

/** Consenso a `h` años: interpolación logarítmica desde el EPS base; después del último año, con el ritmo del modelo. */
function consensusAt(h: number, pts: Array<[number, number]>, m: ModelProjection): number {
  const all: Array<[number, number]> = [[0, m.base], ...pts];
  for (let i = 1; i < all.length; i++) {
    const [h0, v0] = all[i - 1], [h1, v1] = all[i];
    if (h <= h1) return v0 * Math.pow(v1 / v0, (h - h0) / (h1 - h0));
  }
  const [hl, vl] = all[all.length - 1];
  return vl * (m.at(h) / m.at(hl));
}

export interface EpsProjection {
  basis: 'blend' | 'model';
  analystWeight: number;
  /** Tasa inicial del modelo propio. */
  modelStartGrowth: number;
  /** EPS de los próximos 12 meses (mezcla). */
  epsNext12m: number;
  /** EPS de 12 meses al cierre de cada año calendario y al del siguiente (para el Escenario Mix). */
  years: Array<{ calendarYear: number; label: string; eps: number; epsNext: number }>;
}

/**
 * @param estimates analystEstimates del snapshot más reciente (o null)
 * @param estimatesDate fecha del snapshot de esos estimados
 * @param blend false con ANALYST_BLEND=off
 */
export function epsProjection(quarters: QuarterFundamentals[], today: string, estimates: unknown, estimatesDate: string | null, blend: boolean): EpsProjection | null {
  const m = modelProjection(quarters, today);
  if (!m) return null;
  const fresh = estimatesDate != null && days(today, estimatesDate) <= CONSENSUS_MAX_AGE_DAYS;
  const pts = blend && fresh ? consensusPoints(estimates, m.asOf) : [];
  const w = pts.length ? ANALYST_WEIGHT : 0;
  const eps = (h: number) => (w ? w * consensusAt(h, pts, m) + (1 - w) * m.at(h) : m.at(h));
  const round = (v: number) => Number(v.toFixed(2));
  const year0 = Number(today.slice(0, 4));
  const years: EpsProjection['years'] = [];
  for (let y = year0; y <= year0 + 5 && years.length < 4; y++) {
    const h = days(`${y}-12-31`, m.asOf) / 365.25;
    if (h <= 0) continue;
    years.push({ calendarYear: y, label: `${y}E`, eps: round(eps(h)), epsNext: round(eps(h + 1)) });
  }
  return { basis: w ? 'blend' : 'model', analystWeight: w, modelStartGrowth: m.startGrowth, epsNext12m: round(eps(1)), years };
}
