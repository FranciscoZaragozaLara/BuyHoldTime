import { closeOneYearAgo, quartersOf } from './get-ticker-details.use-case';

describe('ficha: fundamentales propios', () => {
  test('trimestres de EDGAR: EPS diluido si existe, números o null', () => {
    expect(quartersOf([
      { date: '2026-09-30', revenue: 100, eps: 2.1, epsDiluted: 2, operatingIncome: '25', netIncome: 20 },
      { date: '2026-06-30T00:00:00Z', revenue: null, eps: 1.9 },
      { revenue: 1 },
    ])).toEqual([
      { date: '2026-09-30', revenue: 100, eps: 2, operatingIncome: 25, netIncome: 20 },
      { date: '2026-06-30', revenue: null, eps: 1.9, operatingIncome: null, netIncome: null },
    ]);
    expect(quartersOf(null)).toEqual([]);
  });
  test('cierre de hace un año: el último día con cotización en o antes de la fecha', () => {
    const p = (d: string, close: number) => ({ date: new Date(`${d}T00:00:00Z`), close });
    const prices = [p('2026-11-25', 200), p('2025-11-26', 150), p('2025-11-24', 140), p('2025-11-27', 151)];
    expect(closeOneYearAgo(prices, '2026-11-26')).toBe(150);
    expect(closeOneYearAgo([p('2026-01-02', 1)], '2026-11-26')).toBeNull();
  });
});
