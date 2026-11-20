// Caída desde el máximo histórico (ATH) de un instrumento, con semáforo: entre más fuerte la caída, más rojo.
import { TOKENS, type TokenName } from './designTokens';

export type AthDrawdown = { pct: number; ath: number; athDate: string; tone: Exclude<TokenName, 'accent'>; window5y: boolean };

const WINDOW_YEARS = 5;
const yearsBefore = (iso: string, y: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };

/** Tramos: >−5% favorable · −5 a −10 caution · −10 a −20 elevated · ≤−20 risk. */
export function athTone(pct: number): AthDrawdown['tone'] {
  if (pct > -5) return 'favorable';
  if (pct > -10) return 'caution';
  if (pct > -20) return 'elevated';
  return 'risk';
}

/** history: fecha ISO → cierre. current: precio actual (en vivo) si existe; si es un nuevo máximo, la caída es 0.
 *  Regla compuesta: si el ATH ocurrió hace más de 5 años (p. ej. SQQQ, que se erosiona siempre), se usa el máximo
 *  de los últimos 5 años y window5y = true. */
export function athDrawdown(history: Map<string, number> | undefined, current: number | null, currentDate?: string): AthDrawdown | null {
  const rows = [...(history ?? [])].filter(([, v]) => Number.isFinite(v) && v > 0);
  let lastDate = '';
  let last: number | null = null;
  for (const [d, v] of rows) if (d > lastDate) { lastDate = d; last = v; }
  const cur = current != null && Number.isFinite(current) && current > 0 ? current : last;
  if (cur == null) return null;
  const refDate = currentDate ?? lastDate;
  const peak = (from: string) => {
    let ath = -Infinity, athDate = '';
    for (const [d, v] of rows) if (d >= from && v > ath) { ath = v; athDate = d; }
    return { ath, athDate };
  };
  const cutoff = refDate ? yearsBefore(refDate, WINDOW_YEARS) : '';
  let { ath, athDate } = peak('');
  const window5y = !!athDate && !!cutoff && athDate < cutoff;
  if (window5y) ({ ath, athDate } = peak(cutoff));
  if (cur >= ath) { ath = cur; athDate = refDate || athDate; }
  const pct = (cur / ath - 1) * 100;
  return { pct, ath, athDate, tone: athTone(pct), window5y };
}

export const athColor = (t: AthDrawdown['tone']) => TOKENS[t];
