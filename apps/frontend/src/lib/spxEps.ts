// EPS del S&P 500 "registrado": utilidades a 12 meses (columna E de Shiller, ticker SPX_EPS, fin de
// mes) del último mes ya publicado a una fecha. Misma regla que BackTesting/shiller_eps.py, que
// calcula bt_shiller_daily.pe: los meses de un trimestre se publican el día 3 del cuarto mes tras su
// cierre (jun → 3 oct, sep → 3 ene). Evita usar utilidades que todavía no se conocían ese día.

export function epsAvailableDate(monthEnd: string): string {
  const y = Number(monthEnd.slice(0, 4));
  const m = Number(monthEnd.slice(5, 7));
  const qe = Math.ceil(m / 3) * 3;
  const t = qe + 4;
  const y2 = y + Math.floor((t - 1) / 12);
  const m2 = ((t - 1) % 12) + 1;
  return `${y2}-${String(m2).padStart(2, '0')}-03`;
}

export type EpsSchedule = { pub: string[]; month: string[]; eps: number[] };

/** Serie mensual (fecha fin de mes → EPS) → calendario ordenado por publicación, con el mes más reciente acumulado. */
export function buildEpsSchedule(series: Map<string, number> | undefined): EpsSchedule {
  const items = series ? [...series.entries()].filter(([, v]) => Number.isFinite(v) && v > 0).map(([d, v]) => ({ pub: epsAvailableDate(d.slice(0, 10)), month: d.slice(0, 10), eps: v })) : [];
  items.sort((a, b) => (a.pub < b.pub ? -1 : a.pub > b.pub ? 1 : a.month < b.month ? -1 : 1));
  const out: EpsSchedule = { pub: [], month: [], eps: [] };
  let best: { month: string; eps: number } | null = null;
  for (const it of items) {
    if (!best || it.month > best.month) best = { month: it.month, eps: it.eps };
    out.pub.push(it.pub); out.month.push(best.month); out.eps.push(best.eps);
  }
  return out;
}

/** EPS del último mes publicado al día `day` ('YYYY-MM-DD'), o null. Búsqueda binaria. */
export function epsAt(s: EpsSchedule, day: string): { month: string; eps: number } | null {
  let lo = 0, hi = s.pub.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (s.pub[mid] <= day) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  return k < 0 ? null : { month: s.month[k], eps: s.eps[k] };
}
