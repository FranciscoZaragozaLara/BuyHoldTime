import { bandLevel, CAPE_BANDS } from './thermoScoring';

// Bandas del CAPE de Shiller del termómetro (las del año en curso de packages/bht-bands/bands.json,
// las mismas del orbe de CAPE en Indicadores).
export const capeBandLabel = (cape: number) => bandLevel(CAPE_BANDS, cape);

/** Color de etiqueta: barato/justo = favorable, caro = precaución, elevado/extremo = riesgo. */
export const capeBadgeType = (cape: number): 'success' | 'warning' | 'error' => {
  const l = capeBandLabel(cape);
  return l === 'Barato' || l === 'Justo' ? 'success' : l === 'Caro' ? 'warning' : 'error';
};
