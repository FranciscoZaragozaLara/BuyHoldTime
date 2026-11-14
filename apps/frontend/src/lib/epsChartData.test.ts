import { describe, expect, it } from 'vitest';
import { analystProjections, buildAnnualEpsSeries, buildQuarterlyEpsSeries, mixPe, mixScenarioPrice, priceAtYearEnd, priceNearDate, type QuarterData } from './epsChartData';

const q = (date: string, eps: number, period: string): QuarterData => ({ date, eps, epsDiluted: eps, period, fiscalYear: date.slice(0, 4) });
const prices = [
  { date: '2024-12-30', close: 100, adjClose: 100 }, { date: '2025-06-30', close: 110, adjClose: 110 }, { date: '2025-12-31', close: 120, adjClose: 120 },
];
const quarters = [q('2024-03-31', 1, 'Q1'), q('2024-06-30', 1, 'Q2'), q('2024-09-30', 1, 'Q3'), q('2024-12-31', 2, 'Q4'),
  q('2025-03-31', 1.5, 'Q1'), q('2025-06-30', 1.5, 'Q2'), q('2025-09-30', 1.5, 'Q3'), q('2025-12-31', 2.5, 'Q4')];
const snapshot = { pe: 30, forwardPe: 26, analystEstimates: { years: ['Dec 2026', 'Dec 2027'], estimates: [{ metric: 'EPS ($)', values: ['8', '9'] }] } };
const mix = { ...mixPe({ sectorTerminalPe: 20 }, snapshot), currentYear: 2026, horizonYears: 4 };

describe('epsChartData', () => {
  it('precios: cierre de año y día más cercano', () => {
    expect(priceAtYearEnd(prices, 2025)).toBe(120);
    expect(priceAtYearEnd(prices, 2023)).toBeNull();
    expect(priceNearDate(prices, '2025-07-02')).toBe(110);
  });
  it('proyecciones de analistas y precio Mix', () => {
    const p = analystProjections(snapshot);
    expect(p).toEqual([{ calendarYear: 2026, label: 'Dec 2026', epsBaseTtm: 8, epsBaseFwd: 9 }, { calendarYear: 2027, label: 'Dec 2027', epsBaseTtm: 9, epsBaseFwd: 9.9 }]);
    expect(mix.peMix).toBe(28);
    // 1 año de 4: P/E 28 → 28 − 8·0.25 = 26; EPS mix 8.5 → 221
    expect(mixScenarioPrice(2026, 8, 9, mix)).toEqual({ projectedPriceMix: 221, peFutureMix: 26 });
  });
  it('serie anual: años solares, P/E al cierre, proyección y crecimiento', () => {
    const a = buildAnnualEpsSeries(quarters, prices, analystProjections(snapshot), mix, 'es');
    expect(a.map((x) => [x.label, x.eps, x.isProjection])).toEqual([['2024', 5, false], ['2025', 7, false], ['2026', 8, true], ['2027', 9, true]]);
    expect(a[1]).toMatchObject({ stockPrice: 120, peRatio: 17.1, growthPercent: 40, priceGrowthPercent: 20, subLabel: 'Año Calendario Solar' });
    expect(a[2]).toMatchObject({ stockPrice: 221, mixPeUsed: 26, subLabel: 'Proyección Escenario Mix' });
  });
  it('serie trimestral: estacionalidad del último año completo', () => {
    const s = buildQuarterlyEpsSeries(quarters, prices, analystProjections(snapshot), mix, 'en');
    const est = s.filter((x) => x.isProjection && x.calendarYear === 2026);
    expect(est.map((x) => x.periodName)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    // 2025: 1.5/7 = 21.4% → 8 × 0.214 = 1.71; Q4 2.5/7 → 2.86
    expect(est.map((x) => x.eps)).toEqual([1.71, 1.71, 1.71, 2.86]);
    expect(s[0].subLabel).toBe('Confirmed Solar Quarter');
  });
});
