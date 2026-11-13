import { computeFwdDay, fwdReturn, monthlyPartsFromDaily } from './bht-forward';
import { PriceMap } from './thermo-history';

const map = (rows: [string, number][]): PriceMap => new Map(rows);

describe('bht-forward', () => {
  test('solo horizontes maduros', () => {
    const spx = map([['2022-01-03', 100], ['2023-01-03', 110], ['2024-01-03', 121]]);
    // 1Y y 2Y maduros, 3Y/5Y aún no
    expect(fwdReturn(spx, '2022-01-03', 1, '2024-01-03')).toBeCloseTo(10.0, 6);
    expect(fwdReturn(spx, '2022-01-03', 2, '2024-01-03')).toBeCloseTo(21.0, 6);
    expect(fwdReturn(spx, '2022-01-03', 3, '2024-01-03')).toBeNull();
    expect(fwdReturn(spx, '2022-01-03', 5, '2024-01-03')).toBeNull();
    // Sin precio base no hay retorno
    expect(fwdReturn(spx, '2021-01-04', 1, '2024-01-03')).toBeNull();
  });

  test('computeFwdDay por índice', () => {
    const r = computeFwdDay(
      '2022-01-03',
      { spx: map([['2022-01-03', 100], ['2023-01-03', 110]]), ndx: undefined, tqqq: undefined },
      { spx: '2023-01-03', ndx: '2023-01-03', tqqq: '2023-01-03' },
    );
    expect(r.spx).toBe(100);
    expect(r.spxFw[0]).toBeCloseTo(10.0, 6);
    expect(r.spxFw.slice(1)).toEqual([null, null, null]);
    expect(r.ndx).toBeNull();
    expect(r.tqqqFw).toEqual([null, null, null, null]);
  });
});

describe('monthlyPartsFromDaily', () => {
  const p = (score: number) => [{ key: 'CAPE', value: 40, score, weight: 20 }];
  test('toma el último día de cada mes, más reciente primero, limita a n', () => {
    const rows = [
      { date: '2026-09-29', parts: p(60) }, { date: '2026-09-30', parts: p(61) },
      { date: '2026-10-31', parts: p(65) }, { date: '2026-11-13', parts: p(70) }, { date: '2026-11-12', parts: p(69) },
      { date: '2026-08-31', parts: null },
    ];
    const out = monthlyPartsFromDaily(rows, 2);
    expect(out.map((m) => m.date)).toEqual(['2026-11-13', '2026-10-31']);
    expect(out[0].parts.CAPE).toEqual({ value: 40, score: 70, weight: 20 });
    expect(monthlyPartsFromDaily(rows, 12).map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09']);
  });
  test('valores no numéricos → null', () => {
    const out = monthlyPartsFromDaily([{ date: '2026-11-13', parts: [{ key: 'FG', value: 'x', score: null, weight: 10 }] }]);
    expect(out[0].parts.FG).toEqual({ value: null, score: null, weight: 10 });
  });
});
