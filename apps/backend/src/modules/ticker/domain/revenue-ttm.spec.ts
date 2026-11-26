import { revenueTtm, type QuarterRevenue } from './revenue-ttm';

const q = (xs: Array<[string, number | null]>): QuarterRevenue[] => xs.map(([date, revenue]) => ({ date, revenue }));
const EIGHT = q([['2026-09-30', 120], ['2026-06-30', 110], ['2026-03-31', 100], ['2025-12-31', 90],
  ['2025-09-30', 100], ['2025-06-30', 90], ['2025-03-31', 80], ['2024-12-31', 70]]);

describe('ingresos TTM de la lista', () => {
  test('suma los 4 trimestres más recientes y crece contra los 4 anteriores', () => {
    const r = revenueTtm([...EIGHT].reverse(), '2026-11-26')!;
    expect(r.ttm).toBe(420);
    expect(r.lastQuarter).toBe('2026-09-30');
    expect(r.yoy).toBeCloseTo((420 / 340 - 1) * 100, 6);
  });
  test('con solo 4 trimestres hay TTM pero no crecimiento', () => {
    expect(revenueTtm(EIGHT.slice(0, 4), '2026-11-26')).toEqual({ ttm: 420, lastQuarter: '2026-09-30', yoy: null });
  });
  test('un hueco entre los 4 recientes anula el TTM; uno entre el 4.º y el 8.º solo el crecimiento', () => {
    expect(revenueTtm(EIGHT.filter((x) => x.date !== '2026-03-31'), '2026-11-26')).toBeNull();
    expect(revenueTtm(EIGHT.filter((x) => x.date !== '2025-06-30'), '2026-11-26')!.yoy).toBeNull();
  });
  test('serie vieja (último trimestre de hace más de ~6 meses) o con ingresos faltantes → null', () => {
    expect(revenueTtm(EIGHT, '2027-06-30')).toBeNull();
    expect(revenueTtm(q([['2026-09-30', 1], ['2026-06-30', null], ['2026-03-31', 1], ['2025-12-31', 1]]), '2026-11-26')).toBeNull();
  });
  test('fechas repetidas cuentan una vez', () => {
    expect(revenueTtm([...EIGHT.slice(0, 4), EIGHT[0]], '2026-11-26')!.ttm).toBe(420);
  });
});
