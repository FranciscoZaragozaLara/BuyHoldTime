import { describe, expect, it } from 'vitest';
import { gaugeAngle, gaugeArc, gaugePolar, gaugeSweep } from './bhtGauge';

describe('bhtGauge', () => {
  it('recorre 180° de 0 a 100 con arcos por banda', () => {
    expect(gaugeSweep(0)).toBe(0);
    expect(gaugeSweep(40)).toBe(28);
    expect(gaugeSweep(50)).toBe(71);
    expect(gaugeSweep(100)).toBe(180);
    expect(gaugeSweep(-5)).toBe(0);
    expect(gaugeSweep(120)).toBe(180);
    expect(gaugeAngle(0)).toBe(180);
  });
  it('coordenadas y trazo', () => {
    const [x, y] = gaugePolar(90, 80);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(24);
    expect(gaugeArc(0, 40)).toMatch(/^M [\d.]+ [\d.]+ A 80 80 0 0 1 [\d.]+ [\d.]+$/);
  });
});
