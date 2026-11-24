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

describe('episodios de caída', () => {
  test('cada episodio tiene su propio pico, termina al recuperarlo y no se traslapa; el último puede seguir en curso', () => {
    const d = monthly(12);
    // 100 → 120 (pico) → 90 (−25%) → 125 (recupera; pico nuevo) → 118 (−5.6%, no cuenta) → 130 → 104 (−20%, en curso)
    const px = [100, 120, 90, 110, 125, 118, 130, 117, 104, 110, 112, 115];
    const r = computeBhtDrawdowns(mk(d, d.map((_, k) => 40 + k), px), '2000-01-01', 'spx')!;
    expect(r.minDd).toBe(10);
    expect(r.episodes.map((e) => [e.peakDate, e.troughDate, e.recoveryDate])).toEqual([
      ['2000-02-01', '2000-03-01', '2000-05-01'],
      ['2000-07-01', '2000-09-01', null],
    ]);
    const [e1, e2] = r.episodes;
    expect(e1.ddPct).toBeCloseTo(-25, 9);
    expect(e1.peakVsBasePct).toBeCloseTo(20, 9);
    expect(e1.vsBasePct).toBeCloseTo(-10, 9);
    expect([e1.peakBht, e1.troughBht]).toEqual([41, 42]);
    expect(e1.daysToTrough).toBe(29);
    expect(e1.daysToRecovery).toBe(90);
    expect(e2.ddPct).toBeCloseTo(-20, 9);
    expect(e2.daysToRecovery).toBeNull();
  });

  test('BHT del día del pico y del valle: el último conocido si ese día no hay BHT', () => {
    const d = monthly(4);
    const r = computeBhtDrawdowns(mk(d, [50, 70, null, 40], [100, 120, 80, 90]), '2000-01-01', 'spx')!;
    expect(r.episodes[0].peakBht).toBe(70);
    expect(r.episodes[0].troughBht).toBe(70);
  });

  test('TQQQ cuenta caídas desde 30%; sin caídas suficientes no hay episodios', () => {
    const d = monthly(4);
    const s: StrategySeries = { dates: d, bht: [50, 50, 50, 50], px: { spx: [100, 120, 100, 130], qqq: [100, 120, 100, 130], tqqq: [10, 14, 9, 15] } };
    expect(computeBhtDrawdowns(s, '2000-01-01', 'tqqq')!.episodes.map((e) => Math.round(e.ddPct))).toEqual([-36]);
    expect(computeBhtDrawdowns(s, '2000-01-01', 'tqqq')!.minDd).toBe(30);
    expect(computeBhtDrawdowns(mk(d, [50, 50, 50, 50], [100, 105, 99, 110]), '2000-01-01', 'spx')!.episodes).toEqual([]);
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
    expect(r.episodes).toEqual([]);
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
