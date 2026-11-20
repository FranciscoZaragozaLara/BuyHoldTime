import { describe, expect, it } from 'vitest';
import { bandPct, matrixBandOf, matrixCell, MATRIX_BANDS, type MatrixCell } from './bhtMatrix';

const cells: MatrixCell[] = [
  { band: 2, regime: 'DOWNTREND', n: 464, avg12m: -4.2, pos12m: 53, avgMdd: -22, pDd15: 49 },
  { band: 2, regime: 'UPTREND', n: 0, avg12m: null, pos12m: null, avgMdd: null, pDd15: null },
];

describe('matrixCell', () => {
  it('toma la celda de banda × régimen; sin días o sin régimen, null', () => {
    expect(matrixCell(cells, 2, 'DOWNTREND')!.avg12m).toBe(-4.2);
    expect(matrixCell(cells, 2, 'UPTREND')).toBeNull();
    expect(matrixCell(cells, 2, null)).toBeNull();
    expect(matrixCell(null, 2, 'DOWNTREND')).toBeNull();
  });
});

describe('bandas de la matriz', () => {
  it('7 bandas con los cortes del semáforo más 56 y 75; cada una con su banda madre', () => {
    expect([0, 39.9, 40, 50, 55.9, 56, 61.9, 62, 70, 74.9, 75, 100].map(matrixBandOf)).toEqual([0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]);
    expect(MATRIX_BANDS.map((b) => b.parent)).toEqual([0, 1, 2, 2, 3, 4, 4]);
    expect(new Set(MATRIX_BANDS.map((b) => b.color)).size).toBe(7);
  });
  it('frecuencia de la banda = suma de sus celdas', () => {
    const cs: MatrixCell[] = [
      { band: 3, regime: 'UPTREND', n: 10, pct: 12.5, avg12m: 1, pos12m: 1, avgMdd: 1, pDd15: 1 },
      { band: 3, regime: 'DOWNTREND', n: 4, pct: 5, avg12m: 1, pos12m: 1, avgMdd: 1, pDd15: 1 },
      { band: 2, regime: 'UPTREND', n: 4, pct: 7, avg12m: 1, pos12m: 1, avgMdd: 1, pDd15: 1 },
    ];
    expect(bandPct(cs, 3)).toBeCloseTo(17.5, 9);
    expect(bandPct(null, 3)).toBe(0);
  });
});
