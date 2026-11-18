import { describe, expect, it } from 'vitest';
import { stepIndex } from './chartStep';

const D = ['2024-01-02', '2024-01-03', '2024-01-05', '2024-01-08'];

describe('stepIndex', () => {
  it('avanza y retrocede un día con dato', () => {
    expect(stepIndex(D, '2024-01-03', 1)).toBe(2);
    expect(stepIndex(D, '2024-01-03', -1)).toBe(0);
  });
  it('se queda en los extremos', () => {
    expect(stepIndex(D, '2024-01-08', 1)).toBe(3);
    expect(stepIndex(D, '2024-01-02', -1)).toBe(0);
  });
  it('fecha sin dato: parte del último día anterior', () => {
    expect(stepIndex(D, '2024-01-06', 1)).toBe(3);
    expect(stepIndex(D, '2024-01-06', -1)).toBe(1);
    expect(stepIndex(D, '2023-12-01', 1)).toBe(0);
  });
  it('sin fecha actual arranca en la última; sin fechas, -1', () => {
    expect(stepIndex(D, null, -1)).toBe(3);
    expect(stepIndex([], '2024-01-03', 1)).toBe(-1);
  });
});
