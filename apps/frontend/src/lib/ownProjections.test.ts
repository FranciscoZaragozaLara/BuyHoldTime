import { describe, expect, test } from 'vitest';
import { epsTtm, ownGrowth, ownProjections, OWN_GROWTH } from './ownProjections';

// 16 trimestres (dic-2025 hacia atrás): EPS de 12 meses 1.00 con +10 % anual; ingresos de 12 meses 100 con +20 % anual.
const ends = ['12-31', '09-30', '06-30', '03-31'];
const quarters = Array.from({ length: 16 }, (_, i) => {
  const yrsAgo = Math.floor(i / 4);
  return { date: `${2025 - yrsAgo}-${ends[i % 4]}`, eps: Math.pow(1.1, -yrsAgo) / 4, revenue: (100 * Math.pow(1.2, -yrsAgo)) / 4 };
});

describe('proyección propia de EPS (sin estimados de analistas)', () => {
  test('crecimiento: promedio de EPS y de ingresos a 3 años, acotado', () => {
    const g = ownGrowth(quarters);
    expect(g.basis).toBe('history');
    expect(g.years).toBe(3);
    expect(g.epsCagr!).toBeCloseTo(0.1, 6);
    expect(g.revCagr!).toBeCloseTo(0.2, 6);
    expect(g.rate).toBeCloseTo(0.15, 6);
  });
  test('tope de 20 % y piso de 0 %', () => {
    const boom = quarters.map((q, i) => ({ ...q, eps: Math.pow(2, -Math.floor(i / 4)), revenue: null }));
    expect(ownGrowth(boom).rate).toBe(OWN_GROWTH.max);
    const fall = quarters.map((q, i) => ({ ...q, eps: Math.pow(1.3, Math.floor(i / 4)), revenue: null }));
    expect(ownGrowth(fall).rate).toBe(OWN_GROWTH.min);
  });
  test('sin historia: 6 %', () => {
    expect(ownGrowth([]).basis).toBe('default');
    expect(ownGrowth(quarters.slice(0, 5)).rate).toBe(OWN_GROWTH.fallback);
  });
  test('EPS de 12 meses y proyección por año calendario', () => {
    expect(epsTtm(quarters, '2026-03-15')!.eps).toBeCloseTo(1, 6);
    expect(epsTtm(quarters, '2026-11-26')).toBeNull(); // último trimestre (dic-2025) con más de 200 días
    const { projections } = ownProjections(quarters, '2026-03-15');
    expect(projections.map((p) => p.label)).toEqual(['2026E', '2027E', '2028E', '2029E']);
    expect(projections[0].epsBaseTtm).toBeCloseTo(1.15, 2); // un año después de dic-2025
    expect(projections[0].epsBaseFwd).toBeCloseTo(1.32, 2);
  });
  test('respaldo con el EPS de la cotización; sin base positiva no hay proyección', () => {
    expect(ownProjections([], '2026-11-26', 5).projections[0]).toMatchObject({ calendarYear: 2026, label: '2026E' });
    expect(ownProjections([], '2026-11-26', -1).projections).toEqual([]);
    expect(ownProjections(null, '2026-11-26').projections).toEqual([]);
  });
});
