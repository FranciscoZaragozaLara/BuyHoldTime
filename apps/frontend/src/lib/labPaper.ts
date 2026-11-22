// Cálculos puros de la página Laboratorio (Canary & Phoenix, experimental).

export type PaperLeg = { und?: string; expiry?: string; strike?: number; right?: 'P' | 'C'; side?: 'long' | 'short'; qty?: number; contract?: string; date?: string };
export type PaperPosition = {
  id: string; strategy: string; tranche: string | null; underlying: string; legs: PaperLeg[]; opened_at: string;
  entry_price: number; status: string; exit_price: number | null; mark_conservative: number | null; roi_pct: number | null; exit_reason: string | null;
};

/** Contratos de la posición (los TQQQ del benchmark se cuentan como acciones). */
export const positionQty = (p: PaperPosition) => Number(p.legs?.[0]?.qty ?? 1);

/** P&L en USD con la marca conservadora (o el precio de salida). Opciones ×100 por contrato; el benchmark TQQQ guarda el valor total. */
export function positionPnl(p: PaperPosition): number | null {
  const now = p.status === 'closed' ? p.exit_price : p.mark_conservative;
  if (now == null || p.entry_price == null) return null;
  if (p.strategy === 'tqqq_benchmark') return now - p.entry_price;
  return (now - p.entry_price) * 100 * positionQty(p);
}

/** Total por estrategia: P&L, capital comprometido y número de posiciones. */
export function pnlByStrategy(ps: PaperPosition[]) {
  const out: Record<string, { pnl: number; cost: number; n: number; open: number }> = {};
  for (const p of ps) {
    const o = (out[p.strategy] ??= { pnl: 0, cost: 0, n: 0, open: 0 });
    o.n++;
    if (p.status === 'open') o.open++;
    o.cost += p.strategy === 'tqqq_benchmark' ? p.entry_price : p.entry_price * 100 * positionQty(p);
    o.pnl += positionPnl(p) ?? 0;
  }
  return out;
}

/** Trazo SVG de una serie (x uniforme) en un rectángulo w×h; null sin datos. */
export function sparkPath(values: number[], w: number, h: number, min = 0, max = 100): string | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const span = max - min || 1;
  return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)},${(h - ((Math.min(max, Math.max(min, x)) - min) / span) * h).toFixed(1)}`).join('');
}
