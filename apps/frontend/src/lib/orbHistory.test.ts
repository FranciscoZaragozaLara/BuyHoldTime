import { describe, expect, it } from 'vitest';
import { monthLabel, orbHistoryRows, shortDate, type MonthlyParts } from './orbHistory';

const data: MonthlyParts[] = [
  { month: '2026-11', date: '2026-11-13', parts: { CAPE: { value: 40.01, score: 70.1, weight: 20 }, Y2M: { value: 4.73, score: 70.7, weight: 10 } } },
  { month: '2026-10', date: '2026-10-30', parts: { CAPE: { value: 39.5, score: 66, weight: 20 } } },
];

describe('orbHistoryRows', () => {
  it('mapea el nombre del orbe a su componente y conserva el orden', () => {
    expect(orbHistoryRows(data, 'CAPE').map((r) => r.score)).toEqual([70.1, 66]);
    expect(orbHistoryRows(data, '2Y Mom')).toEqual([{ month: '2026-11', date: '2026-11-13', value: 4.73, score: 70.7, perf: { spx: null, ndx: null, tqqq: null }, peak: { spx: null, ndx: null, tqqq: null }, yearsAgo: null }]);
  });
  it('conserva rendimiento a hoy y años atrás', () => {
    const d: MonthlyParts[] = [{ month: '2023-11', date: '2023-11-30', parts: { CAPE: { value: 30, score: 32, weight: 20 } }, perf: { spx: 65.5, ndx: 76.9, tqqq: 171.8 }, yearsAgo: 3 }];
    expect(orbHistoryRows(d, 'CAPE')[0]).toMatchObject({ yearsAgo: 3, perf: { spx: 65.5, tqqq: 171.8 } });
  });
  it('sin componente (WTI) o sin datos → vacío', () => {
    expect(orbHistoryRows(data, 'WTI')).toEqual([]);
    expect(orbHistoryRows(undefined, 'CAPE')).toEqual([]);
  });
});

describe('monthLabel', () => {
  it('formatea por idioma', () => {
    expect(monthLabel('2026-11', 'en')).toBe('Nov 2026');
    expect(monthLabel('2026-11', 'es').toLowerCase()).toContain('nov');
  });
});

describe('shortDate', () => {
  it('formatea día, mes y año corto', () => {
    expect(shortDate('2026-10-06', 'en')).toBe('Oct 06, 26');
    expect(shortDate('2026-10-06', 'es').toLowerCase()).toContain('oct');
    expect(shortDate('x', 'es')).toBe('x');
  });
});
