// Bandas del CAPE de Shiller del termómetro (mismas que el orbe de CAPE en Indicadores).
export const capeBandLabel = (cape: number) => cape < 29 ? 'Barato' : cape < 35 ? 'Justo' : cape < 40 ? 'Caro' : cape < 43 ? 'Elevado' : 'Extremo';

/** Color de etiqueta: barato/justo = favorable, caro = precaución, elevado/extremo = riesgo. */
export const capeBadgeType = (cape: number): 'success' | 'warning' | 'error' => cape < 35 ? 'success' : cape < 40 ? 'warning' : 'error';
