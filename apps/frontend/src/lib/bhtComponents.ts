// Componentes del BHT Index para la página de indicadores: agrupa las partes que devuelve
// /api/backtesting/thermo-live (fuente única del BHT) por categoría, con su aporte y la fecha de cada dato.
// Funciones puras (testeadas en bhtComponents.test.ts); la vista está en components/indicators/BhtComponents.tsx.

export type Loc = 'es' | 'en';
export type ThermoPart = { key: string; score: number; weight: number; value: number };
export type LiveStamp = { date: string; source: string };

export type CategoryKey = 'valuation' | 'inflation' | 'rates' | 'leverage' | 'sentiment' | 'economy';
export type Cadence = 'daily' | 'monthly' | 'quarterly';

type Meta = {
  category: CategoryKey;
  name: Record<Loc, string>;
  /** Qué mide y cómo se lee, en una línea. */
  meaning: Record<Loc, string>;
  /** Formato del valor. */
  fmt: (v: number) => string;
  /** Serie de la que sale el dato (clave de `live` en thermo-live) y su frecuencia. */
  stamp?: string;
  cadence: Cadence;
};

const pct = (d = 2) => (v: number) => `${v.toFixed(d)}%`;

export const PART_META: Record<string, Meta> = {
  CAPE: {
    category: 'valuation', cadence: 'daily', stamp: 'CAPE',
    name: { es: 'CAPE de Shiller', en: 'Shiller CAPE' },
    meaning: { es: 'Precio ÷ utilidades promedio de 10 años ajustadas por inflación. Más alto = más caro.', en: 'Price ÷ 10-year average inflation-adjusted earnings. Higher = more expensive.' },
    fmt: (v) => `${v.toFixed(2)}x`,
  },
  RATIO: {
    category: 'valuation', cadence: 'daily', stamp: 'CAPE',
    name: { es: 'CAPE vs su media de 3 años', en: 'CAPE vs its 3-year mean' },
    meaning: { es: 'Si la valuación se está estirando respecto a su nivel reciente.', en: 'Whether valuation is stretching versus its recent level.' },
    fmt: (v) => `${v.toFixed(3)}×`,
  },
  FWD: {
    category: 'valuation', cadence: 'daily',
    name: { es: 'P/E estimado (forward)', en: 'Forward P/E' },
    meaning: { es: 'Precio ÷ utilidades estimadas a 12 meses (WSJ / Birinyi).', en: 'Price ÷ 12-month estimated earnings (WSJ / Birinyi).' },
    fmt: (v) => `${v.toFixed(2)}x`,
  },
  CPI: {
    category: 'inflation', cadence: 'monthly', stamp: 'CPIAUCSL',
    name: { es: 'Inflación (IPC anual)', en: 'Inflation (CPI YoY)' },
    meaning: { es: 'Inflación alta presiona a la Fed a mantener tasas altas.', en: 'High inflation pushes the Fed to keep rates high.' },
    fmt: pct(2),
  },
  CORE: {
    category: 'inflation', cadence: 'monthly', stamp: 'CPILFESL',
    name: { es: 'Inflación subyacente', en: 'Core inflation' },
    meaning: { es: 'IPC sin alimentos ni energía: la tendencia de fondo.', en: 'CPI excluding food and energy: the underlying trend.' },
    fmt: pct(2),
  },
  Y2M: {
    category: 'rates', cadence: 'daily', stamp: 'DGS2',
    name: { es: 'Tesoro 2 años (momentum)', en: '2-year Treasury (momentum)' },
    meaning: { es: 'Nivel y cambio contra su media de 6 meses: subidas rápidas endurecen las condiciones.', en: 'Level and change versus its 6-month mean: fast rises tighten conditions.' },
    fmt: pct(2),
  },
  '30Y': {
    category: 'rates', cadence: 'daily', stamp: 'DGS30',
    name: { es: 'Tesoro 30 años (momentum)', en: '30-year Treasury (momentum)' },
    meaning: { es: 'Tasa larga y su cambio contra la media de 6 meses: encarece la valuación de las acciones.', en: 'Long rate and its change versus the 6-month mean: weighs on equity valuations.' },
    fmt: pct(2),
  },
  MG: {
    category: 'leverage', cadence: 'monthly',
    name: { es: 'Deuda de margen / PIB', en: 'Margin debt / GDP' },
    meaning: { es: 'Apalancamiento de los inversionistas (FINRA) contra el tamaño de la economía.', en: 'Investor leverage (FINRA) relative to the size of the economy.' },
    fmt: pct(2),
  },
  VIX: {
    category: 'sentiment', cadence: 'daily', stamp: 'VIXCLS',
    name: { es: 'Volatilidad (VIX)', en: 'Volatility (VIX)' },
    meaning: { es: 'Volatilidad esperada del S&P 500. Alta = miedo, que históricamente baja el riesgo.', en: 'Expected S&P 500 volatility. High = fear, which historically lowers risk.' },
    fmt: (v) => v.toFixed(2),
  },
  FG: {
    category: 'sentiment', cadence: 'daily', stamp: 'FEAR_GREED',
    name: { es: 'Miedo y Avaricia (CNN)', en: 'Fear & Greed (CNN)' },
    meaning: { es: '0 = miedo extremo, 100 = avaricia extrema.', en: '0 = extreme fear, 100 = extreme greed.' },
    fmt: (v) => v.toFixed(0),
  },
  PIB: {
    category: 'economy', cadence: 'quarterly', stamp: 'GDPC1',
    name: { es: 'PIB real (anual)', en: 'Real GDP (YoY)' },
    meaning: { es: 'Crecimiento de la economía; muy alto suele ser tarde en el ciclo.', en: 'Economic growth; very high tends to be late in the cycle.' },
    fmt: pct(2),
  },
  MS: {
    category: 'economy', cadence: 'monthly', stamp: 'MSACSR',
    name: { es: 'Inventario de vivienda nueva', en: 'New-home inventory' },
    meaning: { es: 'Meses de oferta de casas nuevas (MSACSR): sube antes de las recesiones.', en: 'Months of new-home supply (MSACSR): rises ahead of recessions.' },
    fmt: (v) => `${v.toFixed(1)}`,
  },
};

export const CATEGORY_ORDER: CategoryKey[] = ['valuation', 'inflation', 'rates', 'leverage', 'sentiment', 'economy'];
export const CATEGORY_NAME: Record<CategoryKey, Record<Loc, string>> = {
  valuation: { es: 'Valuación', en: 'Valuation' },
  inflation: { es: 'Inflación', en: 'Inflation' },
  rates: { es: 'Tasas', en: 'Rates' },
  leverage: { es: 'Apalancamiento', en: 'Leverage' },
  sentiment: { es: 'Sentimiento', en: 'Sentiment' },
  economy: { es: 'Economía', en: 'Economy' },
};

export type ComponentRow = ThermoPart & {
  name: string; meaning: string; display: string;
  /** Puntos que aporta al BHT: puntaje × peso ÷ peso total. */
  points: number;
  /** Peso como % del total. */
  weightPct: number;
  stamp: LiveStamp | null; cadence: Cadence;
};
export type ComponentGroup = { key: CategoryKey; name: string; rows: ComponentRow[]; points: number };

/** Agrupa las partes por categoría en el orden fijo; las claves desconocidas se ignoran. */
export function groupComponents(parts: ThermoPart[], live: Record<string, LiveStamp> = {}, loc: Loc = 'es'): ComponentGroup[] {
  const wTotal = parts.reduce((m, p) => m + p.weight, 0) || 1;
  const rows = parts.filter((p) => PART_META[p.key]).map((p): ComponentRow => {
    const m = PART_META[p.key];
    return {
      ...p, name: m.name[loc], meaning: m.meaning[loc], display: m.fmt(p.value),
      points: (p.score * p.weight) / wTotal, weightPct: (p.weight / wTotal) * 100,
      stamp: m.stamp ? live[m.stamp] ?? null : null, cadence: m.cadence,
    };
  });
  return CATEGORY_ORDER.map((key) => {
    const rs = rows.filter((r) => PART_META[r.key].category === key);
    return { key, name: CATEGORY_NAME[key][loc], rows: rs, points: rs.reduce((m, r) => m + r.points, 0) };
  }).filter((g) => g.rows.length);
}

const MONTHS: Record<Loc, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Fecha del dato según su frecuencia: diario "20-nov-2026", mensual "oct 2026", trimestral "T3 2026". */
export function stampLabel(date: string, cadence: Cadence, loc: Loc = 'es'): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m) return date;
  if (cadence === 'quarterly') return `${loc === 'es' ? 'T' : 'Q'}${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (cadence === 'monthly') return `${MONTHS[loc][m - 1]} ${y}`;
  return loc === 'es' ? `${d}-${MONTHS.es[m - 1]}-${y}` : `${MONTHS.en[m - 1]} ${d}, ${y}`;
}

/** Composición del BHT: base (promedio ponderado) + ajustes = valor; el valor se recorta a 0–100. */
export function bhtComposition(parts: ThermoPart[], bonuses: number[]): { base: number; adj: number; total: number } {
  const wTotal = parts.reduce((m, p) => m + p.weight, 0);
  const base = wTotal ? parts.reduce((m, p) => m + p.score * p.weight, 0) / wTotal : 0;
  const adj = bonuses.reduce((m, b) => m + b, 0);
  return { base, adj, total: Math.max(0, Math.min(100, base + adj)) };
}
