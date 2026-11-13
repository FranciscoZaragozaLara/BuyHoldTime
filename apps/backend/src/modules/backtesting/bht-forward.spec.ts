import { computeFwdDay, fwdReturn, monthlyPartsFromDaily } from './bht-forward';
import { PriceMap } from './thermo-history';

const map = (rows: [string, number][]): PriceMap => new Map(rows);

describe('bht-forward', () => {
  test('solo horizontes maduros', () => {
    const spx = map([['2022-01-03', 100], ['2023-01-03', 110], ['2024-01-03', 121]]);
    // 1Y y 2Y maduros, 3Y/5Y aún no
    expect(fwdReturn(spx, '2022-01-03', 1, '2024-01-03')).toBeCloseTo(10.0, 6);
    expect(fwdReturn(spx, '2022-01-03', 2, '2024-01-03')).toBeCloseTo(21.0, 6);
    expect(fwdReturn(spx, '2022-01-03', 3, '2024-01-03')).toBeNull();
    expect(fwdReturn(spx, '2022-01-03', 5, '2024-01-03')).toBeNull();
    // Sin precio base no hay retorno
    expect(fwdReturn(spx, '2021-01-04', 1, '2024-01-03')).toBeNull();
  });

  test('computeFwdDay por índice', () => {
    const r = computeFwdDay(
      '2022-01-03',
      { spx: map([['2022-01-03', 100], ['2023-01-03', 110]]), ndx: undefined, tqqq: undefined },
      { spx: '2023-01-03', ndx: '2023-01-03', tqqq: '2023-01-03' },
    );
    expect(r.spx).toBe(100);
    expect(r.spxFw[0]).toBeCloseTo(10.0, 6);
    expect(r.spxFw.slice(1)).toEqual([null, null, null]);
    expect(r.ndx).toBeNull();
    expect(r.tqqqFw).toEqual([null, null, null, null]);
  });
});

describe('monthlyPartsFromDaily', () => {
  const p = (score: number) => [{ key: 'CAPE', value: 40, score, weight: 20 }];
  test('toma el último día de cada mes, más reciente primero, limita a n', () => {
    const rows = [
      { date: '2026-09-29', parts: p(60) }, { date: '2026-09-30', parts: p(61) },
      { date: '2026-10-31', parts: p(65) }, { date: '2026-11-13', parts: p(70) }, { date: '2026-11-12', parts: p(69) },
      { date: '2026-08-31', parts: null },
    ];
    const out = monthlyPartsFromDaily(rows, 2);
    expect(out.map((m) => m.date)).toEqual(['2026-11-13', '2026-10-31']);
    expect(out[0].parts.CAPE).toEqual({ value: 40, score: 70, weight: 20 });
    expect(out[0].yearsAgo).toBeNull();
    expect(monthlyPartsFromDaily(rows, 12).map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09']);
  });
  test('valores no numéricos → null', () => {
    const out = monthlyPartsFromDaily([{ date: '2026-11-13', parts: [{ key: 'FG', value: 'x', score: null, weight: 10 }] }]);
    expect(out[0].parts.FG).toEqual({ value: null, score: null, weight: 10 });
  });
  test('rendimiento a hoy por índice y filas de 2 y 3 años atrás', () => {
    const rows = [
      { date: '2026-11-13', parts: p(70), bht: 67.1, spx: 6000, ndx: 20000, tqqq: 100 },
      { date: '2026-10-30', parts: p(65), spx: 5000, ndx: 16000, tqqq: 50 },
      { date: '2024-11-29', parts: p(50), spx: 4000, ndx: null, tqqq: 25 },
      { date: '2023-11-30', parts: p(40), spx: 3000, ndx: 10000, tqqq: 20 },
    ];
    const out = monthlyPartsFromDaily(rows, 2, { spx: 6000, ndx: 20000, tqqq: 100 }, [2, 3, 5]);
    expect(out.map((m) => [m.month, m.yearsAgo])).toEqual([['2026-11', null], ['2026-10', null], ['2024-11', 2], ['2023-11', 3]]);
    expect(out[0].perf).toEqual({ spx: 0, ndx: 0, tqqq: 0 });
    expect(out[0].bht).toBe(67.1);
    expect(out[1].bht).toBeNull();
    expect(out[1].perf.spx).toBeCloseTo(20);
    expect(out[2].perf).toEqual({ spx: 50, ndx: null, tqqq: 300 });
    expect(out[3].perf.spx).toBeCloseTo(100);
  });
  test('pico desde cada fila: máximo posterior (incluye el último cierre) y su fecha', () => {
    const rows = [
      { date: '2026-09-30', parts: p(60), spx: 100, ndx: 100, tqqq: 100 },
      { date: '2026-10-15', parts: p(62), spx: 130, ndx: 90, tqqq: 150 },
      { date: '2026-10-30', parts: p(65), spx: 110, ndx: 95, tqqq: 120 },
    ];
    const out = monthlyPartsFromDaily(rows, 2, { spx: 120, ndx: 99, tqqq: 200 }, [], { spx: '2026-11-13', ndx: '2026-11-13', tqqq: '2026-11-13' });
    // fila oct (base 110): pico spx 120 en vivo; ndx 99; tqqq 200
    expect(out[0].peak.spx).toEqual({ pct: expect.closeTo(9.09, 1), date: '2026-11-13' });
    expect(out[0].peak.tqqq?.date).toBe('2026-11-13');
    // fila sep (base 100): spx pico 130 el 15-oct; ndx nunca supera el cierre → 0% el mismo día
    expect(out[1].peak.spx).toEqual({ pct: expect.closeTo(30, 5), date: '2026-10-15' });
    expect(out[1].peak.ndx).toEqual({ pct: 0, date: '2026-09-30' });
  });
});
