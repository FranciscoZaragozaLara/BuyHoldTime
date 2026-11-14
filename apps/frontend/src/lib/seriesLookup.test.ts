import { describe, expect, it } from 'vitest';
import {
  breadthValues, buildObvForce, buildObvMap, cagr, getClosestPrice, getCpiYoY, getRecentPrice, isValidIsoDate,
  marginGdpRatio, monthlyPctLive, perf1Y, perfTotal, periodChange, price1YLater,
} from './seriesLookup';

const m = (o: Record<string, number>) => new Map(Object.entries(o));
const NOW = new Date('2026-11-13T15:00:00Z');

describe('seriesLookup', () => {
  it('fechas inválidas no rompen (dato live basura)', () => {
    expect(isValidIsoDate('<link href')).toBe(false);
    expect(getClosestPrice(m({ '2026-01-02': 1 }), '<link href')).toBeNull();
  });
  it('closest busca hacia atrás; recent hace forward-fill', () => {
    const s = m({ '2026-01-02': 10, '2026-03-31': 30 });
    expect(getClosestPrice(s, '2026-01-05')).toBe(10);
    expect(getClosestPrice(s, '2026-02-15')).toBeNull();
    expect(getRecentPrice(s, '2026-02-15')).toBe(10);
  });
  it('CPI YoY y % mensual', () => {
    const cpi = m({ '2025-10-01': 100, '2026-10-01': 103 });
    expect(getCpiYoY(cpi, '2026-10-20')).toBeCloseTo(3);
    expect(monthlyPctLive(cpi, '2026-10-20', 12)).toBeCloseTo(3);
  });
  it('Margen/PIB y amplitud', () => {
    expect(marginGdpRatio(m({ '2026-09-30': 1_200_000 }), m({ '2026-07-01': 30_000 }), '2026-10-15')).toBeCloseTo(4);
    expect(breadthValues(m({ '2026-11-13': 300 }), m({ '2026-11-13': 100 }), '2026-11-13')).toEqual({ net: 200, ratio: 3 });
    expect(breadthValues(m({ '2026-11-13': 0 }), m({ '2026-11-13': 0 }), '2026-11-13')).toEqual({ net: null, ratio: null });
  });
  it('OBV, fuerza y z-score', () => {
    const closes = new Map<string, number>(); const vols = new Map<string, number>();
    for (let i = 0; i < 25; i++) { const d = `2026-01-${String(i + 1).padStart(2, '0')}`; closes.set(d, 100 + (i % 2 ? 1 : -1) * i); vols.set(d, 1000); }
    const obv = buildObvMap(closes, vols);
    expect(obv.get('2026-01-01')).toBe(0);
    expect(obv.get('2026-01-02')).toBe(1000);
    const { fuerzaMap, obvzMap } = buildObvForce(closes, vols);
    expect(fuerzaMap.size).toBe(6);
    expect(obvzMap.size).toBeGreaterThan(0);
  });
  it('cambio por periodo con precio en vivo hoy', () => {
    const spx = m({ '2026-11-12': 100, '2026-10-13': 90, '2025-11-13': 80 });
    expect(periodChange(spx, '2026-11-13', 'daily', 101, NOW)).toBeCloseTo(1);
    expect(periodChange(spx, '2026-11-13', 'monthly', 99, NOW)).toBeCloseTo(10);
    expect(periodChange(spx, '2026-11-13', 'yearly', 100, NOW)).toBeCloseTo(25);
    expect(periodChange(spx, '2026-11-13', 'daily', null, NOW)).toBeCloseTo(0); // sin live: usa el cierre del 12
  });
  it('rendimientos: 1Y maduro, parcial anualizado, total y CAGR', () => {
    const spx = m({ '2024-11-13': 100, '2025-11-13': 110, '2026-05-13': 120 });
    expect(price1YLater(spx, '2024-11-13', NOW)).toBe(110);
    expect(price1YLater(spx, '2026-05-13', NOW)).toBeNull();
    expect(perf1Y(spx, '2024-11-13', 130, NOW)).toBeCloseTo(10);
    expect(perf1Y(spx, '2026-05-13', 130, NOW)).toBeCloseTo(cagr(spx, '2026-05-13', 130, NOW)!);
    expect(perfTotal(spx, '2024-11-13', 130, NOW)).toBeCloseTo(30);
    expect(perfTotal(spx, '2026-11-13', 130, NOW)).toBeNull(); // sin precio en la fecha
    expect(cagr(spx, '2024-11-13', 121, NOW)).toBeCloseTo(10, 0);
  });
});
