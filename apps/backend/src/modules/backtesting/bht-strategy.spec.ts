import { computeBhtStrategy, type StrategySeries } from './bht-strategy';

// Serie sintética: un día por mes desde 2000 (fechas reales para los cálculos por años).
function series(bht: number[], spx: number[]): StrategySeries {
  const dates = bht.map((_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`);
  return { dates, bht, px: { spx, qqq: spx.map(() => null), tqqq: spx.map(() => null) } };
}

describe('computeBhtStrategy', () => {
  // 8 años: BHT 63 los primeros 2 años y luego sube; precio +1 por mes.
  const n = 96;
  const bht = Array.from({ length: n }, (_, k) => (k < 24 ? 63 : k < 48 ? 74 : k < 60 ? 80 : 90));
  const spx = Array.from({ length: n }, (_, k) => 100 + k);
  const s = series(bht, spx);

  test('rango ±2 y frecuencia', () => {
    const r = computeBhtStrategy(s, '2000-01-01', 'spx')!;
    expect(r.range).toEqual([61, 65]);
    expect(r.frequency.all).toEqual({ count: 24, total: 96, pct: 25 });
    expect(r.frequency.last5y.count).toBe(0); // los últimos 5 años no tienen BHT 61–65
  });

  test('rendimiento promedio a 1 año y precio nominal proyectado', () => {
    const r = computeBhtStrategy(s, '2000-01-01', 'spx')!;
    const y1 = r.perf.find((p) => p.years === 1)!;
    // cada muestra k (0..23) compara con k+12: (112+k)/(100+k) - 1
    const exp = Array.from({ length: 24 }, (_, k) => ((112 + k) / (100 + k) - 1) * 100);
    expect(y1.n).toBe(24);
    expect(y1.avgPct!).toBeCloseTo(exp.reduce((a, b) => a + b) / 24, 6);
    expect(y1.nominal!).toBeCloseTo(100 * (1 + y1.avgPct! / 100), 6);
    expect(y1.targetDate).toBe('2001-01-01');
  });

  test('pico dentro de 5 años: solo muestras con ventana completa', () => {
    const r = computeBhtStrategy(s, '2000-01-01', 'spx')!;
    expect(r.peak.n).toBe(24); // 2000-01 .. 2001-12 tienen 5 años completos antes de 2007-12
    expect(r.peak.avgDays!).toBeGreaterThan(1800);
  });

  test('tramos: escalera 72/77/82/87 con ≥15 días entre ventas; sin vender se valúa a hoy', () => {
    const r = computeBhtStrategy(s, '2000-01-01', 'spx')!;
    // datos mensuales: 72 en 2002-01, 77 en 2004-01, 82 en 2005-01 y 87 un mes después (15 días de espera)
    expect(r.tranches.actual.map((a) => [a.date, a.threshold])).toEqual([['2002-01-01', 72], ['2004-01-01', 77], ['2005-01-01', 82], ['2005-02-01', 87]]);
    expect(r.tranches.actual[0].pct).toBeCloseTo(24, 6); // 124/100
    expect([r.tranches.actual[2].bhtPrev, r.tranches.actual[2].bhtHit]).toEqual([80, 90]);
    expect(r.tranches.holdPct).toBeCloseTo(95, 6); // 195/100
    expect(r.tranches.strategyPct).toBeCloseTo((24 + 48 + 60 + 61) / 4, 6);
    const t = computeBhtStrategy(series([63, 74, 74], [100, 110, 120]), '2000-01-01', 'spx')!;
    expect(t.tranches.soldCount).toBe(1);
    expect(t.tranches.strategyPct).toBeCloseTo((10 + 20 * 3) / 4, 6); // 3 tramos a precio de hoy
  });

  test('salto a 90 no vende todo el mismo día: un tramo por cada 15 días mientras siga arriba', () => {
    const dates = ['2021-05-28', '2021-06-01', '2021-06-08', '2021-06-16', '2021-07-01', '2021-07-16', '2021-08-02'];
    const bhtD = [58.9, 90.3, 90.5, 90.1, 89, 88, 88];
    const px = [10, 11, 12, 13, 14, 15, 16];
    const st = { dates, bht: bhtD, px: { spx: px, qqq: px.map(() => null), tqqq: px.map(() => null) } };
    const r = computeBhtStrategy(st, '2021-05-28', 'spx')!;
    expect(r.tranches.actual.map((a) => [a.date, a.threshold])).toEqual([['2021-06-01', 72], ['2021-06-16', 77], ['2021-07-01', 82], ['2021-07-16', 87]]);
  });

  test('memoria: si baja de 62 tras vender, la siguiente venta vuelve a exigir 72', () => {
    const dates = ['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01', '2020-05-01', '2020-06-01'];
    const bhtD = [50, 90, 50, 74, 76, 78];
    const px = [10, 11, 12, 13, 14, 15];
    const st = { dates, bht: bhtD, px: { spx: px, qqq: px.map(() => null), tqqq: px.map(() => null) } };
    const r = computeBhtStrategy(st, '2020-01-01', 'spx')!;
    // vende a 90 (escalón 72), baja a 50 (reinicia), vuelve a vender al llegar a 74 (escalón 72) y luego 77 con 78
    expect(r.tranches.actual.map((a) => [a.date, a.threshold])).toEqual([['2020-02-01', 72], ['2020-04-01', 72], ['2020-06-01', 77], [null, null]]);
  });

  test('esperado por tramo según el rango', () => {
    const r = computeBhtStrategy(s, '2000-06-01', 'spx')!;
    const e72 = r.tranches.expected[0];
    expect(e72.tranche).toBe(1);
    expect(e72.n).toBe(24);
    expect(e72.reachedPct).toBe(100);
  });

  test('fecha sin dato usa el día anterior; sin precio da nulos', () => {
    const r = computeBhtStrategy(s, '2000-01-15', 'qqq')!;
    expect(r.date).toBe('2000-01-01');
    expect(r.base.price).toBeNull();
    expect(r.perf[0].avgPct).toBeNull();
  });
});
