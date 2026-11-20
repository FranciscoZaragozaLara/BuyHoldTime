// Series oficiales con retraso (FRED) completadas con un proxy diario provisional hasta que se publique el dato:
// WTI spot (DCOILWTICO, EIA vía FRED, días de retraso) ← futuro del mes cercano en Yahoo (CL=F).
// VIX (VIXCLS de FRED, al día siguiente) ← ^VIX de Yahoo (mismo índice, al cierre del día).
import type { PriceMap } from './thermo-history';

/** Ticker oficial → ticker provisional (se guarda aparte en bt_market_data). */
export const PROVISIONAL_OF: Record<string, string> = { DCOILWTICO: 'CL=F', VIXCLS: '^VIX' };

/** Oficial + provisional solo para fechas posteriores al último dato oficial (el oficial siempre manda). */
export function withProvisional(official: PriceMap, provisional: PriceMap | undefined): PriceMap {
  if (!provisional?.size) return official;
  let last = '';
  for (const d of official.keys()) if (d > last) last = d;
  const out: PriceMap = new Map(official);
  for (const [d, v] of provisional) if (d > last) out.set(d, v);
  return out;
}

/** Filas de bt_market_data: igual, agregando las provisionales posteriores marcadas con `provisional: true`. */
export function rowsWithProvisional<T extends { date: Date }>(official: T[], provisional: T[]): Array<T & { provisional?: boolean }> {
  if (!provisional.length) return official;
  const last = official.length ? official[official.length - 1].date.getTime() : -Infinity;
  return [...official, ...provisional.filter((r) => r.date.getTime() > last).map((r) => ({ ...r, provisional: true }))];
}
