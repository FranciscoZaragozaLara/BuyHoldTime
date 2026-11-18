import { computeBhtDrawdowns, maxDrawdown, simulateTranches } from './bht-drawdowns';
import type { StrategySeries } from './bht-strategy';

const mk = (dates: string[], bht: (number | null)[], px: (number | null)[]): StrategySeries =>
  ({ dates, bht, px: { spx: px, qqq: px.map(() => null), tqqq: px.map(() => null) } });

// Un día por mes desde 2000.
const monthly = (n: number) => Array.from({ length: n }, (_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`);

describe('maxDrawdown', () => {
  test('caída desde el pico acumulado', () => {
    expect(maxDrawdown(['a', 'b', 'c', 'd'], [1, 2, 1.5, 3])).toEqual({ pct: -25, peakDate: 'b', troughDate: 'c' });
    expect(maxDrawdown(['a', 'b'], [1, 2])!.pct).toBe(0);
  });
});

describe('caída máxima por año', () => {
  // 3 años mensuales: sube a 120 en el año 1 y cae a 90 en el año 2; año 3 sin caída.
  const dates = monthly(36);
  const px = dates.map((_, k) => (k <= 6 ? 100 + k * (20 / 6) : k < 12 ? 120 : k < 18 ? 120 - (k - 11) * 5 : k < 24 ? 90 : 150 + k));
  const s = mk(dates, dates.map(() => 50), px);
  const r = computeBhtDrawdowns(s, '2000-01-01', 'spx')!;

  test('año 2: del pico 120 al valle 90 (-25%), -10% contra la compra', () => {
    const y2 = r.years[1];
    expect(y2.year).toBe(2);
    expect(y2.peakPrice).toBeCloseTo(120, 6);
    expect(y2.troughPrice).toBe(90);
    expect(y2.ddPct).toBeCloseTo(-25, 6);
    expect(y2.vsBasePct).toBeCloseTo(-10, 6);
    expect(y2.troughDate! >= '2001-01-01' && y2.troughDate! <= '2002-01-01').toBe(true);
  });
  test('año sin caída: 0%; años después de hoy sin datos; el año en curso es parcial', () => {
    expect(r.years[2].ddPct).toBe(0);
    expect(r.years[2].partial).toBe(true);
    expect(r.years[3].ddPct).toBeNull();
    expect(r.years[4].troughDate).toBeNull();
  });
});

describe('tramos con el BHT', () => {
  test('salto a 90: vende un tramo cada 15 días (72, 77, 82, 87)', () => {
    const dates = ['2021-05-28', '2021-06-01', '2021-06-08', '2021-06-16', '2021-07-01', '2021-07-16', '2021-08-02'];
    const s = mk(dates, [58.9, 90.3, 90.5, 90.1, 89, 88, 88], [10, 11, 12, 13, 14, 15, 16]);
    const sim = simulateTranches(s, 0, 'spx');
    expect(sim.trades.map((t) => [t.type, t.date, t.level, t.invested])).toEqual([
      ['sell', '2021-06-01', 72, 3], ['sell', '2021-06-16', 77, 2], ['sell', '2021-07-01', 82, 1], ['sell', '2021-07-16', 87, 0],
    ]);
    // todo en efectivo: (11 + 13 + 14 + 15) / 4 / 10
    expect(sim.values[sim.values.length - 1]).toBeCloseTo((11 + 13 + 14 + 15) / 40, 9);
  });

  test('compra con el efectivo al bajar de 60, 55, 50 y 45; memoria de ambas escaleras', () => {
    const dates = monthly(9);
    // vende 2 tramos (74, 78), baja: compra a 58 y a 53; ya no hay efectivo a 48
    const s = mk(dates, [50, 74, 78, 58, 53, 48, 70, 74, 59], [100, 110, 120, 90, 80, 70, 100, 110, 95]);
    const sim = simulateTranches(s, 0, 'spx');
    expect(sim.trades.map((t) => [t.type, t.date, t.level])).toEqual([
      ['sell', '2000-02-01', 72], ['sell', '2000-03-01', 77],
      ['buy', '2000-04-01', 60], ['buy', '2000-05-01', 55],
      // bajó de 62 → venta vuelve a 72; subió de 68 → compra vuelve a 60
      ['sell', '2000-08-01', 72], ['buy', '2000-09-01', 60],
    ]);
    expect(sim.invested).toBe(4);
  });

  test('Hold completo vs Tramos: rendimiento a hoy y caída máxima', () => {
    const dates = monthly(5);
    const s = mk(dates, [50, 80, 50, 50, 50], [100, 200, 100, 150, 150]);
    const r = computeBhtDrawdowns(s, '2000-01-01', 'spx')!;
    expect(r.hold.pct).toBeCloseTo(50, 9);
    expect(r.hold.maxDd!.pct).toBeCloseTo(-50, 9);
    // vende 1 tramo a 200 (+0.5 en efectivo) y lo recompra a 100 en el mes 3 (BHT 50 < 60)
    expect(r.trades.map((t) => t.type)).toEqual(['sell', 'buy']);
    // 3 tramos de 0.0025 u + 0.5/100 u = 0.0125 u × 150 = 1.875 → +87.5%
    expect(r.tranches.pct).toBeCloseTo(87.5, 9);
    expect(r.tranches.invested).toBe(4);
    expect(r.tranches.cashPct).toBe(0);
    expect(r.tranches.maxDd!.pct).toBeGreaterThan(r.hold.maxDd!.pct);
  });

  test('fecha sin precio del instrumento: sin tramos ni caídas', () => {
    const s = mk(monthly(3), [50, 80, 50], [100, 120, 110]);
    const r = computeBhtDrawdowns(s, '2000-01-01', 'qqq')!;
    expect(r.base.price).toBeNull();
    expect(r.trades).toEqual([]);
    expect(r.years[0].ddPct).toBeNull();
    expect(r.hold.pct).toBeNull();
  });
});
