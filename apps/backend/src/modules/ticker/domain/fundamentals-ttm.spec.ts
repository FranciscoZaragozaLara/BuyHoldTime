import { fundamentals, ttmOf, type QuarterFundamentals } from './fundamentals-ttm';

const DATES = ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31'];
const series = (vals: Array<number | null>): Array<[string, number | null]> => vals.map((v, i) => [DATES[i], v]);
const quarters = (rev: Array<number | null>, eps: Array<number | null>, op: Array<number | null>): QuarterFundamentals[] =>
  DATES.map((date, i) => ({ date, revenue: rev[i] ?? null, eps: eps[i] ?? null, operatingIncome: op[i] ?? null }));

describe('TTM de una serie trimestral', () => {
  test('suma los 4 trimestres más recientes y crece contra los 4 anteriores', () => {
    const r = ttmOf(series([120, 110, 100, 90, 100, 90, 80, 70]).reverse(), '2026-11-26')!;
    expect([r.ttm, r.prev, r.lastQuarter]).toEqual([420, 340, '2026-09-30']);
    expect(r.yoy).toBeCloseTo((420 / 340 - 1) * 100, 6);
  });
  test('con solo 4 trimestres hay TTM pero no crecimiento', () => {
    expect(ttmOf(series([120, 110, 100, 90]), '2026-11-26')).toEqual({ ttm: 420, prev: null, yoy: null, lastQuarter: '2026-09-30' });
  });
  test('un hueco entre los 4 recientes anula el TTM; uno entre el 4.º y el 8.º solo el crecimiento', () => {
    const all = series([120, 110, 100, 90, 100, 90, 80, 70]);
    expect(ttmOf(all.filter(([d]) => d !== '2026-03-31'), '2026-11-26')).toBeNull();
    expect(ttmOf(all.filter(([d]) => d !== '2025-06-30'), '2026-11-26')!.yoy).toBeNull();
  });
  test('serie vieja, valores faltantes o fechas repetidas', () => {
    const all = series([120, 110, 100, 90]);
    expect(ttmOf(all, '2027-06-30')).toBeNull();
    expect(ttmOf(series([1, null, 1, 1]), '2026-11-26')).toBeNull();
    expect(ttmOf([...all, all[0]], '2026-11-26')!.ttm).toBe(420);
  });
  test('base ≤ 0 (de pérdida a ganancia): sin %, pero con el valor previo', () => {
    const r = ttmOf(series([1, 1, 1, 1, -1, -1, 0.5, 0.5]), '2026-11-26')!;
    expect([r.ttm, r.prev, r.yoy]).toEqual([4, -1, null]);
  });
});

describe('fundamentales de la lista', () => {
  const q = quarters([100, 100, 100, 100, 80, 80, 80, 80], [2, 2, 2, 2, 1, 1, 1, 1], [25, 25, 25, 25, 16, 16, 16, 16]);
  test('ingresos, EPS, EBIT, margen operativo y P/E contra hace un año', () => {
    const f = fundamentals(q, '2026-11-26', 160, 100)!;
    expect(f.revenue!.yoy).toBeCloseTo(25, 6);
    expect(f.eps!.yoy).toBeCloseTo(100, 6);
    expect(f.ebit!.yoy).toBeCloseTo((100 / 64 - 1) * 100, 6);
    expect(f.margin).toEqual({ now: 25, prev: 20 });
    expect(f.pe!.now).toBeCloseTo(20, 6); // 160 / 8
    expect(f.pe!.prev).toBeCloseTo(25, 6); // 100 / 4
    expect(f.pe!.yoy).toBeCloseTo(-20, 6);
  });
  test('banco (sin EBIT): sin margen, el resto sí', () => {
    const f = fundamentals(quarters([100, 100, 100, 100], [2, 2, 2, 2], []), '2026-11-26', 160, 100)!;
    expect([f.ebit, f.margin, f.pe]).toEqual([null, null, null]); // P/E de hace un año necesita 8 trimestres de EPS
    expect(f.eps!.ttm).toBe(8);
  });
  test('con pérdidas el P/E no se define', () => {
    const f = fundamentals(quarters([1, 1, 1, 1, 1, 1, 1, 1], [-1, 1, 1, 1, 1, 1, 1, 1].map((x) => x * -1), []), '2026-11-26', 10, 10)!;
    expect(f.pe).toBeNull();
  });
  test('P/S con acciones implícitas (utilidad neta ÷ EPS) y rendimiento de utilidades', () => {
    // 10 acciones: utilidad neta 20/trimestre, EPS 2/trimestre; ingresos 100/trimestre → ventas/acción = 40
    const qn = q.map((x, i) => ({ ...x, netIncome: i < 4 ? 20 : 10 }));
    const f = fundamentals(qn, '2026-11-26', 160, 100)!;
    expect(f.ps).toBeCloseTo(4, 6);
    expect(f.earningsYield).toBeCloseTo(5, 6); // 8 / 160
    expect(fundamentals(q, '2026-11-26', 160, 100)!.ps).toBeNull(); // sin utilidad neta
  });
  test('utilidades en otra moneda que el precio (P/E < 3): sin fundamentales', () => {
    expect(fundamentals(q, '2026-11-26', 20, 10)).toBeNull(); // EPS 8 con precio 20 → P/E 2.5
    expect(fundamentals(q, '2026-11-26', null, null)).not.toBeNull(); // sin precio no se puede saber
  });
  test('sin trimestres → null', () => {
    expect(fundamentals([], '2026-11-26', 10, 10)).toBeNull();
  });
});
