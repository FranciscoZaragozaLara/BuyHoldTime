import { describe, expect, it } from 'vitest';
import { cagrFromTotal, yearsBetween } from './cagr';

describe('cagrFromTotal', () => {
  it('anualiza el rendimiento total', () => {
    expect(cagrFromTotal(100, 1)).toBeCloseTo(100, 9);
    expect(cagrFromTotal(21, 2)).toBeCloseTo(10, 9);
    // 2007-06-01 → 2026-11-24: +656.8% del sistema ≈ 10.9% al año
    expect(cagrFromTotal(656.8, yearsBetween('2007-06-01', '2026-11-24'))!).toBeCloseTo(10.95, 1);
  });
  it('null con menos de 1 año o sin dato; pérdida total = −100%', () => {
    expect(cagrFromTotal(8, 0.2)).toBeNull();
    expect(cagrFromTotal(null, 5)).toBeNull();
    expect(cagrFromTotal(-100, 3)).toBe(-100);
  });
});

describe('yearsBetween', () => {
  it('años con 365.25 días', () => {
    expect(yearsBetween('2020-01-01', '2024-01-01')).toBeCloseTo(4, 2);
  });
});
