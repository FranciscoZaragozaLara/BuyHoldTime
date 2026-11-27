// Componentes del BHT Index para la página de indicadores: agrupa las partes que devuelve
// /api/backtesting/thermo-live (fuente única del BHT) por categoría, con su aporte y la fecha de cada dato.
// Funciones puras (testeadas en bhtComponents.test.ts); la vista está en components/indicators/BhtComponents.tsx.

import { bandOnlyText } from './bandOnly';

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
  fmt: (v: number, loc: Loc) => string;
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
    meaning: { es: 'Precio ÷ utilidades estimadas por analistas para los próximos 12 meses (se muestra la banda).', en: 'Price ÷ analysts\' estimated earnings for the next 12 months (band shown).' },
    fmt: (v, loc) => bandOnlyText('FWD', v, loc) ?? '—',
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
    name: { es: 'Fear & Greed (CNN)', en: 'Fear & Greed (CNN)' },
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
      ...p, name: m.name[loc], meaning: m.meaning[loc], display: m.fmt(p.value, loc),
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

/** Estado del ajuste de crédito (getHyBonus en el backend devuelve una etiqueta interna en español) en palabras para
 *  el usuario, en ES o EN. Las etiquetas desconocidas se devuelven tal cual. */
export function hyAdjustmentLabel(label: string, loc: Loc): string {
  const es = loc === 'es';
  const capped = label.endsWith(' · tope Fed');
  const base = capped ? label.slice(0, -' · tope Fed'.length) : label;
  const n = (x: string) => Number(x).toFixed(2);
  let m: RegExpMatchArray | null;
  let out: string;
  if (base === 'armado') out = es ? 'Complacencia: spread en el 20% más bajo de 3 años' : 'Complacency: spread in the lowest 20% of the last 3 years';
  else if ((m = base.match(/^sostenido ([\d.]+)/))) out = es ? `Estrés sostenido: promedio de ${n(m[1])}% en 3 meses` : `Sustained stress: ${n(m[1])}% average over 3 months`;
  else if ((m = base.match(/^G1 z (-?[\d.]+)/))) out = es ? `Tensión: subida de 3 meses de ${m[1]} desviaciones` : `Stress: 3-month rise of ${m[1]} standard deviations`;
  else if ((m = base.match(/^G2 Δ1M \+([\d.]+)/))) out = es ? `Tensión fuerte: +${m[1]} pts en un mes` : `Sharp stress: +${m[1]} pts in one month`;
  else if ((m = base.match(/^alto HY>8 Δ1M \+([\d.]+)/))) out = es ? `Alto: spread arriba de 8% y subiendo (+${m[1]} en 1 mes)` : `High: spread above 8% and rising (+${m[1]} in 1 month)`;
  else if ((m = base.match(/^severo HY>9 Δ3M \+([\d.]+)/))) out = es ? `Severo: spread arriba de 9% y subiendo (+${m[1]} en 3 meses)` : `Severe: spread above 9% and rising (+${m[1]} in 3 months)`;
  else if ((m = base.match(/^crítico HY>10 Δ3M \+([\d.]+)/))) out = es ? `Crítico: spread arriba de 10% y subiendo (+${m[1]} en 3 meses)` : `Critical: spread above 10% and rising (+${m[1]} in 3 months)`;
  else if (base === 'sin dato') out = es ? 'Sin dato' : 'No data';
  else if (base === '—') out = es ? 'Sin ajuste' : 'No adjustment';
  else out = base;
  return capped ? `${out} ${es ? '(tope por rescate de la Fed)' : '(capped by Fed rescue)'}` : out;
}

/** Estado del ajuste de liquidez M2/M0 (etiqueta interna en español de getLiqBonus*) en palabras, en ES o EN. */
export function liqAdjustmentLabel(label: string, loc: Loc): string {
  const es = loc === 'es';
  let m: RegExpMatchArray | null;
  if ((m = label.match(/^(mega)?bazuca M0 Δ3M \+([\d.]+)% M2 \+([\d.]+)%/))) {
    const big = !!m[1];
    return es ? `${big ? 'Megabazuca' : 'Bazuca'} de la Fed: M0 +${m[2]}% en 3 meses, M2 +${m[3]}% anual`
      : `Fed ${big ? 'mega-bazooka' : 'bazooka'}: M0 +${m[2]}% in 3 months, M2 +${m[3]}% a year`;
  }
  if ((m = label.match(/^viento (a favor|en contra) prom\. 3M \(([^)]*)\)/))) {
    const tail = m[1] === 'a favor';
    return es ? `Viento ${m[1]} (promedio de 3 meses: ${m[2]})` : `${tail ? 'Tailwind' : 'Headwind'} (3-month average: ${m[2]})`;
  }
  if ((m = label.match(/^viento en contra M2 −([\d.]+)% del pico/))) {
    return es ? `Viento en contra: el crecimiento de M2 está ${m[1]}% debajo de su pico` : `Headwind: M2 growth is ${m[1]}% below its peak`;
  }
  if ((m = label.match(/^viento a favor M2 \+([\d.]+)%/))) return es ? `Viento a favor: M2 crece ${m[1]}% anual` : `Tailwind: M2 growing ${m[1]}% a year`;
  if (label === 'sin dato') return es ? 'Sin dato' : 'No data';
  if (label === '—') return es ? 'Sin ajuste' : 'No adjustment';
  return label;
}

/** Estado del ajuste de petróleo (etiqueta interna en español de getOilBonus) en palabras, en ES o EN. */
export function oilAdjustmentLabel(label: string, loc: Loc): string {
  const es = loc === 'es';
  const m = label.match(/^(caro|shock|barato|alivio) WTI ([\d.]+)( \(sin persistencia\))?/);
  if (m) {
    const word = { caro: ['Caro', 'Expensive'], shock: ['Choque de precio', 'Price shock'], barato: ['Barato', 'Cheap'], alivio: ['Alivio', 'Relief'] }[m[1] as 'caro'][es ? 0 : 1];
    const tail = m[3] ? (es ? ' (sin persistencia)' : ' (not persistent)') : '';
    return es ? `${word}: WTI ${m[2]}× su media de 36 meses${tail}` : `${word}: WTI ${m[2]}× its 36-month mean${tail}`;
  }
  if (label === 'sin dato') return es ? 'Sin dato' : 'No data';
  if (label === '—') return es ? 'Sin ajuste' : 'No adjustment';
  return label;
}

/** Explicación sencilla de cada indicador del BHT y de sus ajustes (la (i) de la tabla del cálculo): qué es y por qué
 *  sube o baja el riesgo, en palabras para cualquier inversionista. */
export const PART_EXPLAIN: Record<string, Record<Loc, string>> = {
  CAPE: {
    es: 'Compara el precio del S&P 500 con lo que las empresas ganaron en promedio en los últimos 10 años, ajustado por inflación. Es como preguntar cuántos años de utilidades estás pagando: mientras más alto, más caro está el mercado y menores suelen ser los rendimientos de los años siguientes.',
    en: 'Compares the S&P 500 price with what companies earned on average over the last 10 years, adjusted for inflation. It is like asking how many years of profits you are paying for: the higher it is, the more expensive the market and the lower returns tend to be in the following years.',
  },
  RATIO: {
    es: 'Mide si el CAPE de hoy está arriba o abajo de su promedio de los últimos 3 años. Si el mercado se encareció muy rápido respecto a su nivel reciente, aumenta el riesgo de una corrección.',
    en: "Measures whether today's CAPE is above or below its average of the last 3 years. If the market got expensive very quickly compared with its recent level, the risk of a correction goes up.",
  },
  FWD: {
    es: 'El precio del S&P 500 entre las utilidades que los analistas esperan para los próximos 12 meses. Si es alto, el mercado ya da por hecho mucho crecimiento y cualquier decepción pega más fuerte.',
    en: 'The S&P 500 price divided by the earnings analysts expect over the next 12 months. When it is high, the market already assumes a lot of growth, so any disappointment hits harder.',
  },
  CPI: {
    es: 'Cuánto subieron los precios al consumidor en el último año. Con inflación alta, la Fed tiende a subir o mantener altas las tasas, y eso suele frenar a la bolsa.',
    en: 'How much consumer prices rose over the last year. With high inflation, the Fed tends to raise rates or keep them high, which usually holds the stock market back.',
  },
  CORE: {
    es: 'La misma inflación pero sin alimentos ni energía, que suben y bajan mucho. Muestra la tendencia de fondo de los precios, que es la que más vigila la Fed.',
    en: 'The same inflation without food and energy, which swing a lot. It shows the underlying price trend, which is the one the Fed watches most closely.',
  },
  Y2M: {
    es: 'La tasa del bono del Tesoro a 2 años refleja lo que el mercado espera que haga la Fed. Si sube rápido frente a su promedio de 6 meses, el dinero se encarece y eso presiona a las acciones.',
    en: 'The 2-year Treasury yield reflects what the market expects the Fed to do. If it rises fast compared with its 6-month average, money gets more expensive and that weighs on stocks.',
  },
  '30Y': {
    es: 'La tasa del bono a 30 años es el costo del dinero a largo plazo. Cuando sube, las acciones compiten con un bono que paga más y sus valuaciones tienden a bajar.',
    en: 'The 30-year bond yield is the long-term cost of money. When it rises, stocks compete with a bond that pays more, and their valuations tend to fall.',
  },
  MG: {
    es: 'Cuánto dinero piden prestado los inversionistas para comprar acciones (deuda de margen, FINRA) comparado con el tamaño de la economía. Mucho apalancamiento es señal de euforia y hace que las caídas sean más violentas cuando se fuerzan ventas.',
    en: 'How much money investors borrow to buy stocks (margin debt, FINRA) compared with the size of the economy. Heavy leverage signals euphoria and makes declines more violent when forced selling kicks in.',
  },
  VIX: {
    es: 'El "índice del miedo": mide cuánta volatilidad espera el mercado para el próximo mes. Funciona al revés: con el VIX muy alto hay pánico, y históricamente esos han sido buenos momentos para comprar, por eso baja el riesgo.',
    en: 'The "fear index": it measures how much volatility the market expects over the next month. It works in reverse: a very high VIX means panic, and historically those have been good times to buy, so it lowers the risk.',
  },
  FG: {
    es: 'El índice Fear & Greed de CNN Business, de 0 a 100, combina varias señales del ánimo de los inversionistas, del miedo a la codicia. También funciona al revés: con miedo extremo suele haber oportunidades; con codicia extrema, más riesgo. Fuente: CNN.',
    en: 'CNN Business\'s Fear & Greed index, from 0 to 100, combines several signals of investor mood, from fear to greed. It also works in reverse: extreme fear tends to bring opportunities; extreme greed, more risk. Source: CNN.',
  },
  PIB: {
    es: 'Cuánto creció la economía de EE. UU. en el último año, descontando la inflación. Un crecimiento muy fuerte suele darse en la parte final del ciclo, cuando ya hay presión de inflación y de tasas.',
    en: 'How much the US economy grew over the last year, after inflation. Very strong growth tends to happen late in the cycle, when inflation and rate pressures are already building.',
  },
  MS: {
    es: 'Cuántos meses tardaría en venderse el inventario de casas nuevas al ritmo actual. Cuando se acumulan casas sin vender, suele anticipar una desaceleración de la economía.',
    en: 'How many months it would take to sell the inventory of new homes at the current pace. When unsold homes pile up, it often signals an economic slowdown ahead.',
  },
  HY: {
    es: 'La diferencia de tasa que pagan las empresas con más riesgo de crédito frente al gobierno (aquí, la serie del modelo con bonos Baa). Si se dispara, el crédito se está tensando; si está muy baja, hay complacencia. En los dos casos suma riesgo.',
    en: 'The extra yield riskier companies pay compared with the government (here, the model series built on Baa bonds). If it spikes, credit is under stress; if it is very low, there is complacency. Both add risk.',
  },
  LIQ: {
    es: 'Cuánto dinero circula en la economía (M2) y cuánto está creando la Fed (M0). Cuando la Fed inyecta dinero, resta riesgo; cuando lo retira con fuerza, lo suma.',
    en: 'How much money circulates in the economy (M2) and how much the Fed is creating (M0). When the Fed adds money it lowers risk; when it drains money hard, it adds risk.',
  },
  OIL: {
    es: 'El precio del petróleo comparado con su promedio de 3 años. Un choque de precio encarece casi todo y suele golpear a la economía; un petróleo barato la ayuda.',
    en: 'The oil price compared with its 3-year average. A price shock makes almost everything more expensive and usually hurts the economy; cheap oil helps it.',
  },
};
