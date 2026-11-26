import { perfRefs, priceLevels, walk, type Close } from './price-levels';

const rows = (xs: Array<[string, number]>): Close[] => xs.map(([date, close]) => ({ date, close }));

describe('niveles de precio de la lista', () => {
  test('máximo histórico y piso de la última corrección (≥ 10%)', () => {
    const r = rows([['2025-01-02', 100], ['2025-02-03', 120], ['2025-03-03', 100], ['2025-04-01', 95], ['2025-05-01', 125], ['2025-06-02', 118]]);
    const s = walk(r);
    expect([s.ath, s.athDate]).toEqual([125, '2025-05-01']);
    expect([s.bottom, s.bottomDate]).toEqual([95, '2025-04-01']); // corrección 120 → 95 (−20.8%), cerrada en 125
    const lv = priceLevels(s, perfRefs(r, '2025-06-03'), { price: 115, date: '2025-06-03' }, '2025-06-02')!;
    expect(lv.fromAth).toBeCloseTo(-8, 6);
    expect(lv.fromBottom).toBeCloseTo((115 / 95 - 1) * 100, 6);
    // el precio en vivo de −10% abre una corrección nueva: su mínimo es el piso
    const lv2 = priceLevels(walk(r), perfRefs(r, '2025-06-03'), { price: 110, date: '2025-06-03' }, '2025-06-02')!;
    expect([lv2.bottom, lv2.bottomDate, lv2.fromBottom]).toEqual([110, '2025-06-03', 0]);
  });
  test('caídas menores a 10% no cuentan como piso', () => {
    const s = walk(rows([['2025-01-02', 100], ['2025-01-03', 92], ['2025-01-06', 105]]));
    expect(s.bottom).toBeNull();
  });
  test('un máximo nuevo en vivo actualiza el ATH a hoy', () => {
    const r = rows([['2025-01-02', 100], ['2025-01-03', 101]]);
    const lv = priceLevels(walk(r), perfRefs(r, '2025-01-06'), { price: 103, date: '2025-01-06' }, '2025-01-03')!;
    expect([lv.ath, lv.athDate, lv.fromAth]).toEqual([103, '2025-01-06', 0]);
  });
  test('rendimientos con el último cierre en o antes de la fecha; null si la historia no llega', () => {
    const r = rows([['2024-12-31', 80], ['2025-05-30', 90], ['2025-06-02', 95]]);
    const refs = perfRefs(r, '2025-07-01');
    expect(refs).toEqual({ m1: 90, ytd: 80, y1: null, y5: null }); // 1-jun cae en domingo: cierre del 30-may
    const lv = priceLevels(walk(r), refs, { price: 100, date: '2025-07-01' }, '2025-06-02')!;
    expect(lv.perf1M).toBeCloseTo((100 / 90 - 1) * 100, 6);
    expect(lv.perfYTD).toBeCloseTo(25, 6);
    expect(lv.perf1Y).toBeNull();
  });
});
