// Fuente única de las bandas del semáforo BHT Index.
// Si cambian los cortes, colores, etiquetas o consejos, editar SOLO este archivo:
// gauge, leyenda, hover, Timeline, Stats y tablas toman todo de aquí.
export interface BhtBand {
  lo: number;
  hi: number;
  color: string;
  textClass: string;
  label: string;
  range: string;
  advice: string;
}

export const BHT_BANDS: BhtBand[] = [
  { lo: 0, hi: 40, color: '#22c55e', textClass: 'text-emerald-400', label: 'Miedo Extremo (Alta Oportunidad)', range: '0–39', advice: 'A mayor miedo, mejor oportunidad: evalúa pisos y sobreventa con CAPE y RSI para entrar fuerte en QQQ, TQQQ, SOXX — incluso con margin.' },
  { lo: 40, hi: 50, color: '#84cc36', textClass: 'text-lime-400', label: 'Miedo (Oportunidad)', range: '40–49', advice: 'Puedes usar margen y apalancados, sin margen extremo; confirma reversión a tendencia alcista para comprar QQQ, TQQQ y calidad undervalued.' },
  { lo: 50, hi: 62, color: '#eab308', textClass: 'text-yellow-300', label: 'Neutral', range: '50–61', advice: 'No compres ni incrementes apalancados o alto margen (TQQQ, SOXL). Estrategia base: Hold de tus posiciones y acumula liquidez y defensivas.' },
  { lo: 62, hi: 70, color: '#f97316', textClass: 'text-orange-400', label: 'Codicia (Riesgo)', range: '62–69', advice: 'Reduce QQQ/TQQQ/SOXX y baja el margen; mantén al menos 10% en Cash/SGOV para oportunidades.' },
  { lo: 70, hi: 100, color: '#ef4444', textClass: 'text-red-400', label: 'Codicia Extrema (Alto Riesgo)', range: '70–100', advice: 'Cero margen y apalancados a menos del 20%; lleva 20–40% a defensivas (SGOV/IB01 o SCHD según tu perfil), acumula CASH para caídas y reduce acciones/ETFs caros de forma incremental según suba el CAPE Ratio.' },
];

// Cortes interiores (bordes entre bandas), para degradados y geometría del gauge.
export const BHT_CUTS = [40, 50, 62, 70];

export const bhtBand = (v: number): BhtBand =>
  BHT_BANDS.find((b) => v >= b.lo && (v < b.hi || b.hi === 100)) ??
  (v < 0 ? BHT_BANDS[0] : BHT_BANDS[BHT_BANDS.length - 1]);

export const bhtBandColor = (v: number): string => bhtBand(v).color;
export const bhtBandLabel = (v: number): string => bhtBand(v).label;
