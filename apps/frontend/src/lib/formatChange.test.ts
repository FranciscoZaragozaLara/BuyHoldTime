import { describe, expect, it } from 'vitest';
import { changeBadgeType, fearGreedLabel, formatChangePct } from './formatChange';

describe('formatChangePct', () => {
  it('2 decimales con signo', () => {
    expect(formatChangePct(-0.999842)).toBe('-1.00%');
    expect(formatChangePct(0.354036)).toBe('+0.35%');
    expect(formatChangePct(-0.004)).toBe('0.00%');
    expect(formatChangePct(null)).toBe('—');
    expect(formatChangePct(NaN)).toBe('—');
  });
});

describe('changeBadgeType', () => {
  it('color por dirección', () => {
    expect(changeBadgeType(-2.05)).toBe('error');
    expect(changeBadgeType(0.35)).toBe('success');
    expect(changeBadgeType(0.001)).toBe('info');
    expect(changeBadgeType(undefined)).toBe('info');
  });
});

describe('fearGreedLabel', () => {
  it('bandas de CNN', () => {
    expect([10, 25, 37.46, 50, 62, 80].map(fearGreedLabel)).toEqual(['extremeFear', 'fear', 'fear', 'neutral', 'greed', 'extremeGreed']);
  });
});
