import { describe, expect, test } from 'vitest';
import { buildCapeTableRows } from './capeTableRows';

describe('buildCapeTableRows', () => {
  test('con serie CAPE la usa tal cual', () => {
    const cape = [{ date: '2026-11-11', cape: 40 }];
    expect(buildCapeTableRows(cape, ['2026-11-10'])).toBe(cape);
  });

  test('sin CAPE ni SP500: vacío', () => {
    expect(buildCapeTableRows([], undefined)).toEqual([]);
  });

  test('sin CAPE: días hábiles del SP500 desde 1990, ordenados y sin duplicados', () => {
    const spx = new Map([['2026-11-13', 1], ['1989-12-29', 1], ['2026-11-14', 1], ['2026-11-09', 1], ['2026-11-09T00:00:00Z', 2]]).keys();
    expect(buildCapeTableRows([], spx)).toEqual([{ date: '2026-11-09' }, { date: '2026-11-13' }]);
  });
});
