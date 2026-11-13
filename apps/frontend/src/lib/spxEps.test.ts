import { describe, expect, it } from 'vitest';
import { buildEpsSchedule, epsAt, epsAvailableDate } from './spxEps';

describe('spxEps registrado', () => {
  it('regla de publicación (igual que BackTesting/shiller_eps.py)', () => {
    expect(epsAvailableDate('2026-06-30')).toBe('2026-10-03');
    expect(epsAvailableDate('2026-04-30')).toBe('2026-10-03');
    expect(epsAvailableDate('2026-09-30')).toBe('2027-01-03');
    expect(epsAvailableDate('2026-12-31')).toBe('2027-04-03');
  });
  it('EPS del último mes publicado a cada fecha', () => {
    const s = buildEpsSchedule(new Map([['2026-03-31', 261.7], ['2026-06-30', 295.4], ['2026-09-30', 310], ['2025-12-31', 240.6]]));
    expect(epsAt(s, '2026-11-13')).toEqual({ month: '2026-06-30', eps: 295.4 });
    expect(epsAt(s, '2026-06-30')).toEqual({ month: '2025-12-31', eps: 240.6 });
    expect(epsAt(s, '2027-01-03')).toEqual({ month: '2026-09-30', eps: 310 });
    expect(epsAt(s, '2025-01-01')).toBeNull();
    expect(epsAt(buildEpsSchedule(undefined), '2026-11-13')).toBeNull();
  });
});
