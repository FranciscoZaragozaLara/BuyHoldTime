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

