import { publicSnapshot } from './public-snapshot';

describe('snapshot público', () => {
  const full = {
    scrapeDate: '2026-11-26', gfValue: 180, gfScore: 92, recommendation: 'Fairly Valued', pe: 30, forwardPe: 28,
    scores: { valuation: 3, growth: 8 }, analystEstimates: { years: ['2027'], estimates: [] },
    tables: { keyMetrics: [{ name: 'Price-to-GF-Value', value: 1.1 }], etfProfile: [{ name: 'Turnover %', value: 5 }], topHoldings: [{ name: 'AAPL', weight: 8 }] },
  };
  test('ETF: solo perfil y posiciones (N-PORT)', () => {
    expect(publicSnapshot(full)).toEqual({ scrapeDate: '2026-11-26', tables: { etfProfile: full.tables.etfProfile, topHoldings: full.tables.topHoldings } });
  });
  test('acción: nada de GuruFocus', () => {
    expect(publicSnapshot({ ...full, tables: { keyMetrics: [] } })).toBeNull();
    expect(publicSnapshot(null)).toBeNull();
    expect(publicSnapshot({ scrapeDate: 'x' })).toBeNull();
  });
});
