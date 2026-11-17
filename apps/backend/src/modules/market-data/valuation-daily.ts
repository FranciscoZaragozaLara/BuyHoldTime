// Serie diaria de valuación para la gráfica de /indicators (desde 1990), en arreglos paralelos y valores a
// 2 decimales para que la respuesta pese poco:
// - S&P 500: cierre y P/E con EPS registrado (misma regla que la tarjeta y el termómetro).
// - Nasdaq 100: precio de QQQ (desde 1999) y P/E diario del índice = cierre ÷ EPS implícito del mes
//   (cierre de fin de mes ÷ P/E mensual; el mes en curso usa el dato de WSJ). TQQQ usa el mismo P/E (subyacente).
// - CAPE registrado (independiente del instrumento) y BHT del día (color de su línea).
import type { PriceMap } from '../backtesting/thermo-history';
import { buildEpsSchedule, epsAt } from './spx-eps';

export type ValuationDaily = {
  dates: string[];
  spx: (number | null)[]; pe: (number | null)[];
  qqq: (number | null)[]; tqqq: (number | null)[]; ndxPe: (number | null)[];
  cape: (number | null)[]; bht: (number | null)[];
};

const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/**
 * P/E diario a partir de un P/E mensual ('YYYY-MM' → P/E) y la serie de precios: cierre ÷ EPS implícito del mes.
 * EPS implícito = cierre del día ancla ÷ P/E del mes; el ancla es el día del dato (`anchors`, p. ej. el viernes
 * de WSJ) o, si no hay, el último cierre del mes.
 */
export function dailyPeFromMonthly(prices: PriceMap, monthlyPe: Map<string, number>, anchors: Map<string, string> = new Map()): Map<string, number> {
  const sorted = [...prices.keys()].sort();
  const lastClose = new Map<string, number>(); // mes → cierre del último día del mes
  for (const d of sorted) lastClose.set(d.slice(0, 7), prices.get(d)!);
  const closeOnOrBefore = (day: string): number | undefined => {
    let best: string | undefined;
    for (const d of sorted) { if (d <= day) best = d; else break; }
    return best ? prices.get(best) : undefined;
  };
  const eps = new Map<string, number>();
  for (const [m, pe] of monthlyPe) {
    const ref = anchors.has(m) ? closeOnOrBefore(anchors.get(m)!) : lastClose.get(m);
    if (pe > 0 && ref && ref > 0) eps.set(m, ref / pe);
  }
  const out = new Map<string, number>();
  for (const [d, px] of prices) {
    const e = eps.get(d.slice(0, 7));
    if (e) out.set(d, px / e);
  }
  return out;
}

/** Une dos series de precio con escalas distintas (sin ajustar / ajustada): escala la vieja con el factor del primer día común. */
export function spliceSeries(older: PriceMap, newer: PriceMap): PriceMap {
  const first = [...newer.keys()].sort().find((d) => older.has(d));
  const k = first ? newer.get(first)! / older.get(first)! : 1;
  const out: PriceMap = new Map();
  for (const [d, v] of older) if (!first || d < first) out.set(d, v * k);
  for (const [d, v] of newer) out.set(d, v);
  return out;
}

export function buildValuationDaily(
  spx: PriceMap, spxEps: PriceMap, cape: PriceMap, bht: PriceMap = new Map(),
  nasdaq: { qqq?: PriceMap; tqqq?: PriceMap; ndxMonthlyPe?: Map<string, number>; ndxPeAnchors?: Map<string, string> } = {},
  from = '1990-01-01',
): ValuationDaily {
  const sched = buildEpsSchedule(spxEps);
  const qqq = nasdaq.qqq ?? new Map(), tqqq = nasdaq.tqqq ?? new Map();
  const ndxPe = dailyPeFromMonthly(qqq, nasdaq.ndxMonthlyPe ?? new Map(), nasdaq.ndxPeAnchors);
  const dates = [...new Set([...spx.keys(), ...cape.keys(), ...qqq.keys(), ...tqqq.keys()])].filter((d) => d >= from).sort();
  const out: ValuationDaily = { dates, spx: [], pe: [], qqq: [], tqqq: [], ndxPe: [], cape: [], bht: [] };
  for (const d of dates) {
    const px = spx.get(d);
    const eps = px != null ? epsAt(sched, d)?.eps : undefined;
    out.spx.push(r2(px));
    out.pe.push(r2(px != null && eps ? px / eps : null));
    out.qqq.push(r2(qqq.get(d)));
    out.tqqq.push(r2(tqqq.get(d)));
    out.ndxPe.push(r2(ndxPe.get(d)));
    out.cape.push(r2(cape.get(d)));
    out.bht.push(r2(bht.get(d)));
  }
  return out;
}
