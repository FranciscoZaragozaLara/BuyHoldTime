import { indicatorStatus, indicatorUpdates, syncIndicatorsTable } from './indicator-sync';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('indicator-sync', () => {
  test('valores actuales: último dato ≤ hoy y CPI interanual', () => {
    const ups = indicatorUpdates({
      DFEDTARU: m({ '2026-11-10': 4.0, '2026-11-13': 4.0, '2026-12-01': 3.75 }),
      VIXCLS: m({ '2026-11-12': 17.49 }),
      FEAR_GREED: m({ '2026-11-14': 39 }),
      CPIAUCSL: m({ '2025-10-01': 320, '2026-10-01': 333.06 }),
    }, '2026-11-15');
    expect(ups).toEqual([
      { key: 'fed_rate', value: 4.0, status: 'Normal', asOf: '2026-11-13' },
      { key: 'vix', value: 17.49, status: 'Normal', asOf: '2026-11-12' },
      { key: 'fear_greed', value: 39, status: 'Fear', asOf: '2026-11-14' },
      { key: 'inflation', value: expect.closeTo(4.08, 2), status: 'High', asOf: '2026-10-01' },
    ]);
  });
  test('sin serie no se toca la fila', () => {
    expect(indicatorUpdates({}, '2026-11-15')).toEqual([]);
  });
  test('etiquetas', () => {
    expect(['vix', 'vix', 'vix'].map((k, i) => indicatorStatus(k, [12, 20, 30][i]))).toEqual(['Low', 'Normal', 'High']);
    expect([10, 30, 50, 60, 80].map((v) => indicatorStatus('fear_greed', v))).toEqual(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']);
    expect([1.5, 4, 5.25].map((v) => indicatorStatus('fed_rate', v))).toEqual(['Low', 'Normal', 'High']);
    expect(indicatorStatus('core_inflation', 2.87)).toBe('Normal');
  });
  test('escribe una fila por indicador con dato', async () => {
    const calls: unknown[][] = [];
    const db = {
      btMarketData: { findMany: async () => [{ ticker: 'DGS30', date: new Date('2026-11-13T00:00:00Z'), close: 4.86 }] },
      $executeRawUnsafe: async (...a: unknown[]) => { calls.push(a); return 1; },
    };
    const ups = await syncIndicatorsTable(db, new Date('2026-11-15T12:00:00Z'));
    expect(ups).toEqual([{ key: 'treasury_30y', value: 4.86, status: 'High', asOf: '2026-11-13' }]);
    expect(calls).toEqual([[expect.stringContaining('UPDATE indicators'), 4.86, 'High', 'treasury_30y']]);
  });
});
