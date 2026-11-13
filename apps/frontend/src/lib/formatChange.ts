// Cambio porcentual diario para etiquetas: 2 decimales, signo explícito y tipo de color por dirección.
export function formatChangePct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.round(v * 100) / 100;
  const s = Object.is(r, -0) || r === 0 ? 0 : r;
  return `${s > 0 ? '+' : ''}${s.toFixed(2)}%`;
}

/** success = sube, error = baja, info = sin cambio o sin dato. */
export function changeBadgeType(v: number | null | undefined): 'success' | 'error' | 'info' {
  if (v == null || !Number.isFinite(v)) return 'info';
  const r = Math.round(v * 100) / 100;
  return r > 0 ? 'success' : r < 0 ? 'error' : 'info';
}

/** Etiqueta del Fear & Greed de CNN por valor (0–100). */
export type FearGreedLabel = 'extremeFear' | 'fear' | 'neutral' | 'greed' | 'extremeGreed';
export function fearGreedLabel(v: number): FearGreedLabel {
  return v < 25 ? 'extremeFear' : v < 45 ? 'fear' : v < 55 ? 'neutral' : v < 75 ? 'greed' : 'extremeGreed';
}
