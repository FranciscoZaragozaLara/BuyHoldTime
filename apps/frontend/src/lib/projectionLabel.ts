// Texto que explica de dónde sale la proyección de EPS de la ficha (backend: domain/eps-projection.ts).
import type { EpsProjection } from '@/services/api';

export function projectionNote(p: EpsProjection | null | undefined, es: boolean): string {
  if (!p) {
    return es
      ? 'Sin historia suficiente en los reportes a la SEC: EPS proyectado con un crecimiento supuesto de 6% anual.'
      : 'Not enough SEC filing history: EPS projected with an assumed 6% annual growth.';
  }
  const model = Math.round((1 - p.analystWeight) * 100), analysts = Math.round(p.analystWeight * 100);
  if (p.basis === 'blend') {
    return es
      ? `Proyección de EPS: combinación de un modelo propio con datos históricos de los reportes a la SEC (${model}%) y el consenso de analistas disponible (${analysts}%), que suele incorporar la guía de las empresas. Es una estimación, no una garantía.`
      : `EPS projection: a blend of our own model on historical SEC filing data (${model}%) and the available analyst consensus (${analysts}%), which usually incorporates company guidance. An estimate, not a guarantee.`;
  }
  return es
    ? `Proyección de EPS con un modelo propio de datos históricos de los reportes a la SEC (crecimiento inicial ${(p.modelStartGrowth * 100).toFixed(0)}% anual que se modera hacia 6%). Es una tendencia, no un pronóstico.`
    : `EPS projection from our own model on historical SEC filing data (starting growth ${(p.modelStartGrowth * 100).toFixed(0)}% a year, fading toward 6%). A trend, not a forecast.`;
}
