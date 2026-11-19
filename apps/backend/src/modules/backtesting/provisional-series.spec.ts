import { PROVISIONAL_OF, rowsWithProvisional, withProvisional } from './provisional-series';

describe('provisional-series', () => {
  test('solo completa fechas posteriores al último dato oficial; el oficial manda', () => {
    const fred = new Map([['2026-11-13', 91.96], ['2026-11-16', 89.24], ['2026-11-17', 89.53]]);
    const clf = new Map([['2026-11-16', 88.0], ['2026-11-17', 88.5], ['2026-11-18', 84.1], ['2026-11-19', 83.43]]);
    const m = withProvisional(fred, clf);
    expect([...m.entries()].sort()).toEqual([['2026-11-13', 91.96], ['2026-11-16', 89.24], ['2026-11-17', 89.53], ['2026-11-18', 84.1], ['2026-11-19', 83.43]]);
    expect(withProvisional(fred, undefined)).toBe(fred);
    expect(PROVISIONAL_OF.DCOILWTICO).toBe('CL=F');
  });
  test('filas: agrega las provisionales posteriores marcadas', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const rows = rowsWithProvisional([{ date: d('2026-11-17'), close: 89.53 }], [{ date: d('2026-11-17'), close: 88.5 }, { date: d('2026-11-18'), close: 84.1 }]);
    expect(rows.map((r) => [r.date.toISOString().slice(0, 10), r.close, r.provisional ?? false])).toEqual([['2026-11-17', 89.53, false], ['2026-11-18', 84.1, true]]);
  });
});
