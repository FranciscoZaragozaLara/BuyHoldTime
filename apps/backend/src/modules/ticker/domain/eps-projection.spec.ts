import { ANALYST_WEIGHT, consensusPoints, epsProjection, modelProjection, PROJECTION_MODEL } from './eps-projection';
import type { QuarterFundamentals } from './fundamentals-ttm';

// 16 trimestres hasta sep-2026; ingresos y utilidad operativa +10 % anual; utilidad neta = 80 % de la operativa; 10 acciones.
const ends = ['09-30', '06-30', '03-31', '12-31'];
const quarters: QuarterFundamentals[] = Array.from({ length: 16 }, (_, i) => {
  const yrsAgo = Math.floor(i / 4);
  const year = 2026 - yrsAgo - (i % 4 === 3 ? 1 : 0);
  const op = 25 * Math.pow(1.1, -yrsAgo);
  return { date: `${year}-${ends[i % 4]}`, revenue: 100 * Math.pow(1.1, -yrsAgo), operatingIncome: op, netIncome: op * 0.8, eps: (op * 0.8) / 10 };
});
const TODAY = '2026-11-26';
const estimates = { years: ['Dec 2027', 'Dec 2028'], estimates: [{ metric: 'EPS without NRI ($)', values: ['99', '99'] }, { metric: 'EPS ($)', values: ['12', '15'] }] };

describe('modelo propio de EPS', () => {
  test('crecimiento inicial de ingresos y utilidad operativa; se desvanece hacia el largo plazo', () => {
    const m = modelProjection(quarters, TODAY)!;
    expect(m.asOf).toBe('2026-09-30');
    expect(m.base).toBeCloseTo(8, 6);
    expect(m.startGrowth).toBeCloseTo(0.1, 6);
    const y1 = m.at(1) / m.base - 1, y5 = m.at(5) / m.at(4) - 1;
    expect(y1).toBeLessThan(0.1);
    expect(y1).toBeGreaterThan(PROJECTION_MODEL.longRun);
    expect(y5).toBeLessThan(y1);
  });
  test('ganancia única debajo de la línea operativa: la base vuelve a la proporción histórica', () => {
    const q = quarters.map((x, i) => (i < 4 ? { ...x, netIncome: x.operatingIncome! * 1.2, eps: (x.operatingIncome! * 1.2) / 10 } : x));
    expect(modelProjection(q, TODAY)!.base).toBeCloseTo(8, 6); // 12 → 8 (proporción 0.8)
  });
  test('sin 12 meses recientes o con pérdidas: sin modelo', () => {
    expect(modelProjection(quarters, '2027-09-30')).toBeNull();
    expect(modelProjection(quarters.map((x) => ({ ...x, eps: -1 })), TODAY)).toBeNull();
  });
  test('tope de crecimiento', () => {
    const boom = quarters.map((x, i) => ({ ...x, revenue: 100 * Math.pow(3, -Math.floor(i / 4)), operatingIncome: 25 * Math.pow(3, -Math.floor(i / 4)) }));
    expect(modelProjection(boom, TODAY)!.startGrowth).toBe(PROJECTION_MODEL.cap);
  });
});

describe('mezcla con el consenso', () => {
  test('consenso contable "EPS ($)" por cierre fiscal', () => {
    const p = consensusPoints(estimates, '2026-09-30');
    expect(p.map(([h, v]) => [Number(h.toFixed(2)), v])).toEqual([[1.25, 12], [2.25, 15]]);
    expect(consensusPoints(null, '2026-09-30')).toEqual([]);
  });
  test('60 % consenso + 40 % modelo en el cierre de cada año calendario', () => {
    const m = modelProjection(quarters, TODAY)!;
    const r = epsProjection(quarters, TODAY, estimates, '2026-11-20', true)!;
    expect(r.basis).toBe('blend');
    expect(r.analystWeight).toBe(ANALYST_WEIGHT);
    const y2027 = r.years.find((y) => y.calendarYear === 2027)!;
    const h = (Date.parse('2027-12-31') - Date.parse('2026-09-30')) / 864e5 / 365.25;
    expect(y2027.eps).toBeCloseTo(0.6 * 12 + 0.4 * m.at(h), 2);
    expect(r.years.map((y) => y.label)).toEqual(['2026E', '2027E', '2028E', '2029E']);
  });
  test('sin consenso, consenso viejo o ANALYST_BLEND=off: solo el modelo', () => {
    const m = modelProjection(quarters, TODAY)!;
    for (const r of [epsProjection(quarters, TODAY, null, null, true), epsProjection(quarters, TODAY, estimates, '2026-05-01', true), epsProjection(quarters, TODAY, estimates, '2026-11-20', false)]) {
      expect(r!.basis).toBe('model');
      expect(r!.epsNext12m).toBeCloseTo(m.at(1), 2);
    }
  });
  test('sin modelo propio no se publica el consenso solo', () => {
    expect(epsProjection([], TODAY, estimates, '2026-11-20', true)).toBeNull();
  });
});
