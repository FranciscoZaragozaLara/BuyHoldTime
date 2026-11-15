import { describe, expect, it } from 'vitest';
import { peakGainPct, peakSinceMap } from './peakSince';

describe('peakSince', () => {
  const rows = [
    { date: '2026-01-02', spx: 100, tqqq: null }, { date: '2026-01-05', spx: 120, tqqq: 10 },
    { date: '2026-01-06', spx: 90, tqqq: 12 }, { date: '2026-01-07', spx: 120, tqqq: 8 }, { date: '2026-01-08', spx: 110, tqqq: 9 },
  ];
  it('máximo desde cada fecha hasta hoy, con su fecha (empate: la más temprana)', () => {
    const m = peakSinceMap(rows, 'spx');
    expect(m.get('2026-01-02')).toEqual({ value: 120, date: '2026-01-05' });
    expect(m.get('2026-01-06')).toEqual({ value: 120, date: '2026-01-07' });
    expect(m.get('2026-01-08')).toEqual({ value: 110, date: '2026-01-08' });
  });
  it('fechas sin dato no tienen pico; orden de entrada indiferente', () => {
    const m = peakSinceMap([...rows].reverse(), 'tqqq');
    expect(m.has('2026-01-02')).toBe(false);
    expect(m.get('2026-01-05')).toEqual({ value: 12, date: '2026-01-06' });
  });
  it('% al pico', () => {
    expect(peakGainPct(100, { value: 125, date: 'x' })).toBeCloseTo(25);
    expect(peakGainPct(null, { value: 1, date: 'x' })).toBeNull();
  });
});
