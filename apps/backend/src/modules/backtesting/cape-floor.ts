// Piso anual del CAPE para el termómetro (variante D del estudio de crisis, nov-2026).
// Problema: la banda inferior abierta [−∞, corte) interpolaba desde −1e9 y puntuaba ≈ su tope
// (CAPE 12 en 2009 = 25 pts, igual que 28). Solución: piso por año = percentil 5 del CAPE mensual
// de Shiller de los `window` años previos (hasta dic del año anterior: sin datos futuros).
// Por debajo del piso = 0 pts; del piso al primer corte, lineal 0→25. Los cortes superiores
// (los que deciden la salida en picos) no cambian.

export type MonthlyCape = { date: string; cape: number }; // date 'YYYY-MM-DD'

export interface BandSeg {
  lo: number | null; hi: number | null; scoreLo: number; scoreHi: number;
  label?: string; display?: string;
}

/** Percentil con interpolación lineal (p en 0..1). */
export function percentile(values: number[], p: number): number {
  const xs = [...values].sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const k = (xs.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, xs.length - 1);
  return xs[f] + (xs[c] - xs[f]) * (k - f);
}

/** Piso del año: P`p` del CAPE mensual de los `window` años previos, a 1 decimal. */
export function capeFloorForYear(monthly: MonthlyCape[], year: number, window = 20, p = 0.05): number | null {
  const vals = monthly.filter((m) => { const y = Number(m.date.slice(0, 4)); return y >= year - window && y < year; }).map((m) => m.cape);
  if (vals.length < 12 * Math.min(window, 10)) return null;
  return Math.round(percentile(vals, p) * 10) / 10;
}

const isFloorSeg = (s: BandSeg) => s.lo == null && s.scoreLo === 0 && s.scoreHi === 0;

/**
 * Inserta (o reemplaza) el piso en los segmentos de un año: [≤ piso → 0] + [piso–corte → 0..scoreHi].
 * Idempotente. El piso se limita a (corte − 1) para que el tramo lineal no quede vacío.
 */
export function applyCapeFloor(segments: BandSeg[], floor: number): BandSeg[] {
  let segs = segments.map((s) => ({ ...s }));
  if (segs.length > 1 && isFloorSeg(segs[0])) { segs = segs.slice(1); segs[0].lo = null; }
  const first = segs[0];
  if (first.lo != null || first.hi == null) throw new Error('el primer segmento debe ser abierto abajo y cerrado arriba');
  const f = Math.min(floor, first.hi - 1);
  const fs = f.toFixed(1);
  return [
    { lo: null, hi: f, scoreLo: 0, scoreHi: 0, label: first.label ?? 'Barato', display: `≤ ${fs}` },
    { ...first, lo: f, scoreLo: 0, display: `${fs}–${first.hi}` },
    ...segs.slice(1),
  ];
}
