import { describe, expect, it } from 'vitest';
import { formatPartValue, HOME_PART_GROUPS, indicatorsHref } from './homeThermo';

describe('homeThermo', () => {
  it('agrupa los 12 componentes del termómetro, sin repetir', () => {
    const keys = HOME_PART_GROUPS.flatMap((g) => g.parts.map((p) => p.key));
    expect(keys.sort()).toEqual(['30Y', 'CAPE', 'CORE', 'CPI', 'FG', 'FWD', 'MG', 'MS', 'PIB', 'RATIO', 'VIX', 'Y2M']);
  });
  it('formatos y enlaces', () => {
    expect(formatPartValue('CAPE', 39.808)).toBe('39.81x');
    expect(formatPartValue('RATIO', 1.08502)).toBe('1.085x');
    expect(formatPartValue('CPI', 4.0805)).toBe('4.08%');
    expect(formatPartValue('FG', 38.6)).toBe('39');
    expect(formatPartValue('MS', 8.4)).toBe('8.4');
    expect(indicatorsHref('es', 'comp-rates')).toBe('/es/indicators#comp-rates');
    expect(indicatorsHref('en')).toBe('/en/indicators');
  });
});
