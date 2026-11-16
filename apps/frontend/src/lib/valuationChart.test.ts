import { describe, expect, it } from 'vitest';
import { buildValuationChart, monthlyOpportunityMarkers, type DailyValuation, type MonthlyRow } from './valuationChart';

const monthly: MonthlyRow[] = [
  { date: '1989-11', sp500Price: 340, peRatio: 14, shillerPe: 17 },
  { date: '1989-12', sp500Price: 350, peRatio: 14.5, shillerPe: 17.5 },
  { date: '1990-01', sp500Price: 330, peRatio: 13.9, shillerPe: 17.1 },
];

describe('valuationChart', () => {
  it('sin serie diaria: puntos mensuales con EMA aproximada en meses (comportamiento previo)', () => {
    const p = buildValuationChart(monthly, null);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01']);
    expect(p[0].sp500PriceMa50).toBe(340);
    expect(p[1].sp500PriceMa50).toBeCloseTo(340 + 10 * (2 / 3.4), 2);
    expect(p.every((x) => !x.daily)).toBe(true);
  });
  it('híbrida: mensual antes del primer día diario, diaria después; EMA continua', () => {
    const daily: DailyValuation = { dates: ['1990-01-01', '1990-01-02', '1990-01-03'], spx: [null, 353.4, 355.67], pe: [null, 15.1, 15.2], cape: [17.9, 17.95, 18.0], bht: [null, 52.3, 71] };
    const p = buildValuationChart(monthly, daily);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01', '1990-01-02', '1990-01-03']);
    expect(p[2]).toMatchObject({ daily: true, shillerPe: 17.9, sp500Price: undefined, sp500PriceMa50: undefined });
    const e50Dec = p[1].sp500PriceMa50!;
    expect(p[3].sp500PriceMa50).toBeCloseTo(e50Dec + (353.4 - e50Dec) * (2 / 51), 1); // sembrada con el mensual
    expect(Math.abs(p[3].sp500PriceMa200! - p[1].sp500PriceMa200!)).toBeLessThan(1);
    expect(p.map((x) => x.bht)).toEqual([undefined, undefined, undefined, 52.3, 71]); // BHT del día solo en el tramo diario
  });
  it('marcadores: como mucho uno por mes, con el último día del mes', () => {
    const dates: string[] = []; const spx: number[] = [];
    for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10); dates.push(d); spx.push(i < 60 ? 100 + i : 160 - (i - 60) * 2); }
    const p = buildValuationChart([], { dates, spx, pe: spx.map(() => null), cape: spx.map(() => null) });
    const mk = monthlyOpportunityMarkers(p);
    const months = mk.map((x) => x.time.slice(0, 7));
    expect(new Set(months).size).toBe(months.length);
    for (const x of mk) expect(p.filter((q) => q.time.slice(0, 7) === x.time.slice(0, 7)).pop()!.time).toBe(x.time);
  });
});
