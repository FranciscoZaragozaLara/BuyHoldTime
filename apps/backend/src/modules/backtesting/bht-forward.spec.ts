import { computeFwdDay, fwdReturn } from './bht-forward';
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
