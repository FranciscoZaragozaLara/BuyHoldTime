// Niveles de precio de la lista de /prices, desde los cierres diarios (ajustados por splits, sin dividendos) más el
// precio en vivo: máximo histórico, último piso y rendimientos 1M / YTD / 1A / 5A. Antes salían de un JSON estático
// (precalculated_performance.json) congelado en jul-2026.
//
// Último piso = el mínimo de la corrección más reciente (caída ≥ 10% desde un máximo previo). La corrección se abre al
// caer 10% bajo el máximo y se cierra al marcar un máximo nuevo; si sigue abierta, el piso es su mínimo hasta hoy.

export type Close = { date: string; close: number };
export type PriceLevels = {
  ath: number; athDate: string; fromAth: number;
  bottom: number | null; bottomDate: string | null; fromBottom: number | null;
  perf1M: number | null; perfYTD: number | null; perf1Y: number | null; perf5Y: number | null;
};

export const BOTTOM_MIN_DD = 0.10;

/** Estado del recorrido por los cierres; se guarda en caché para sumarle solo el precio en vivo. */
export type WalkState = {
  ath: number; athDate: string;
  peak: number; open: boolean; min: number; minDate: string;
  bottom: number | null; bottomDate: string | null;
};

export function emptyWalk(): WalkState {
  return { ath: -Infinity, athDate: '', peak: -Infinity, open: false, min: Infinity, minDate: '', bottom: null, bottomDate: null };
}

export function step(s: WalkState, p: Close, minDd = BOTTOM_MIN_DD): WalkState {
  const n = { ...s };
  if (p.close > n.ath) { n.ath = p.close; n.athDate = p.date; }
  if (p.close > n.peak) { n.peak = p.close; n.open = false; return n; } // máximo nuevo: cierra la corrección
  if (!n.open && p.close <= n.peak * (1 - minDd)) { n.open = true; n.min = Infinity; }
  if (n.open && p.close < n.min) { n.min = p.close; n.minDate = p.date; n.bottom = p.close; n.bottomDate = p.date; }
  return n;
}

export function walk(rows: Close[], minDd = BOTTOM_MIN_DD): WalkState {
  let s = emptyWalk();
  for (const r of rows) s = step(s, r, minDd);
  return s;
}

const shift = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

/** Último cierre en o antes de `iso` (rows ordenados por fecha); null si la historia no llega. */
export function closeOnOrBefore(rows: Close[], iso: string): number | null {
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= iso) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? rows[ans].close : null;
}

/** Cierres de referencia para los rendimientos a la fecha `today`. */
export function perfRefs(rows: Close[], today: string) {
  return {
    m1: closeOnOrBefore(rows, shift(today, 1)),
    ytd: closeOnOrBefore(rows, `${Number(today.slice(0, 4)) - 1}-12-31`),
    y1: closeOnOrBefore(rows, shift(today, 12)),
    y5: closeOnOrBefore(rows, shift(today, 60)),
  };
}

const pct = (a: number, b: number | null) => (b != null && b > 0 ? (a / b - 1) * 100 : null);

/** Junta el recorrido de la historia con el precio en vivo de hoy (si es posterior al último cierre). */
export function priceLevels(base: WalkState, refs: ReturnType<typeof perfRefs>, live: { price: number; date: string } | null, lastDate: string): PriceLevels | null {
  let s = base;
  if (live && live.price > 0 && live.date > lastDate) s = step(base, { date: live.date, close: live.price });
  if (!Number.isFinite(s.ath)) return null;
  const price = live && live.price > 0 ? live.price : s.ath;
  return {
    ath: s.ath, athDate: s.athDate, fromAth: (price / s.ath - 1) * 100,
    bottom: s.bottom, bottomDate: s.bottomDate, fromBottom: s.bottom != null ? (price / s.bottom - 1) * 100 : null,
    perf1M: pct(price, refs.m1), perfYTD: pct(price, refs.ytd), perf1Y: pct(price, refs.y1), perf5Y: pct(price, refs.y5),
  };
}
