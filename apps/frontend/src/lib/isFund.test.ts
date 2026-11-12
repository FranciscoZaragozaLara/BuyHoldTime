import { describe, expect, test } from 'vitest';
import { isFundTicker } from './isFund';

describe('isFundTicker', () => {
  test.each([
    ['SCHD', 'Index', true],
    ['QQQ', 'Index', true],
    ['SMH', 'Technology (Semi)', true], // símbolo conocido aunque el sector diga Technology
    ['XYZ', 'ETF (Dividend)', true],
    ['VOO', null, true],
    ['ABC', 'Mutual Fund', true],
    ['AAPL', 'Technology', false],
    ['JPM', 'Financial', false],
    ['IDXX', 'Healthcare', false], // "idx" en el símbolo no lo vuelve fondo
  ])('%s (%s) → %s', (symbol, sector, expected) => {
    expect(isFundTicker({ symbol, sector })).toBe(expected);
  });

  test('sin ticker: false', () => {
    expect(isFundTicker(null)).toBe(false);
    expect(isFundTicker(undefined)).toBe(false);
  });
});
