import { describe, expect, test } from 'vitest';
import { fairValue, trailingPe, valuationLabel } from './ownValuation';

describe('valuación propia', () => {
  test('P/E: EDGAR primero, luego la cotización; menor a 3 no cuenta', () => {
    expect(trailingPe(100, 5, 30)).toBe(20);
    expect(trailingPe(100, -1, 30)).toBe(30);
    expect(trailingPe(100, null, 2)).toBeNull();
    expect(trailingPe(1, 5, null)).toBeNull(); // 0.2x: dato roto
  });
  test('valor estimado = EPS de los próximos 12 meses × P/E del sector', () => {
    const f = fairValue(5.5, 20, 132)!;
    expect(f.value).toBeCloseTo(110, 6);
    expect(f.diffPct).toBeCloseTo(20, 6);
    expect(fairValue(-1, 20)).toBeNull();
    expect(fairValue(5, null)).toBeNull();
  });
  test('etiqueta', () => {
    expect(valuationLabel(20.5)).toBe('overvalued');
    expect(valuationLabel(20)).toBe('fair');
    expect(valuationLabel(-16)).toBe('undervalued');
    expect(valuationLabel(null)).toBeNull();
  });
});
