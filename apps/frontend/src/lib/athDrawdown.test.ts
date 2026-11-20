import { describe, expect, it } from 'vitest';
import { athDrawdown, athTone } from './athDrawdown';

const h = new Map([['2026-01-02', 100], ['2026-03-02', 120], ['2026-06-01', 90]]);

describe('athDrawdown', () => {
  it('caída desde el máximo con su fecha, usando el precio en vivo', () => {
    const r = athDrawdown(h, 102)!;
    expect(r.ath).toBe(120);
    expect(r.athDate).toBe('2026-03-02');
    expect(r.pct).toBeCloseTo(-15, 9);
    expect(r.tone).toBe('elevated');
  });
  it('sin precio en vivo usa el último cierre; nuevo máximo = 0%', () => {
    expect(athDrawdown(h, null)!.pct).toBeCloseTo(-25, 9);
    const r = athDrawdown(h, 130, '2026-11-20')!;
    expect(r.pct).toBe(0);
    expect(r.athDate).toBe('2026-11-20');
  });
  it('semáforo: más caída, más rojo; sin datos, null', () => {
    expect([-1, -5, -7, -15, -20, -60].map(athTone)).toEqual(['favorable', 'caution', 'caution', 'elevated', 'risk', 'risk']);
    expect(athDrawdown(new Map(), null)).toBeNull();
  });
  it('ATH de hace más de 5 años: usa el máximo de los últimos 5 años (ATH 5Y)', () => {
    const inv = new Map([['2010-02-11', 1_000_000], ['2022-10-13', 80], ['2024-08-05', 60], ['2026-11-19', 49]]);
    const r = athDrawdown(inv, null)!;
    expect(r.window5y).toBe(true);
    expect(r.ath).toBe(80);
    expect(r.athDate).toBe('2022-10-13');
    expect(r.pct).toBeCloseTo(-38.75, 9);
    expect(athDrawdown(h, 102)!.window5y).toBe(false);
  });
});
