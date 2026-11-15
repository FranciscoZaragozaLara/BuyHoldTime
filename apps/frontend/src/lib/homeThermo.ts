// Componentes del termómetro BHT agrupados para la home, con el ancla de su tarjeta en Indicadores.
export const HOME_PART_GROUPS: { key: string; parts: { key: string; anchor: string }[] }[] = [
  { key: 'valuation', parts: [{ key: 'CAPE', anchor: 'cat-valoracion' }, { key: 'FWD', anchor: 'cat-valoracion' }, { key: 'RATIO', anchor: 'cat-valoracion' }] },
  { key: 'inflation', parts: [{ key: 'CPI', anchor: 'cat-inflacion' }, { key: 'CORE', anchor: 'cat-inflacion' }, { key: 'Y2M', anchor: 'cat-tasas' }, { key: '30Y', anchor: 'cat-tasas' }] },
  { key: 'risk', parts: [{ key: 'MG', anchor: 'cat-apalancamiento' }, { key: 'VIX', anchor: 'cat-sentimiento' }, { key: 'FG', anchor: 'cat-sentimiento' }] },
  { key: 'economy', parts: [{ key: 'MS', anchor: 'cat-vivienda' }, { key: 'PIB', anchor: 'cat-crecimiento' }] },
];
export const HOME_BONUSES: { key: 'hy' | 'liq' | 'oil'; anchor: string }[] = [
  { key: 'hy', anchor: 'cat-tasas' }, { key: 'liq', anchor: 'cat-liquidez' }, { key: 'oil', anchor: 'cat-energia' },
];

/** Valor legible de cada componente (% para tasas/inflación, x para múltiplos, meses para vivienda). */
export function formatPartValue(key: string, v: number): string {
  switch (key) {
    case 'CAPE': case 'FWD': return `${v.toFixed(2)}x`;
    case 'RATIO': return `${v.toFixed(3)}x`;
    case 'CPI': case 'CORE': case 'Y2M': case '30Y': case 'MG': case 'PIB': return `${v.toFixed(2)}%`;
    case 'FG': return v.toFixed(0);
    case 'MS': return v.toFixed(1);
    default: return v.toFixed(2);
  }
}

/** Enlace a la pestaña Indicadores de Backtesting, opcionalmente a una sección. */
export const indicatorsHref = (locale: string, anchor?: string) => `/${locale}/backtesting?tab=indicadores${anchor ? `#${anchor}` : ''}`;
