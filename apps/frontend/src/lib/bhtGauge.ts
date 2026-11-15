// Geometría del medidor semicircular del BHT Index (antes dentro de IndicatorsPanel).
// El arco de cada banda es proporcional a √(frecuencia histórica): verde 11%, lima 25%, amarillo 46%,
// naranja 13%, rojo 6% → las bandas habituales se ven más grandes.
import { BHT_CUTS } from '@/components/backtesting/bhtBands';

export const GAUGE = { CX: 100, CY: 104, R: 80 } as const;
const SEGV = [0, ...BHT_CUTS, 100];
const SEGARC = [28, 43, 58, 30, 21];

/** Ángulo recorrido (0–180°) desde la izquierda para un puntaje 0–100. */
export function gaugeSweep(v: number): number {
  const c = Math.max(0, Math.min(100, v));
  let i = SEGV.findIndex((e, k) => k < SEGV.length - 1 && c >= e && (c < SEGV[k + 1] || (k === SEGV.length - 2 && c <= SEGV[k + 1])));
  if (i < 0) i = SEGV.length - 2;
  const acc = SEGARC.slice(0, i).reduce((m, x) => m + x, 0);
  return acc + ((c - SEGV[i]) / (SEGV[i + 1] - SEGV[i])) * SEGARC[i];
}

/** Ángulo polar (180° = izquierda, 0° = derecha). */
export const gaugeAngle = (v: number) => 180 - gaugeSweep(v);

export function gaugePolar(deg: number, r: number): readonly [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [GAUGE.CX + r * Math.cos(rad), GAUGE.CY - r * Math.sin(rad)] as const;
}

/** Trazo SVG del arco entre dos puntajes. */
export function gaugeArc(v0: number, v1: number): string {
  const a0 = gaugeAngle(v0) - 0.6, a1 = gaugeAngle(v1) + 0.6;
  const [x0, y0] = gaugePolar(a0, GAUGE.R);
  const [x1, y1] = gaugePolar(a1, GAUGE.R);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${GAUGE.R} ${GAUGE.R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
