import { getOilBonus, getOilRatio, PriceMap } from './thermo-history';

// Bonus simétrico WTI por ratio vs SMA36M: shock +10, caro +5, neutral 0, barato −5, alivio −10.
// Guarda anti-spike: +10 exige mes previo ya caro (≥1.20).
function mkMap(rows: Array<[string, number]>): PriceMap {
  return new Map(rows.map(([d, v]) => [d, v]));
}
// Primeros de mes desde 2022-01 en 100 salvo overrides.
function oilFlat(over: Record<string, number>): PriceMap {
  const rows: Array<[string, number]> = [];
  for (let m = 0; m < 42; m++) {
    const d = new Date(2022, 0 + m, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    rows.push([k, over[k] ?? 100]);
  }
  for (const [k, v] of Object.entries(over)) {
    if (!rows.some(([rk]) => rk === k)) rows.push([k, v]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return mkMap(rows);
}

describe('getOilBonus', () => {
  test('shock: ratio ≥1.45 con previo caro => +10', () => {
    const w = oilFlat({ '2025-05-01': 130, '2025-06-01': 150 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.ratio).toBeGreaterThanOrEqual(1.45);
    expect(r.bonus).toBe(10);
    expect(r.label).toMatch(/shock/);
  });
  test('guarda anti-spike: spike aislado desde barato se topa a +5', () => {
    const w = oilFlat({ '2025-06-01': 150 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.ratio).toBeGreaterThanOrEqual(1.45);
    expect(r.bonus).toBe(5);
    expect(r.label).toMatch(/sin persistencia/);
  });
  test('caro 1.20–1.45 => +5', () => {
    const w = oilFlat({ '2025-06-01': 130 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.ratio).toBeGreaterThanOrEqual(1.20);
    expect(r.ratio).toBeLessThan(1.45);
    expect(r.bonus).toBe(5);
  });
  test('neutral 0.90–1.20 => 0', () => {
    const r = getOilBonus(oilFlat({}), '2025-06-15');
    expect(r.ratio).toBeCloseTo(1, 2);
    expect(r.bonus).toBe(0);
  });
  test('barato 0.70–0.90 => −5', () => {
    const w = oilFlat({ '2025-06-01': 80 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.bonus).toBe(-5);
  });
  test('alivio <0.70 => −10', () => {
    const w = oilFlat({ '2025-06-01': 60 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.bonus).toBe(-10);
    expect(r.label).toMatch(/alivio/);
  });
  test('rebote post-crash no flaggea shock (mata efecto-base YoY)', () => {
    // 30m en 100, crash a 20, rebote a 60 (+200% YoY pero nivel barato).
    const w = oilFlat({ '2025-05-01': 20, '2025-06-01': 60 });
    const r = getOilBonus(w, '2025-06-15');
    expect(r.ratio).toBeLessThan(0.70);
    expect(r.bonus).toBe(-10);
  });
  test('sin dato => 0 fail closed', () => {
    const r = getOilBonus(new Map(), '2025-06-15');
    expect(r.bonus).toBe(0);
    expect(r.ratio).toBeNull();
  });
  test('historia corta (<30 anclas) => 0', () => {
    const r = getOilBonus(mkMap([['2025-01-01', 100], ['2025-06-01', 150]]), '2025-06-15');
    expect(r.bonus).toBe(0);
    expect(r.ratio).toBeNull();
  });
  test('getOilRatio expone precio y ratio', () => {
    const w = oilFlat({ '2025-06-01': 150, '2025-05-01': 130 });
    const { ratio, price } = getOilRatio(w, '2025-06-20');
    expect(price).toBe(150);
    expect(ratio).toBeGreaterThanOrEqual(1.45);
  });
});
