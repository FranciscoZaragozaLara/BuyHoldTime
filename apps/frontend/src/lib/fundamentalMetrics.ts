// Métricas publicadas en las tablas de fundamentos (/prices/[symbol]): qué se muestra de cada bloque, en qué orden,
// con qué nombre y explicación en español e inglés, y cómo se formatea el valor. La clave es el nombre que trae el
// snapshot (GuruFocus Scrapper); lo que no está aquí sigue con el comportamiento anterior del componente.
// Se migra bloque por bloque (1: Métricas clave).

export type MetricFormat = 'usdMillions' | 'usd' | 'ratio' | 'percent' | 'usdRange';

export interface MetricDef {
  es: string;
  en: string;
  format: MetricFormat;
  descEs: string;
  descEn: string;
  positiveEs: string;
  positiveEn: string;
  negativeEs: string;
  negativeEn: string;
}

/** Bloque 1 · Métricas clave. Acciones: ingresos, utilidad por acción y beta (precio, P/E y dividendo ya están en el
 *  encabezado de la página). ETFs: además rango de 52 semanas, volatilidad y rendimiento por riesgo; se quitan los
 *  datos intradía (apertura, rango y volumen del día, ya en el encabezado de precio) y los de trading (ATR, SMA, RSI). */
export const KEY_METRICS: Record<string, MetricDef> = {
  'Revenue (TTM) (Mil $)': {
    es: 'Ingresos (12 meses)', en: 'Revenue (TTM)', format: 'usdMillions',
    descEs: 'Ventas totales de la empresa en los últimos 12 meses. Mide el tamaño del negocio.',
    descEn: 'Total company sales over the last 12 months. Measures the size of the business.',
    positiveEs: '🟢 Ingresos que crecen año con año indican demanda sólida y ganancia de mercado.',
    positiveEn: '🟢 Revenue growing year after year signals solid demand and market share gains.',
    negativeEs: '🔴 Ingresos estancados o a la baja pueden reflejar pérdida de clientes o un mercado saturado.',
    negativeEn: '🔴 Flat or falling revenue may reflect customer losses or a saturated market.',
  },
  'EPS (TTM) ($)': {
    es: 'Utilidad por acción (12 meses)', en: 'EPS (TTM)', format: 'usd',
    descEs: 'Utilidad neta de los últimos 12 meses dividida entre el número de acciones. Es la ganancia que le corresponde a cada acción.',
    descEn: 'Net income over the last 12 months divided by shares outstanding. It is the profit attributable to each share.',
    positiveEs: '🟢 Positiva y creciente: la empresa genera cada vez más ganancia por acción.',
    positiveEn: '🟢 Positive and rising: the company earns more profit per share over time.',
    negativeEs: '🔴 Negativa: la empresa tuvo pérdidas en el último año.',
    negativeEn: '🔴 Negative: the company lost money over the last year.',
  },
  Beta: {
    es: 'Beta', en: 'Beta', format: 'ratio',
    descEs: 'Cuánto se mueve el precio frente al mercado (S&P 500 = 1.0). Beta 1.5 significa que suele moverse 50% más que el mercado, hacia arriba y hacia abajo.',
    descEn: 'How much the price moves relative to the market (S&P 500 = 1.0). A beta of 1.5 means it tends to move 50% more than the market, up and down.',
    positiveEs: '🟢 Menor a 1.0: más defensiva; suele caer menos que el mercado en las correcciones.',
    positiveEn: '🟢 Below 1.0: more defensive; it usually falls less than the market in corrections.',
    negativeEs: '🔴 Mayor a 1.5: muy sensible al mercado; amplifica las subidas y también las caídas.',
    negativeEn: '🔴 Above 1.5: highly market-sensitive; it amplifies gains and losses alike.',
  },
  '52-Week Range ($)': {
    es: 'Rango de 52 semanas', en: '52-Week Range', format: 'usdRange',
    descEs: 'Precio mínimo y máximo del último año. Sirve para ver si el precio actual está cerca de sus extremos.',
    descEn: 'Lowest and highest price over the last year. Shows whether the current price is near its extremes.',
    positiveEs: '🟢 Cerca del mínimo: más barato que en el último año (conviene confirmar que no sea por un problema de fondo).',
    positiveEn: '🟢 Near the low: cheaper than during the past year (check that it is not due to a deeper problem).',
    negativeEs: '🔴 Cerca del máximo: ya subió mucho; queda menos margen si el mercado corrige.',
    negativeEn: '🔴 Near the high: it has already risen a lot; less cushion if the market corrects.',
  },
  Volatility: {
    es: 'Volatilidad anual', en: 'Annual Volatility', format: 'percent',
    descEs: 'Qué tanto oscila el precio en un año (desviación estándar anualizada de los rendimientos diarios).',
    descEn: 'How much the price swings in a year (annualized standard deviation of daily returns).',
    positiveEs: '🟢 Menor a 15%: movimientos moderados, como el S&P 500 en años tranquilos.',
    positiveEn: '🟢 Below 15%: moderate swings, like the S&P 500 in calm years.',
    negativeEs: '🔴 Mayor a 35%: oscilaciones fuertes; caídas de 30–50% son posibles en una corrección.',
    negativeEn: '🔴 Above 35%: large swings; 30–50% drops are possible in a correction.',
  },
  '3-Year Sharpe Ratio': {
    es: 'Ratio de Sharpe (3 años)', en: 'Sharpe Ratio (3Y)', format: 'ratio',
    descEs: 'Rendimiento por encima de la tasa libre de riesgo por cada unidad de volatilidad, en los últimos 3 años. Mide si el riesgo asumido fue bien pagado.',
    descEn: 'Return above the risk-free rate per unit of volatility over the last 3 years. Measures whether the risk taken was well rewarded.',
    positiveEs: '🟢 Mayor a 1.0: buen rendimiento para la volatilidad que tuvo.',
    positiveEn: '🟢 Above 1.0: good return for the volatility it had.',
    negativeEs: '🔴 Menor a 0.5: poco rendimiento para el riesgo asumido.',
    negativeEn: '🔴 Below 0.5: little return for the risk taken.',
  },
  '3-Year Sortino Ratio': {
    es: 'Ratio de Sortino (3 años)', en: 'Sortino Ratio (3Y)', format: 'ratio',
    descEs: 'Como el Sharpe, pero solo cuenta la volatilidad de las caídas. Mide el rendimiento frente al riesgo de perder.',
    descEn: 'Like the Sharpe ratio, but it only counts downside volatility. Measures return against the risk of losing money.',
    positiveEs: '🟢 Mayor a 1.5: buen rendimiento con caídas contenidas.',
    positiveEn: '🟢 Above 1.5: good return with contained drawdowns.',
    negativeEs: '🔴 Menor a 0.75: las caídas pesan mucho frente al rendimiento.',
    negativeEn: '🔴 Below 0.75: drawdowns weigh heavily against the return.',
  },
};

/** Orden de Métricas clave; lo que no está en la lista no se publica. */
export const KEY_METRICS_ORDER = Object.keys(KEY_METRICS);

export interface MetricRow {
  name: string;
  current?: string | number | null;
  vsIndustry?: string;
  vsHistory?: string;
}

/** Filas de Métricas clave permitidas, en el orden definido. */
export function keyMetricRows<T extends MetricRow>(rows: T[]): T[] {
  const by = new Map(rows.map((r) => [r.name, r]));
  return KEY_METRICS_ORDER.map((n) => by.get(n)).filter((r): r is T => !!r);
}

export function metricDef(name: string): MetricDef | undefined {
  return KEY_METRICS[name];
}

export function metricLabel(name: string, locale: string): string {
  const d = metricDef(name);
  return d ? (locale === 'es' ? d.es : d.en) : name;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const fixed = (n: number, d: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Valor formateado según la métrica; null si no hay definición o el valor no se puede leer (el componente usa su
 *  formato genérico). Montos en millones → miles de millones: «$478.8 mil M» (es) / «$478.8B» (en). */
export function formatMetricValue(name: string, raw: string | number | null | undefined, locale: string): string | null {
  const d = metricDef(name);
  if (!d) return null;
  const es = locale === 'es';
  if (d.format === 'usdRange') {
    const parts = String(raw ?? '').split(/\s+-\s+/).map(num);
    if (parts.length !== 2 || parts.some((p) => p === null)) return null;
    return `$${fixed(parts[0]!, 2)} – $${fixed(parts[1]!, 2)}`;
  }
  const n = num(raw);
  if (n === null) return null;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  switch (d.format) {
    case 'usdMillions':
      if (a >= 1e6) return es ? `${sign}$${fixed(a / 1e6, 2)} billones` : `${sign}$${fixed(a / 1e6, 2)}T`;
      if (a >= 1e3) return es ? `${sign}$${fixed(a / 1e3, 1)} mil M` : `${sign}$${fixed(a / 1e3, 1)}B`;
      return es ? `${sign}$${fixed(a, 0)} M` : `${sign}$${fixed(a, 0)}M`;
    case 'usd':
      return `${sign}$${fixed(a, 2)}`;
    case 'percent':
      return `${sign}${fixed(a, 1)}%`;
    case 'ratio':
    default:
      return `${sign}${fixed(a, 2)}`;
  }
}
