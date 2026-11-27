// Componentes del BHT cuyo valor viene de una fuente con licencia (P/E estimado: EPS de Birinyi publicado por WSJ):
// en lo público se muestra la banda ("Justo", "Caro"…) con su puntaje, no el número. Ver
// docs/plan/data-licensing-strategy.md.
import { fwdBandLabel } from './thermoScoring';
import { levelLabel } from './levelLabels';

export const BAND_ONLY_PARTS = new Set(['FWD']);

/** Texto de la banda para un componente de solo banda; null para los demás. */
export function bandOnlyText(key: string, value: number | null | undefined, locale: string): string | null {
  if (!BAND_ONLY_PARTS.has(key) || value == null || !Number.isFinite(value)) return null;
  return levelLabel(fwdBandLabel(value), locale);
}
