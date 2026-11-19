// Serie de la gráfica "Market Valuation" (/indicators): mensual de Shiller antes del primer dato diario
// y diaria desde 1990 (S&P 500, P/E registrado, CAPE). EMA 50/200: en el tramo mensual se aproximan
// en meses (50 días ≈ 2.4 meses, 200 ≈ 9.5); en el diario son EMA reales de 50 y 200 días, sembradas
// con el valor mensual previo para que la línea no salte. Marcadores de oportunidad: uno por mes como máximo.
import { TOKENS } from './designTokens';

export type MonthlyRow = { date: string; sp500Price?: number; peRatio?: number; shillerPe?: number };
export type DailyValuation = {
  dates: string[]; spx: (number | null)[]; pe: (number | null)[]; cape: (number | null)[]; bht?: (number | null)[];
  qqq?: (number | null)[]; tqqq?: (number | null)[]; ndxPe?: (number | null)[];
  /** Régimen tendencial del S&P 500 en una letra: U alcista · P corrección · R rebote · D bajista. */
  trend?: (string | null)[];
};
/** Instrumento de la gráfica: precio, EMA y P/E son los suyos; CAPE y BHT son del mercado (independientes). */
export type Instrument = 'spx' | 'ndx' | 'tqqq';
const PRICE_KEY: Record<Instrument, 'spx' | 'qqq' | 'tqqq'> = { spx: 'spx', ndx: 'qqq', tqqq: 'tqqq' };
const PE_KEY: Record<Instrument, 'pe' | 'ndxPe'> = { spx: 'pe', ndx: 'ndxPe', tqqq: 'ndxPe' };
export type ChartPoint = {
  time: string; // YYYY-MM-DD
  daily: boolean;
  /** Precio del instrumento elegido (el nombre se conserva por compatibilidad con la gráfica). */
  sp500Price?: number; peRatio?: number; shillerPe?: number;
  sp500PriceMa50?: number; sp500PriceMa200?: number;
  /** BHT Index del día (desde 1993): da el color de la línea del S&P 500 y el detalle en el hover. */
  bht?: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** EMA recursiva; si no hay valor, el punto queda sin EMA y se conserva el estado. */
function emaStep(prev: number | undefined, v: number | undefined, alpha: number): number | undefined {
  if (v == null) return prev;
  return prev == null ? v : prev + (v - prev) * alpha;
}

export function buildValuationChart(monthly: MonthlyRow[], daily: DailyValuation | null, instrument: Instrument = 'spx'): ChartPoint[] {
  // Nasdaq 100 y TQQQ no tienen serie mensual previa: solo el tramo diario (CAPE y BHT siguen desde 1990).
  if (instrument !== 'spx') monthly = [];
  const firstDaily = daily?.dates.find((_, i) => daily.spx[i] != null || daily.cape[i] != null);
  const cutMonth = firstDaily ? firstDaily.slice(0, 7) : null;
  const out: ChartPoint[] = [];
  const m50 = 2 / (2.4 + 1), m200 = 2 / (9.5 + 1);
  let e50: number | undefined, e200: number | undefined;
  for (const row of monthly) {
    if (cutMonth && row.date >= cutMonth) break;
    e50 = emaStep(e50, row.sp500Price, m50);
    e200 = emaStep(e200, row.sp500Price, m200);
    out.push({
      time: `${row.date}-01`, daily: false,
      sp500Price: row.sp500Price, peRatio: row.peRatio, shillerPe: row.shillerPe,
      sp500PriceMa50: row.sp500Price != null && e50 != null ? r2(e50) : undefined,
      sp500PriceMa200: row.sp500Price != null && e200 != null ? r2(e200) : undefined,
    });
  }
  if (!daily || !cutMonth) return out;
  const d50 = 2 / 51, d200 = 2 / 201;
  const prices = daily[PRICE_KEY[instrument]] ?? [];
  const pes = daily[PE_KEY[instrument]] ?? [];
  daily.dates.forEach((d, i) => {
    if (d < firstDaily!) return;
    const px = prices[i] ?? undefined;
    e50 = emaStep(e50, px, d50);
    e200 = emaStep(e200, px, d200);
    out.push({
      time: d, daily: true,
      sp500Price: px, peRatio: pes[i] ?? undefined, shillerPe: daily.cape[i] ?? undefined, bht: daily.bht?.[i] ?? undefined,
      sp500PriceMa50: px != null && e50 != null ? r2(e50) : undefined,
      sp500PriceMa200: px != null && e200 != null ? r2(e200) : undefined,
    });
  });
  return out;
}

export type OpportunityMarker = { time: string; position: 'aboveBar'; color: string; shape: 'circle'; text: string; size: number };

/**
 * Zonas de oportunidad del S&P 500 vs sus EMA (precio entre EMA200 y el punto medio EMA50/EMA200 = $,
 * hasta 10% bajo la EMA200 = $$, más abajo = $$ 🌟). Se evalúa el último punto de cada mes, así que en el
 * tramo diario siguen apareciendo como mucho uno por mes y zona.
 */
export function monthlyOpportunityMarkers(points: ChartPoint[]): OpportunityMarker[] {
  const lastOfMonth = new Map<string, ChartPoint>();
  for (const p of points) if (p.sp500Price != null && p.sp500PriceMa50 != null && p.sp500PriceMa200 != null) lastOfMonth.set(p.time.slice(0, 7), p);
  const out: OpportunityMarker[] = [];
  for (const p of [...lastOfMonth.values()].sort((a, b) => a.time.localeCompare(b.time))) {
    const price = p.sp500Price!, e50 = p.sp500PriceMa50!, e200 = p.sp500PriceMa200!;
    const mid = (e50 + e200) / 2;
    if (price > e200 && price < mid) out.push({ time: p.time, position: 'aboveBar', color: '#3b82f6', shape: 'circle', text: '$', size: 1 });
    else if (price <= e200 && price > e200 * 0.9) out.push({ time: p.time, position: 'aboveBar', color: TOKENS.favorable, shape: 'circle', text: '$$', size: 1.15 });
    else if (price <= e200 * 0.9) out.push({ time: p.time, position: 'aboveBar', color: '#eab308', shape: 'circle', text: '$$ 🌟', size: 1.15 });
  }
  return out;
}
