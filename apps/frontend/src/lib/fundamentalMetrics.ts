// Métricas publicadas en las tablas de fundamentos (/prices/[symbol]): qué se muestra de cada bloque, en qué orden,
// con qué nombre y explicación en español e inglés, y cómo se formatea el valor. La clave es el nombre que trae el
// snapshot (GuruFocus Scrapper); lo que no está aquí sigue con el comportamiento anterior del componente.
// Se migra bloque por bloque (1: Métricas clave · 2: Valuación · 3: Crecimiento).

export type MetricFormat = 'usdMillions' | 'usd' | 'ratio' | 'multiple' | 'percent' | 'usdRange';

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

/** Bloque 2 · Valuación. Múltiplos estándar (precio y valor de empresa contra utilidades, ventas, valor en libros y
 *  flujo libre) más el rendimiento del flujo libre. Se quitan los repetidos (P/flujo operativo, EV/EBIT, EV/FCF), el
 *  de nicho (precio/valor tangible) y Price-to-Projected-FCF, un cálculo propio de GuruFocus. */
export const VALUATION_METRICS: Record<string, MetricDef> = {
  'PE Ratio': {
    es: 'P/E (precio / utilidad)', en: 'P/E Ratio', format: 'multiple',
    descEs: 'Cuántos dólares se pagan por cada dólar de utilidad anual de la empresa (últimos 12 meses).',
    descEn: 'How many dollars investors pay for each dollar of the company’s annual earnings (last 12 months).',
    positiveEs: '🟢 Moderado (12x–20x) o bajo frente a su crecimiento: precio razonable.',
    positiveEn: '🟢 Moderate (12x–20x) or low relative to its growth: reasonable price.',
    negativeEs: '🔴 Muy alto (más de 40x) sin un crecimiento que lo respalde: el precio descuenta mucho optimismo.',
    negativeEn: '🔴 Very high (above 40x) without growth to back it: the price assumes a lot of optimism.',
  },
  'Forward PE Ratio': {
    es: 'P/E estimado (12 meses)', en: 'Forward P/E', format: 'multiple',
    descEs: 'P/E calculado con la utilidad que los analistas esperan para los próximos 12 meses.',
    descEn: 'P/E calculated with the earnings analysts expect over the next 12 months.',
    positiveEs: '🟢 Menor que el P/E actual: se espera que la utilidad crezca.',
    positiveEn: '🟢 Lower than the current P/E: earnings are expected to grow.',
    negativeEs: '🔴 Mayor que el P/E actual: se espera que la utilidad baje.',
    negativeEn: '🔴 Higher than the current P/E: earnings are expected to fall.',
  },
  'PE Ratio without NRI': {
    es: 'P/E ajustado (sin extraordinarios)', en: 'Adjusted P/E (ex one-offs)', format: 'multiple',
    descEs: 'P/E sin partidas que no se repiten (ventas de activos, cargos legales, reestructuras). Muestra el precio frente a la utilidad recurrente.',
    descEn: 'P/E excluding non-recurring items (asset sales, legal charges, restructuring). Shows price against recurring earnings.',
    positiveEs: '🟢 Parecido al P/E normal: la utilidad es de buena calidad y recurrente.',
    positiveEn: '🟢 Close to the regular P/E: earnings are high-quality and recurring.',
    negativeEs: '🔴 Muy distinto al P/E normal: la utilidad del año está inflada o castigada por un evento único.',
    negativeEn: '🔴 Very different from the regular P/E: this year’s earnings are inflated or hit by a one-off event.',
  },
  'PEG Ratio': {
    es: 'PEG (P/E entre crecimiento)', en: 'PEG Ratio', format: 'ratio',
    descEs: 'P/E dividido entre el crecimiento anual de la utilidad. Mide si el precio está justificado por el crecimiento.',
    descEn: 'P/E divided by annual earnings growth. Measures whether the price is justified by growth.',
    positiveEs: '🟢 Menor a 1.0: crecimiento a buen precio.',
    positiveEn: '🟢 Below 1.0: growth at a reasonable price.',
    negativeEs: '🔴 Mayor a 2.0: se paga caro el crecimiento esperado.',
    negativeEn: '🔴 Above 2.0: expected growth is expensive.',
  },
  'Shiller PE Ratio': {
    es: 'CAPE (P/E de Shiller)', en: 'Shiller P/E (CAPE)', format: 'multiple',
    descEs: 'Precio entre la utilidad promedio de 10 años ajustada por inflación. Suaviza los años excepcionalmente buenos o malos.',
    descEn: 'Price divided by 10-year average inflation-adjusted earnings. Smooths out exceptionally good or bad years.',
    positiveEs: '🟢 Bajo (menos de 20x): barato frente a su utilidad de largo plazo.',
    positiveEn: '🟢 Low (below 20x): cheap relative to long-term earnings.',
    negativeEs: '🔴 Alto (más de 35x): el precio va muy por delante de la utilidad promedio de la década.',
    negativeEn: '🔴 High (above 35x): the price runs far ahead of the decade’s average earnings.',
  },
  'PS Ratio': {
    es: 'Precio / Ventas', en: 'Price / Sales', format: 'multiple',
    descEs: 'Valor de mercado entre las ventas de los últimos 12 meses. Útil cuando la empresa todavía no tiene utilidades.',
    descEn: 'Market value divided by sales over the last 12 months. Useful when the company is not yet profitable.',
    positiveEs: '🟢 Bajo (menos de 2x): se paga poco por cada dólar de ventas.',
    positiveEn: '🟢 Low (below 2x): little is paid for each dollar of sales.',
    negativeEs: '🔴 Muy alto (más de 10x): exige márgenes y crecimiento excepcionales para justificarse.',
    negativeEn: '🔴 Very high (above 10x): requires exceptional margins and growth to be justified.',
  },
  'PB Ratio': {
    es: 'Precio / Valor en libros', en: 'Price / Book', format: 'multiple',
    descEs: 'Valor de mercado entre el capital contable (activos menos deudas). Más útil en bancos, aseguradoras e industrias con muchos activos.',
    descEn: 'Market value divided by shareholders’ equity (assets minus liabilities). Most useful for banks, insurers and asset-heavy industries.',
    positiveEs: '🟢 Cerca o debajo de 1.5x: el precio está cerca del valor contable del negocio.',
    positiveEn: '🟢 Near or below 1.5x: the price is close to the business’s book value.',
    negativeEs: '🔴 Muy alto: el valor depende de marcas, tecnología o expectativas, no de activos en balance.',
    negativeEn: '🔴 Very high: the value relies on brands, technology or expectations, not balance-sheet assets.',
  },
  'Price-to-Free-Cash-Flow': {
    es: 'Precio / Flujo libre', en: 'Price / Free Cash Flow', format: 'multiple',
    descEs: 'Valor de mercado entre el flujo de efectivo libre (efectivo que queda después de las inversiones). Más difícil de maquillar que la utilidad.',
    descEn: 'Market value divided by free cash flow (cash left after capital spending). Harder to dress up than earnings.',
    positiveEs: '🟢 Bajo (menos de 15x): mucho efectivo disponible para dividendos, recompras o crecer.',
    positiveEn: '🟢 Low (below 15x): plenty of cash for dividends, buybacks or growth.',
    negativeEs: '🔴 Muy alto o negativo: genera poco efectivo o lo está quemando.',
    negativeEn: '🔴 Very high or negative: it generates little cash or is burning it.',
  },
  'FCF Yield %': {
    es: 'Rendimiento del flujo libre', en: 'Free Cash Flow Yield', format: 'percent',
    descEs: 'Flujo de efectivo libre entre el valor de mercado. Es el inverso de Precio / Flujo libre: cuánto efectivo genera la empresa por cada $100 de su valor.',
    descEn: 'Free cash flow divided by market value. The inverse of Price / Free Cash Flow: how much cash the company generates per $100 of its value.',
    positiveEs: '🟢 Mayor a 5%: genera mucho efectivo para su precio.',
    positiveEn: '🟢 Above 5%: strong cash generation for its price.',
    negativeEs: '🔴 Menor a 2% o negativo: cotiza cara o consume efectivo.',
    negativeEn: '🔴 Below 2% or negative: expensive, or it consumes cash.',
  },
  'EV-to-EBITDA': {
    es: 'EV / EBITDA', en: 'EV / EBITDA', format: 'multiple',
    descEs: 'Valor de la empresa (acciones + deuda − efectivo) entre su utilidad operativa antes de depreciación. Compara empresas con distinta deuda.',
    descEn: 'Enterprise value (equity + debt − cash) divided by operating profit before depreciation. Compares companies with different debt levels.',
    positiveEs: '🟢 Bajo (menos de 10x): barato aun considerando su deuda.',
    positiveEn: '🟢 Low (below 10x): cheap even after accounting for debt.',
    negativeEs: '🔴 Alto (más de 20x): necesita crecer rápido para justificar el precio.',
    negativeEn: '🔴 High (above 20x): needs fast growth to justify the price.',
  },
  'EV-to-Revenue': {
    es: 'EV / Ventas', en: 'EV / Revenue', format: 'multiple',
    descEs: 'Valor de la empresa (acciones + deuda − efectivo) entre sus ventas. Como Precio / Ventas, pero toma en cuenta la deuda.',
    descEn: 'Enterprise value (equity + debt − cash) divided by revenue. Like Price / Sales, but it accounts for debt.',
    positiveEs: '🟢 Bajo (menos de 2x): poco valor pagado por cada dólar de ventas, incluida la deuda.',
    positiveEn: '🟢 Low (below 2x): little paid per dollar of sales, debt included.',
    negativeEs: '🔴 Muy alto (más de 10x): exige márgenes altos y crecimiento sostenido.',
    negativeEn: '🔴 Very high (above 10x): requires high margins and sustained growth.',
  },
};

/** Bloque 3 · Crecimiento. Crecimiento anual de los últimos 3 años (ingresos, utilidad por acción, flujo libre) y el
 *  esperado por los analistas a 3–5 años. Se quitan EBITDA (repite a la utilidad) y valor en libros (de nicho). */
export const GROWTH_METRICS: Record<string, MetricDef> = {
  '3-Year Revenue Growth Rate': {
    es: 'Crecimiento de ingresos (3 años)', en: 'Revenue Growth (3Y)', format: 'percent',
    descEs: 'Crecimiento anual promedio de las ventas en los últimos 3 años.',
    descEn: 'Average annual sales growth over the last 3 years.',
    positiveEs: '🟢 Más de 10% al año: el negocio se expande con fuerza.',
    positiveEn: '🟢 Above 10% a year: the business is expanding strongly.',
    negativeEs: '🔴 Negativo: las ventas se están reduciendo.',
    negativeEn: '🔴 Negative: sales are shrinking.',
  },
  '3-Year EPS without NRI Growth Rate': {
    es: 'Crecimiento de utilidad por acción (3 años)', en: 'EPS Growth (3Y)', format: 'percent',
    descEs: 'Crecimiento anual promedio de la utilidad por acción en los últimos 3 años, sin partidas extraordinarias.',
    descEn: 'Average annual growth in earnings per share over the last 3 years, excluding one-off items.',
    positiveEs: '🟢 Más de 10% al año y por encima del crecimiento de ingresos: mejoran los márgenes o se recompran acciones.',
    positiveEn: '🟢 Above 10% a year and faster than revenue: margins are improving or shares are being bought back.',
    negativeEs: '🔴 Negativo: la utilidad por acción va a la baja.',
    negativeEn: '🔴 Negative: earnings per share are declining.',
  },
  '3-Year FCF Growth Rate': {
    es: 'Crecimiento del flujo libre (3 años)', en: 'Free Cash Flow Growth (3Y)', format: 'percent',
    descEs: 'Crecimiento anual promedio del flujo de efectivo libre en los últimos 3 años. Suele ser más irregular que la utilidad.',
    descEn: 'Average annual growth in free cash flow over the last 3 years. It is usually lumpier than earnings.',
    positiveEs: '🟢 Positivo y parecido al de la utilidad: las ganancias se convierten en efectivo.',
    positiveEn: '🟢 Positive and close to earnings growth: profits are turning into cash.',
    negativeEs: '🔴 Negativo mientras la utilidad crece: la utilidad no se está convirtiendo en efectivo.',
    negativeEn: '🔴 Negative while earnings grow: profits are not turning into cash.',
  },
  'Future 3-5Y Total Revenue Growth Rate Estimate': {
    es: 'Crecimiento esperado de ingresos (3–5 años)', en: 'Expected Revenue Growth (3–5Y)', format: 'percent',
    descEs: 'Crecimiento anual de las ventas que esperan los analistas para los próximos 3 a 5 años.',
    descEn: 'Annual sales growth analysts expect over the next 3 to 5 years.',
    positiveEs: '🟢 Mayor que el de los últimos 3 años: se espera que el negocio acelere.',
    positiveEn: '🟢 Higher than the last 3 years: the business is expected to accelerate.',
    negativeEs: '🔴 Muy alto (más de 25%): expectativas exigentes; si no se cumplen, el precio suele castigarse.',
    negativeEn: '🔴 Very high (above 25%): demanding expectations; if they are missed, the price usually suffers.',
  },
  // El scraper le agrega «Industry Rank» al nombre, pero el valor es la estimación de crecimiento (p. ej. 12.5%).
  'Future 3-5Y EPS without NRI Growth Rate Estimate Industry Rank': {
    es: 'Crecimiento esperado de utilidad por acción (3–5 años)', en: 'Expected EPS Growth (3–5Y)', format: 'percent',
    descEs: 'Crecimiento anual de la utilidad por acción que esperan los analistas para los próximos 3 a 5 años.',
    descEn: 'Annual earnings-per-share growth analysts expect over the next 3 to 5 years.',
    positiveEs: '🟢 Entre 10% y 20%: crecimiento sólido y alcanzable.',
    positiveEn: '🟢 Between 10% and 20%: solid, achievable growth.',
    negativeEs: '🔴 Mucho mayor que su historial: expectativas difíciles de cumplir.',
    negativeEn: '🔴 Far above its track record: expectations that are hard to meet.',
  },
};

/** Métricas publicadas por bloque (sección del snapshot), en su orden; lo que no está en la lista no se publica. */
export const SECTION_METRICS: Record<string, Record<string, MetricDef>> = {
  keyMetrics: KEY_METRICS,
  valuation: VALUATION_METRICS,
  growth: GROWTH_METRICS,
};
const ALL_METRICS: Record<string, MetricDef> = Object.assign({}, ...Object.values(SECTION_METRICS));

export interface MetricRow {
  name: string;
  current?: string | number | null;
  vsIndustry?: string;
  vsHistory?: string;
}

/** ¿El bloque ya está migrado al diccionario? */
export function isCuratedSection(section: string): boolean {
  return section in SECTION_METRICS;
}

/** Filas permitidas de un bloque migrado, en el orden definido (bloques no migrados: sin cambios). */
export function sectionRows<T extends MetricRow>(section: string, rows: T[]): T[] {
  const defs = SECTION_METRICS[section];
  if (!defs) return rows;
  const by = new Map(rows.map((r) => [r.name, r]));
  return Object.keys(defs).map((n) => by.get(n)).filter((r): r is T => !!r);
}

/** Filas de Métricas clave permitidas, en el orden definido. */
export function keyMetricRows<T extends MetricRow>(rows: T[]): T[] {
  return sectionRows('keyMetrics', rows);
}

export function metricDef(name: string): MetricDef | undefined {
  return ALL_METRICS[name];
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
    case 'multiple':
      return `${sign}${fixed(a, 1)}x`;
    case 'ratio':
    default:
      return `${sign}${fixed(a, 2)}`;
  }
}
