import { cagr, computeBhtStrategy, matrixBandOf, MATRIX_BAND_LO, type StrategySeries } from './bht-strategy';

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

  test('fecha sin dato usa el día anterior; sin precio da nulos', () => {
    const r = computeBhtStrategy(s, '2000-01-15', 'qqq')!;
    expect(r.date).toBe('2000-01-01');
    expect(r.base.price).toBeNull();
    expect(r.perf[0].avgPct).toBeNull();
  });

  test('ventana de 5 años: promedios solo con días del rango de los últimos 5 años; pico hasta hoy', () => {
    // 8 años mensuales; BHT 63 al inicio y en los últimos 2 años (2006-2007)
    const b = Array.from({ length: 96 }, (_, k) => (k < 24 || k >= 72 ? 63 : 50));
    const p = Array.from({ length: 96 }, (_, k) => 100 + k);
    const st = series(b, p);
    const all = computeBhtStrategy(st, '2007-12-01', 'spx', 'all')!;
    const w5 = computeBhtStrategy(st, '2007-12-01', 'spx', '5y')!;
    expect(w5.window).toBe('5y');
    expect(all.perf[0].n).toBe(24 + 12); // 2000-2001 y 2006 tienen 1 año completo hacia adelante
    expect(w5.perf[0].n).toBe(12); // solo 2006
    expect(w5.perf.find((x) => x.years === 5)!.n).toBe(0);
    expect(all.peak.n).toBe(24);
    expect(w5.peak.n).toBe(24); // ventana parcial hasta hoy
    expect(w5.frequency).toEqual(all.frequency); // la frecuencia no cambia
  });
});


describe('CAGR', () => {
  test('tasa anual compuesta', () => {
    expect(cagr(100, 2)).toBeCloseTo(41.421, 3); // ×2 en 2 años
    expect(cagr(-50, 1)).toBeCloseTo(-50, 9);
    expect(cagr(null, 2)).toBeNull();
    expect(cagr(-100, 3)).toBeNull();
  });
  test('perf trae el CAGR del promedio y sinceDate compra en la fecha hasta el último cierre', () => {
    const n = 96;
    const s: StrategySeries = {
      dates: Array.from({ length: n }, (_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`),
      bht: Array.from({ length: n }, () => 63),
      px: { spx: Array.from({ length: n }, (_, k) => 100 + k), qqq: Array.from({ length: n }, () => null), tqqq: Array.from({ length: n }, (_, k) => (k < 95 ? 50 : null)) },
    };
    const r = computeBhtStrategy(s, '2000-01-01', 'spx')!;
    const y2 = r.perf.find((p) => p.years === 2)!;
    expect(y2.cagrPct!).toBeCloseTo(cagr(y2.avgPct, 2)!, 9);
    expect(r.sinceDate.spx.totalPct).toBeCloseTo(95, 9); // 195/100
    expect(r.sinceDate.spx.cagrPct!).toBeCloseTo(cagr(95, r.sinceDate.spx.years!)!, 9);
    expect(r.sinceDate.qqq).toMatchObject({ buyPrice: null, totalPct: null, cagrPct: null });
    expect(r.sinceDate.tqqq.lastDate).toBe('2007-11-01'); // último cierre con dato
    expect(computeBhtStrategy(s, '2007-06-01', 'spx')!.sinceDate.spx.cagrPct).toBeNull(); // < 1 año
  });
});

describe('vendiendo en el pico', () => {
  test('pico máximo desde la compra con su fecha, BHT, total y CAGR', () => {
    // mensual 2000-2003: sube a 200 en 2002-01 (BHT 80) y luego baja
    const dates = Array.from({ length: 48 }, (_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`);
    const spx = dates.map((_, k) => (k <= 24 ? 100 + (k * 100) / 24 : 150));
    const bht = dates.map((_, k) => (k === 24 ? 80 : 50));
    const r = computeBhtStrategy({ dates, bht, px: { spx, qqq: dates.map(() => null), tqqq: dates.map(() => 90) } }, '2000-01-01', 'spx')!;
    const pk = r.sinceDate.spx.peak!;
    expect([pk.price, pk.date, pk.bht]).toEqual([200, '2002-01-01', 80]);
    expect(pk.totalPct).toBeCloseTo(100, 9);
    expect(pk.cagrPct!).toBeCloseTo(cagr(100, pk.years)!, 9);
    expect(r.sinceDate.qqq.peak).toBeNull(); // sin precio
    expect(r.sinceDate.tqqq.peak).toBeNull(); // nunca superó el precio de compra
  });
});

describe('percentil del BHT', () => {
  test('% de días con BHT menor o igual al de hoy, en toda la historia y en 5 años', () => {
    const dates = Array.from({ length: 96 }, (_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`);
    const bht = dates.map((_, k) => k % 100); // 0..95, uno por mes
    const s: StrategySeries = { dates, bht, px: { spx: dates.map(() => 100), qqq: dates.map(() => null), tqqq: dates.map(() => null) } };
    const r = computeBhtStrategy(s, '2000-10-01', 'spx')!; // BHT 9
    expect(r.percentile.all).toBeCloseTo((10 / 96) * 100, 9); // 0..9
    expect(r.percentile.last5y).toBe(0); // los últimos 5 años tienen BHT ≥ 35
  });
});

describe('matriz BHT × tendencia', () => {
  test('rendimiento a 12m, % positivo, caída máxima y prob. de caer >15% por banda y régimen', () => {
    // mensual 2000-2003: BHT 55 (Neutral) todo el periodo; régimen alcista en 2000 y bajista en 2001
    const dates = Array.from({ length: 48 }, (_, k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`);
    const bht = dates.map(() => 55);
    const trend = dates.map((_, k) => (k < 12 ? 'UPTREND' : k < 24 ? 'DOWNTREND' : 'UPTREND'));
    // precio: sube +10% en 2000, cae -30% durante 2001, luego plano
    const spx = dates.map((_, k) => (k <= 12 ? 100 + (10 * k) / 12 : k <= 24 ? 110 - (33 * (k - 12)) / 12 : 77));
    const r = computeBhtStrategy({ dates, bht, px: { spx, qqq: dates.map(() => null), tqqq: dates.map(() => null) }, trend }, '2001-06-01', 'spx')!;
    expect(r.trend).toBe('DOWNTREND');
    expect(r.matrix.current).toEqual({ band: 2, parentBand: 2, regime: 'DOWNTREND' }); // 55 → 50–55 (matriz) y 50–61 (semáforo)
    const up = r.matrix.cells.find((c) => c.band === 2 && c.regime === 'UPTREND')!;
    const down = r.matrix.cells.find((c) => c.band === 2 && c.regime === 'DOWNTREND')!;
    expect(down.n).toBe(12);
    expect(down.avg12m!).toBeLessThan(0);
    expect(down.pos12m).toBe(0);
    expect(down.avgMdd!).toBeLessThan(up.avgMdd!);
    expect(down.pDd15!).toBeGreaterThan(0);
    expect(r.matrix.cells).toHaveLength(28); // 7 bandas × 4 regímenes
    // frecuencia: % de los días de la ventana en cada celda (todas suman 100)
    expect(down.pct!).toBeCloseTo((12 / (up.n + down.n)) * 100, 9);
    expect(r.matrix.cells.reduce((t, c) => t + (c.pct ?? 0), 0)).toBeCloseTo(100, 9);
    expect(r.matrix.cells.find((c) => c.band === 0 && c.regime === 'REBOUND')!.n).toBe(0);
  });
});

describe('bandas de la matriz', () => {
  test('7 bandas: cortes del semáforo más 56 y 75', () => {
    expect([0, 39.9, 40, 49.9, 50, 55.9, 56, 61.9, 62, 69.9, 70, 74.9, 75, 100].map(matrixBandOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(MATRIX_BAND_LO).toEqual([0, 40, 50, 56, 62, 70, 75]);
  });
});
