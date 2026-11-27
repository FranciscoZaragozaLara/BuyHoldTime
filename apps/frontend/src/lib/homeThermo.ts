// Componentes del termómetro BHT agrupados para la home, con el ancla de su tarjeta en Indicadores.
import { bandOnlyText } from './bandOnly';
export const HOME_PART_GROUPS: { key: string; parts: { key: string; anchor: string }[] }[] = [
  { key: 'valuation', parts: [{ key: 'CAPE', anchor: 'comp-valuation' }, { key: 'FWD', anchor: 'comp-valuation' }, { key: 'RATIO', anchor: 'comp-valuation' }] },
  { key: 'inflation', parts: [{ key: 'CPI', anchor: 'comp-inflation' }, { key: 'CORE', anchor: 'comp-inflation' }, { key: 'Y2M', anchor: 'comp-rates' }, { key: '30Y', anchor: 'comp-rates' }] },
  { key: 'risk', parts: [{ key: 'MG', anchor: 'comp-leverage' }, { key: 'VIX', anchor: 'comp-sentiment' }, { key: 'FG', anchor: 'comp-sentiment' }] },
  { key: 'economy', parts: [{ key: 'MS', anchor: 'comp-economy' }, { key: 'PIB', anchor: 'comp-economy' }] },
];
export const HOME_BONUSES: { key: 'hy' | 'liq' | 'oil'; anchor: string }[] = [
  { key: 'hy', anchor: 'comp-adjustments' }, { key: 'liq', anchor: 'comp-adjustments' }, { key: 'oil', anchor: 'comp-adjustments' },
];

/** Valor legible de cada componente (% para tasas/inflación, x para múltiplos, meses para vivienda). */
export function formatPartValue(key: string, v: number, locale = 'es'): string {
  const band = bandOnlyText(key, v, locale);
  if (band) return band;
  switch (key) {
    case 'CAPE': return `${v.toFixed(2)}x`;
    case 'RATIO': return `${v.toFixed(3)}x`;
    case 'CPI': case 'CORE': case 'Y2M': case '30Y': case 'MG': case 'PIB': return `${v.toFixed(2)}%`;
    case 'FG': return v.toFixed(0);
    case 'MS': return v.toFixed(1);
    default: return v.toFixed(2);
  }
}

/** Enlace a la pestaña Indicadores de Backtesting, opcionalmente a una sección. */
// Página única de indicadores (BHT de hoy, gráfica, componentes, apalancamiento, crisis y BHT Forward).
export const indicatorsHref = (locale: string, anchor?: string) => `/${locale}/indicators${anchor ? `#${anchor}` : ''}`;
