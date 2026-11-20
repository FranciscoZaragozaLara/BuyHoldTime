import { describe, expect, it } from 'vitest';
import { matrixCell, type MatrixCell } from './bhtMatrix';

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
