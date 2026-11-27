import { describe, expect, test } from 'vitest';
import { publicSourceLabel } from './dataSources';

describe('fuentes que se pueden nombrar', () => {
  test('públicas', () => {
    expect(publicSourceLabel('FRED')).toBe('FRED');
    expect(publicSourceLabel('fred')).toBe('FRED');
    expect(publicSourceLabel('Shiller')).toBe('Shiller');
    expect(publicSourceLabel('EDGAR')).toBe('SEC EDGAR');
    expect(publicSourceLabel('FINRA')).toBe('FINRA');
  });
  test('comerciales o propietarias: no se muestran', () => {
    expect(publicSourceLabel('CNN')).toBe('CNN'); // se cita con atribución
    for (const s of ['yahoo', 'yahoo ^VIX', 'yahoo CL=F', 'WSJ / Birinyi', 'GuruFocus', 'db-fallback', 'none', '', null, undefined]) {
      expect(publicSourceLabel(s)).toBeNull();
    }
  });
});
