// Serie diaria de valuación del S&P 500 para la gráfica de /indicators (desde 1990): cierre, P/E con EPS
// registrado (misma regla que la tarjeta y el termómetro) y CAPE registrado. Arreglos paralelos y valores
// a 2 decimales para que la respuesta pese poco (~9,600 días).
import type { PriceMap } from '../backtesting/thermo-history';
import { buildEpsSchedule, epsAt } from './spx-eps';

export type ValuationDaily = { dates: string[]; spx: (number | null)[]; pe: (number | null)[]; cape: (number | null)[] };

const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export function buildValuationDaily(spx: PriceMap, spxEps: PriceMap, cape: PriceMap, from = '1990-01-01'): ValuationDaily {
  const sched = buildEpsSchedule(spxEps);
  const dates = [...new Set([...spx.keys(), ...cape.keys()])].filter((d) => d >= from).sort();
  const out: ValuationDaily = { dates, spx: [], pe: [], cape: [] };
  for (const d of dates) {
    const px = spx.get(d);
    const eps = px != null ? epsAt(sched, d)?.eps : undefined;
    out.spx.push(r2(px));
    out.pe.push(r2(px != null && eps ? px / eps : null));
    out.cape.push(r2(cape.get(d)));
  }
  return out;
}
