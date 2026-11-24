import { describe, expect, it } from 'vitest';
import { bandReturns, windowStart, type FwdRow } from './bandReturns';

const rows: FwdRow[] = [
  { date: '2015-01-02', bhtValue: 30, spx1y: 20, spx3y: 50 },
  { date: '2015-01-05', bhtValue: 35, spx1y: 10, spx3y: 33.1 },
  { date: '2015-01-06', bhtValue: 80, spx1y: -10, spx3y: -5 },
  { date: '2022-01-03', bhtValue: 90, spx1y: -20, spx3y: null },
  { date: '2026-01-02', bhtValue: 50, spx1y: null, spx3y: null }, // aún sin madurar: no cuenta
];

describe('bandReturns por BHT', () => {
  it('7 bandas de la matriz; promedio, mediana, % positivos y CAGR del promedio a 3 años', () => {
    const r = bandReturns(rows, { asset: 'spx', window: 'all', today: '2026-11-24', by: 'bht' });
    expect(r.map((b) => b.range)).toEqual(['0–39', '40–49', '50–55', '56–61', '62–69', '70–74', '75–100']);
    const low = r[0], high = r[6];
    expect(low.days).toBe(2);
    expect(low.pctTime).toBeCloseTo(50, 9);
    expect(low.y1).toEqual({ n: 2, avg: 15, median: 15, pos: 100 });
    expect(low.y3!.avg).toBeCloseTo(41.55, 9);
    expect(low.cagr3!).toBeCloseTo((Math.pow(1.4155, 1 / 3) - 1) * 100, 9);
    expect(high.days).toBe(2);
    expect(high.y1!.pos).toBe(0);
    expect(high.y3!.n).toBe(1); // el de 2022 aún no tiene 3 años
    expect(r[2].days).toBe(0);
    expect(r[2].y1).toBeNull();
  });
  it('ventana de 5 años: solo días desde hoy − 5 años', () => {
    expect(windowStart('5y', '2026-11-24')).toBe('2021-11-24');
    expect(windowStart('all', '2026-11-24')).toBeNull();
    const r = bandReturns(rows, { asset: 'spx', window: '5y', today: '2026-11-24', by: 'bht' });
    expect(r.reduce((m, b) => m + b.days, 0)).toBe(1);
  });
});

describe('bandReturns por CAPE', () => {
  it('agrupa por nivel del CAPE de cada día; días sin CAPE no cuentan', () => {
    const cape = new Map([['2015-01-02', 26], ['2015-01-05', 27], ['2015-01-06', 41]]);
    const r = bandReturns(rows, { asset: 'spx', window: 'all', today: '2026-11-24', by: 'cape', capeByDate: cape });
    expect(r.map((b) => b.days)).toEqual([0, 0, 2, 0, 0, 1]);
    expect(r[2].range).toBe('25–30');
  });
});
