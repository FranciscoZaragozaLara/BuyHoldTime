import { TOKENS } from '@/lib/designTokens';
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
  { lo: 0, hi: 40, color: '#22c55e', textClass: 'text-favorable-400', label: 'Miedo Extremo (Alta Oportunidad)', range: '0–39', advice: 'Miedo extremo suele ser la mejor oportunidad: considera entrar con más fuerza en QQQ, TQQQ o SOXX tras confirmar pisos y sobreventa con el CAPE y el RSI. El margen solo tiene sentido si toleras alta volatilidad.' },
  { lo: 40, hi: 50, color: '#84cc36', textClass: 'text-lime-400', label: 'Miedo (Oportunidad)', range: '40–49', advice: 'Zona favorable: puedes considerar margen moderado y apalancados, evitando el margen extremo. Conviene esperar una reversión a tendencia alcista antes de comprar QQQ, TQQQ o empresas de calidad subvaluadas.' },
  { lo: 50, hi: 62, color: '#eab308', textClass: 'text-caution-300', label: 'Neutral', range: '50–61', advice: 'Sin señal clara: sugerimos no aumentar apalancados ni margen (TQQQ, SOXL). Mantener posiciones y acumular liquidez y defensivas suele ser la estrategia base.' },
  { lo: 62, hi: 70, color: TOKENS.elevated, textClass: 'text-elevated-400', label: 'Codicia (Riesgo)', range: '62–69', advice: 'Riesgo en aumento: considera reducir QQQ/TQQQ/SOXX y bajar el margen, manteniendo al menos un 10% en efectivo o SGOV para aprovechar oportunidades.' },
  { lo: 70, hi: 100, color: TOKENS.risk, textClass: 'text-risk-400', label: 'Codicia Extrema (Alto Riesgo)', range: '70–100', advice: 'Riesgo alto: sugerimos eliminar el margen y dejar los apalancados por debajo del 20%; mover un 20–40% a defensivas (SGOV/IB01 o SCHD según tu perfil), acumular efectivo para las caídas y recortar de forma gradual acciones y ETFs caros conforme suba el CAPE Ratio.' },
];

// Cortes interiores (bordes entre bandas), para degradados y geometría del gauge.
export const BHT_CUTS = [40, 50, 62, 70];

export const bhtBand = (v: number): BhtBand =>
  BHT_BANDS.find((b) => v >= b.lo && (v < b.hi || b.hi === 100)) ??
  (v < 0 ? BHT_BANDS[0] : BHT_BANDS[BHT_BANDS.length - 1]);

export const bhtBandColor = (v: number): string => bhtBand(v).color;
export const bhtBandLabel = (v: number): string => bhtBand(v).label;
