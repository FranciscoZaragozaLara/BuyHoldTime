import { getLiqBonus, PriceMap } from './thermo-history';

// Bonus simétrico M2/M0: tailwind −10, bazuca −20, headwind +10.
// Prioridad: bazuca > headwind > tailwind.
function mkMap(rows: Array<[string, number]>): PriceMap {
  return new Map(rows.map(([d, v]) => [d, v]));
}
// Primeros de mes desde 2022-01 en 100 salvo overrides (los overrides sí se agregan).
function m2flat(over: Record<string, number>): PriceMap {
  const rows: Array<[string, number]> = [];
  for (let m = 0; m < 42; m++) {
    const d = new Date(2022, 0 + m, 1);
    const k = d.toISOString().slice(0, 10);
    rows.push([k, over[k] ?? 100]);
  }
  for (const [k, v] of Object.entries(over)) {
    if (!rows.some(([rk]) => rk === k)) rows.push([k, v]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return mkMap(rows);
}
const M0FLAT = m2flat({});

describe('getLiqBonus', () => {
  test('tailwind: M2 +5.9% y acelerando con M0 positivo => −10', () => {
    const m2 = m2flat({ '2024-03-01': 100, '2024-06-01': 102, '2025-03-01': 105, '2025-06-01': 108 });
    const m0 = m2flat({ '2025-03-01': 100, '2025-06-01': 102 });
    const r = getLiqBonus(m2, m0, '2025-06-15');
    expect(r.bonus).toBe(-10);
    expect(r.yoy).toBeCloseTo(5.88, 1);
  });
  test('veto M0: M2 acelerando pero M0 plano => 0', () => {
    const m2 = m2flat({ '2024-03-01': 100, '2024-06-01': 102, '2025-03-01': 105, '2025-06-01': 108 });
    const r = getLiqBonus(m2, M0FLAT, '2025-06-15');
    expect(r.bonus).toBe(0);
  });
  test('yoy3 sin overflow: 31 jul compara contra abril, no 1 may', () => {
    const m2 = m2flat({ '2025-05-01': 94, '2025-07-01': 100, '2026-04-01': 100, '2026-07-01': 106 });
    const m0 = m2flat({ '2026-04-01': 100, '2026-07-01': 102 });
    const r = getLiqBonus(m2, m0, '2026-07-31');
    expect(r.yoy).toBeGreaterThan(4);
    expect(r.m0d3).toBeGreaterThan(0);
    expect(r.bonus).toBe(-10);
  });
  test('veto M0: M2 acelerando pero M0 cayendo => 0', () => {
    const m2 = m2flat({ '2024-03-01': 100, '2024-06-01': 102, '2025-03-01': 105, '2025-06-01': 108 });
    const m0 = m2flat({ '2025-03-01': 100, '2025-06-01': 94 });
    const r = getLiqBonus(m2, m0, '2025-06-15');
    expect(r.yoy).toBeGreaterThan(4);
    expect(r.m0d3).toBeLessThan(0);
    expect(r.bonus).toBe(0);
  });
  test('bazuca: M0 Δ3M +6% con M2 +9% => −20 (gana a headwind)', () => {
    const m2 = m2flat({ '2023-07-01': 90, '2024-06-01': 100, '2024-07-01': 108, '2025-06-01': 109 });
    const m0 = m2flat({ '2025-03-01': 100, '2025-06-01': 106 });
    const r = getLiqBonus(m2, m0, '2025-06-15');
    expect(r.bonus).toBe(-20);
    expect(r.drop).toBeGreaterThanOrEqual(50);
  });
  test('headwind: caída ~60% del pico sin bazuca => +10 (gana a tailwind)', () => {
    const m2 = m2flat({ '2023-10-01': 90, '2024-06-01': 100, '2024-10-01': 101.4, '2025-06-01': 105 });
    const r = getLiqBonus(m2, M0FLAT, '2025-06-15');
    expect(r.bonus).toBe(10);
  });
  test('headwind v2 con CPI en máximos => +10', () => {
    const m2 = m2flat({ '2023-10-01': 90, '2024-06-01': 100, '2024-10-01': 101.4, '2025-06-01': 105 });
    const cpi = m2flat({ '2024-12-01': 100.5, '2025-01-01': 101, '2025-02-01': 102, '2025-03-01': 103, '2025-04-01': 104.5, '2025-05-01': 106, '2025-06-01': 107 });
    const r = getLiqBonus(m2, M0FLAT, '2025-06-15', cpi);
    expect(r.bonus).toBe(10);
  });
  test('headwind v2 con CPI cediendo => 0', () => {
    const m2 = m2flat({ '2023-10-01': 90, '2024-06-01': 100, '2024-10-01': 101.4, '2025-06-01': 105 });
    const cpi = m2flat({ '2024-06-01': 100, '2024-12-01': 109, '2025-06-01': 107 });
    const r = getLiqBonus(m2, M0FLAT, '2025-06-15', cpi);
    expect(r.bonus).toBe(0);
  });
  test('megabazuca: M0 Δ3M +35% con M2 +9% => −25', () => {
    const m2 = m2flat({ '2024-06-01': 100, '2025-06-01': 109 });
    const m0 = m2flat({ '2025-03-01': 100, '2025-06-01': 135 });
    const r = getLiqBonus(m2, m0, '2025-06-15');
    expect(r.bonus).toBe(-25);
  });
  test('quieto: M2 +5.5% pero desacelerando => 0', () => {
    const m2 = m2flat({ '2024-03-01': 99, '2024-06-01': 100, '2025-03-01': 105, '2025-06-01': 105.5 });
    const r = getLiqBonus(m2, M0FLAT, '2025-06-15');
    expect(r.bonus).toBe(0);
  });
  test('sin datos => 0', () => {
    expect(getLiqBonus(new Map(), new Map(), '2025-06-15').bonus).toBe(0);
    expect(getLiqBonus(undefined, undefined, '2025-06-15').bonus).toBe(0);
  });
});
