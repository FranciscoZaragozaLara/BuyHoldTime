import { computeBhtDrawdowns, maxDrawdown } from './bht-drawdowns';
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
  test('BHT del día del pico y del valle (el último conocido si ese día no hay BHT)', () => {
    const d = monthly(4);
    const r2 = computeBhtDrawdowns(mk(d, [50, 70, null, 40], [100, 120, 90, 80]), '2000-01-01', 'spx')!;
    expect(r2.years[0].peakDate).toBe('2000-02-01');
    expect(r2.years[0].peakBht).toBe(70);
    expect(r2.years[0].troughBht).toBe(40);
    const r3 = computeBhtDrawdowns(mk(d, [50, 70, null, 40], [100, 120, 80, 90]), '2000-01-01', 'spx')!;
    expect(r3.years[0].troughDate).toBe('2000-03-01');
    expect(r3.years[0].troughBht).toBe(70);
  });
  test('año sin caída: 0%; años después de hoy sin datos; el año en curso es parcial', () => {
    expect(r.years[2].ddPct).toBe(0);
    expect(r.years[2].partial).toBe(true);
    expect(r.years[3].ddPct).toBeNull();
    expect(r.years[4].troughDate).toBeNull();
  });
});

describe('Hold completo', () => {
  test('rendimiento a hoy y caída máxima del instrumento desde la fecha (el sistema real lo agrega el servicio)', () => {
    const dates = monthly(5);
    const s = mk(dates, [50, 80, 50, 50, 50], [100, 200, 100, 150, 150]);
    const r = computeBhtDrawdowns(s, '2000-01-01', 'spx')!;
    expect(r.hold.pct).toBeCloseTo(50, 9);
    expect(r.hold.maxDd!.pct).toBeCloseTo(-50, 9);
    expect(r).not.toHaveProperty('trades');
    expect(r).not.toHaveProperty('tranches');
  });

  test('fecha sin precio del instrumento: sin caídas', () => {
    const s = mk(monthly(3), [50, 80, 50], [100, 120, 110]);
    const r = computeBhtDrawdowns(s, '2000-01-01', 'qqq')!;
    expect(r.base.price).toBeNull();
    expect(r.years[0].ddPct).toBeNull();
    expect(r.hold.pct).toBeNull();
  });
});

describe('desde la compra hasta hoy', () => {
  test('caída máxima (pico → valle) y pico máximo con el BHT del día', () => {
    const dates = monthly(6);
    // compra 100; pico 150 (BHT 80); valle 90 (BHT 30); pico final 160 (BHT sin dato ese mes → el anterior)
    const s = mk(dates, [50, 80, 60, 30, 55, null], [100, 150, 120, 90, 130, 160]);
    const r = computeBhtDrawdowns(s, '2000-01-01', 'spx')!;
    expect(r.sinceBuy.maxDd).toMatchObject({
      pct: -40, nominal: -60,
      peak: { date: '2000-02-01', price: 150, bht: 80 }, trough: { date: '2000-04-01', price: 90, bht: 30 },
    });
    expect(r.sinceBuy.maxDd!.vsBasePct).toBeCloseTo(-10, 9);
    expect(r.sinceBuy.maxPeak).toMatchObject({ date: '2000-06-01', price: 160, bht: 55, nominal: 60 });
    expect(r.sinceBuy.maxPeak!.pct).toBeCloseTo(60, 9);
  });
  test('solo subidas: sin caída; sin datos posteriores: nada', () => {
    const up = computeBhtDrawdowns(mk(monthly(3), [50, 50, 50], [100, 110, 120]), '2000-01-01', 'spx')!;
    expect(up.sinceBuy.maxDd).toBeNull();
    expect(up.sinceBuy.maxPeak!.price).toBe(120);
    const one = computeBhtDrawdowns(mk(monthly(1), [50], [100]), '2000-01-01', 'spx')!;
    expect(one.sinceBuy).toEqual({ maxDd: null, maxPeak: null });
  });
});
