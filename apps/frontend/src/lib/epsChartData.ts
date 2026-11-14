// Datos de la gráfica de EPS (EpsHistoryChart): series anual y trimestral por AÑO CALENDARIO SOLAR,
// precios de cierre, P/E y proyecciones del Escenario Mix (mismas reglas que StockValuationCalculator).
// Funciones puras (antes dentro del componente).
import { solarYearEps } from './solarYearEps';

export interface QuarterData {
  date: string;
  period: string;
  fiscalYear: string;
  revenue?: number;
  netIncome?: number;
  eps: number;
  epsDiluted?: number;
  source?: string;
}

export interface PricePoint {
  date: string;
  close: number;
  adjClose: number;
}

export interface ChartItem {
  key: string;
  label: string;
  subLabel?: string;
  calendarYear: number;
  periodName: string;
  eps: number;
  isProjection: boolean;
  source: string;
  growthPercent: number | null;
  seasonalityWeight?: number;
  stockPrice: number | null;
  priceGrowthPercent: number | null;
  mixPeUsed?: number;
  peRatio: number | null;
}

export interface AnalystProjection { calendarYear: number; label: string; epsBaseTtm: number; epsBaseFwd: number }

/** Parámetros del Escenario Mix: P/E actual, P/E de salida del sector y horizonte. */
export interface MixParams { peMix: number; terminalPe: number; currentYear: number; horizonYears: number }

/** Precio (ajustado) del día más cercano a la fecha. */
export function priceNearDate(prices: PricePoint[] | undefined, targetDateStr: string): number | null {
  if (!prices || prices.length === 0) return null;
  const targetTime = new Date(targetDateStr).getTime();
  let closest = prices[0];
  let minDiff = Math.abs(new Date(closest.date).getTime() - targetTime);
  for (const p of prices) {
    const diff = Math.abs(new Date(p.date).getTime() - targetTime);
    if (diff < minDiff) { minDiff = diff; closest = p; }
  }
  return closest.adjClose || closest.close;
}

/** Último precio (ajustado) del año calendario solar. */
export function priceAtYearEnd(prices: PricePoint[] | undefined, calYear: number): number | null {
  if (!prices || prices.length === 0) return null;
  const inYear = prices.filter((p) => new Date(p.date).getFullYear() === calYear);
  if (!inYear.length) return null;
  inYear.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return inYear[0].adjClose || inYear[0].close;
}

/** P/E Mix (promedio TTM y Fwd) y P/E terminal del sector, con los mismos respaldos que la calculadora. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mixPe(ticker: any, snapshot: any): { peMix: number; terminalPe: number } {
  const rawSnapshotPe = snapshot?.pe ? Number(snapshot.pe) : null;
  const peTtm = rawSnapshotPe && rawSnapshotPe >= 3 ? rawSnapshotPe : (ticker?.pe && ticker.pe > 0 ? ticker.pe : 25);
  const peFwd = snapshot?.forwardPe ? Number(snapshot.forwardPe) : (ticker?.forwardPe && ticker.forwardPe > 0 ? ticker.forwardPe : peTtm * 0.9);
  const terminalPe = ticker?.sectorTerminalPe && ticker.sectorTerminalPe > 0 ? ticker.sectorTerminalPe : 22.0;
  return { peMix: (peTtm + peFwd) / 2, terminalPe };
}

/** Estimaciones anuales de EPS de analistas (fila EPS del snapshot) con su EPS del año siguiente (Fwd). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function analystProjections(snapshot: any): AnalystProjection[] {
  const estimatesObj = snapshot?.analystEstimates;
  if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) return [];
  const years: string[] = estimatesObj.years;
  const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;
  const epsRow = estimatesList.find((e) =>
    e.metric.trim() === 'EPS ($)' || e.metric.trim() === 'EPS without NRI ($)' || e.metric.toLowerCase().includes('eps'));
  if (!epsRow || !epsRow.values) return [];
  const results: AnalystProjection[] = [];
  years.forEach((yStr, idx) => {
    const match = yStr.match(/\d{4}/);
    if (!match) return;
    const calYear = parseInt(match[0], 10);
    const valStr = epsRow.values[idx];
    const epsTtmVal = parseFloat(valStr);
    if (isNaN(epsTtmVal) || valStr === '—') return;
    const nextValStr = epsRow.values[idx + 1];
    const nextEpsVal = parseFloat(nextValStr);
    const epsFwdVal = !isNaN(nextEpsVal) && nextValStr !== '—' ? nextEpsVal : (epsTtmVal > 0 ? epsTtmVal * 1.1 : epsTtmVal);
    results.push({ calendarYear: calYear, label: yStr, epsBaseTtm: epsTtmVal, epsBaseFwd: epsFwdVal });
  });
  return results;
}

/** Precio del Escenario Mix: EPS promedio (base y siguiente) × P/E que converge al terminal en el horizonte. */
export function mixScenarioPrice(calYear: number, epsBaseTtm: number, epsBaseFwd: number, m: MixParams) {
  const yearsDiff = Math.max(1, calYear - m.currentYear);
  const decayRatio = Math.min(1, yearsDiff / m.horizonYears);
  const peFutureMix = m.peMix - (m.peMix - m.terminalPe) * decayRatio;
  const epsMix = (epsBaseTtm + epsBaseFwd) / 2;
  return { projectedPriceMix: parseFloat((epsMix * peFutureMix).toFixed(2)), peFutureMix: parseFloat(peFutureMix.toFixed(1)) };
}

/** Crecimiento vs el punto anterior (EPS y precio), en %, a 1 decimal. Modifica la lista. */
function addGrowth(combined: ChartItem[]): ChartItem[] {
  combined.forEach((item, idx) => {
    if (idx === 0) return;
    const prevEps = combined[idx - 1].eps;
    if (prevEps !== 0) item.growthPercent = parseFloat((((item.eps - prevEps) / Math.abs(prevEps)) * 100).toFixed(1));
    const prevPrice = combined[idx - 1].stockPrice;
    if (item.stockPrice !== null && prevPrice !== null && prevPrice > 0) {
      item.priceGrowthPercent = parseFloat((((item.stockPrice - prevPrice) / prevPrice) * 100).toFixed(1));
    }
  });
  return combined;
}

const quarterName = (q: QuarterData) => q.period || `Q${Math.floor(new Date(q.date).getMonth() / 3) + 1}`;

function groupByCalendarYear(quarters: QuarterData[]): Map<number, QuarterData[]> {
  const m = new Map<number, QuarterData[]>();
  for (const q of quarters) {
    const y = new Date(q.date).getFullYear();
    if (!m.has(y)) m.set(y, []);
    m.get(y)!.push(q);
  }
  return m;
}

/** Serie anual: años solares con ≥3 trimestres (o ya cerrados) + proyecciones Mix posteriores. */
export function buildAnnualEpsSeries(quarters: QuarterData[] | null | undefined, prices: PricePoint[] | undefined, projections: AnalystProjection[], mix: MixParams, locale: string): ChartItem[] {
  const validQuarters = (quarters || []).filter((q) => q && q.date);
  const calMap = groupByCalendarYear(validQuarters);
  const historical: ChartItem[] = [];
  for (const calYear of Array.from(calMap.keys()).sort((a, b) => a - b)) {
    const qList = calMap.get(calYear)!;
    if (!(qList.length >= 3 || calYear < mix.currentYear)) continue;
    // Año en curso incompleto: EPS TTM (últimos 4 trimestres), no la suma parcial
    const { eps: roundedEps, isTtm } = solarYearEps(qList, validQuarters, calYear, mix.currentYear);
    const priceForCalYear = priceAtYearEnd(prices, calYear);
    const peVal = priceForCalYear && roundedEps > 0 ? parseFloat((priceForCalYear / roundedEps).toFixed(1)) : null;
    historical.push({
      key: `cal-${calYear}`,
      label: `${calYear}`,
      subLabel: isTtm
        ? (locale === 'es' ? 'EPS TTM (últimos 4 trimestres)' : 'TTM EPS (last 4 quarters)')
        : (locale === 'es' ? 'Año Calendario Solar' : 'Solar Calendar Year'),
      calendarYear: calYear,
      periodName: `${calYear}`,
      eps: roundedEps,
      isProjection: false,
      source: 'SEC EDGAR',
      growthPercent: null,
      stockPrice: priceForCalYear,
      priceGrowthPercent: null,
      peRatio: peVal,
    });
  }
  const lastHistoricalCalYear = historical.length > 0 ? historical[historical.length - 1].calendarYear : mix.currentYear - 1;
  const future: ChartItem[] = projections
    .filter((est) => est.calendarYear > lastHistoricalCalYear)
    .map((est) => {
      const { projectedPriceMix, peFutureMix } = mixScenarioPrice(est.calendarYear, est.epsBaseTtm, est.epsBaseFwd, mix);
      return {
        key: `cal-est-${est.calendarYear}`,
        label: `${est.calendarYear}`,
        subLabel: locale === 'es' ? 'Proyección Escenario Mix' : 'Mix Scenario Forecast',
        calendarYear: est.calendarYear,
        periodName: `${est.calendarYear}`,
        eps: est.epsBaseTtm,
        isProjection: true,
        source: 'Escenario Mix (Valuation)',
        growthPercent: null,
        stockPrice: projectedPriceMix,
        priceGrowthPercent: null,
        mixPeUsed: peFutureMix,
        peRatio: peFutureMix,
      };
    });
  return addGrowth([...historical, ...future]);
}

/** Serie trimestral: trimestres reales + trimestres futuros repartidos con la estacionalidad del último año completo. */
export function buildQuarterlyEpsSeries(quarters: QuarterData[] | null | undefined, prices: PricePoint[] | undefined, projections: AnalystProjection[], mix: MixParams, locale: string): ChartItem[] {
  const validQuarters = (quarters || []).filter((q) => q && q.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (validQuarters.length === 0) return [];
  const calMap = groupByCalendarYear(validQuarters);
  const fullYears = Array.from(calMap.entries()).filter(([, list]) => list.length === 4).map(([y]) => y).sort((a, b) => b - a);
  const baseYear = fullYears.length > 0 ? fullYears[0] : new Date(validQuarters[validQuarters.length - 1].date).getFullYear();
  const baseQuarters = calMap.get(baseYear) || [];
  const baseSum = baseQuarters.reduce((acc, q) => acc + Math.abs(q.epsDiluted ?? q.eps ?? 0), 0);
  const seasonalityWeights: Record<string, number> = { Q1: 0.25, Q2: 0.25, Q3: 0.25, Q4: 0.25 };
  if (baseSum > 0 && baseQuarters.length === 4) {
    for (const q of baseQuarters) seasonalityWeights[quarterName(q)] = Math.abs(q.epsDiluted ?? q.eps ?? 0) / baseSum;
  }
  const historical: ChartItem[] = validQuarters.map((q) => {
    const calYear = new Date(q.date).getFullYear();
    const pName = quarterName(q);
    const qPrice = priceNearDate(prices, q.date);
    const epsVal = q.epsDiluted ?? q.eps ?? 0;
    const annualizedEps = epsVal * 4;
    const peVal = qPrice && annualizedEps > 0 ? parseFloat((qPrice / annualizedEps).toFixed(1)) : null;
    return {
      key: `q-${calYear}-${pName}`,
      label: `${pName} ${calYear}`,
      subLabel: locale === 'es' ? 'Trimestre Solar Confirmado' : 'Confirmed Solar Quarter',
      calendarYear: calYear,
      periodName: pName,
      eps: parseFloat(epsVal.toFixed(2)),
      isProjection: false,
      source: 'SEC EDGAR',
      growthPercent: null,
      stockPrice: qPrice,
      priceGrowthPercent: null,
      peRatio: peVal,
    };
  });
  const lastHistCalYear = new Date(validQuarters[validQuarters.length - 1].date).getFullYear();
  const future: ChartItem[] = [];
  for (const est of projections.filter((e) => e.calendarYear >= lastHistCalYear)) {
    const { projectedPriceMix, peFutureMix } = mixScenarioPrice(est.calendarYear, est.epsBaseTtm, est.epsBaseFwd, mix);
    for (const p of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const existsInHist = validQuarters.some((q) => new Date(q.date).getFullYear() === est.calendarYear && (q.period === p || `Q${Math.floor(new Date(q.date).getMonth() / 3) + 1}` === p));
      if (existsInHist) continue;
      const weight = seasonalityWeights[p] || 0.25;
      future.push({
        key: `q-est-${est.calendarYear}-${p}`,
        label: `${p} ${est.calendarYear}`,
        subLabel: locale === 'es' ? 'Est. Solar + Mix' : 'Solar Est. + Mix',
        calendarYear: est.calendarYear,
        periodName: p,
        eps: parseFloat((est.epsBaseTtm * weight).toFixed(2)),
        isProjection: true,
        source: 'Escenario Mix (Valuation)',
        growthPercent: null,
        seasonalityWeight: parseFloat((weight * 100).toFixed(1)),
        stockPrice: projectedPriceMix,
        priceGrowthPercent: null,
        mixPeUsed: peFutureMix,
        peRatio: peFutureMix,
      });
    }
  }
  return addGrowth([...historical, ...future]);
}
