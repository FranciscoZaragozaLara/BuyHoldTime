import { describe, expect, it } from 'vitest';
import { parseEtfProfile } from './etfProfile';

const r = (name: string, current: string) => ({ name, current, vsIndustry: '', vsHistory: '' });

describe('parseEtfProfile', () => {
  it('lee perfil y principales posiciones', () => {
    const p = parseEtfProfile({
      etfProfile: [r('Last Holding Update', '2026-11-16'), r('Number of Holdings', '503'), r('New Holdings', '6'), r('Portfolio Value ($)', '781.03 Bil'), r('Turnover %', '4')],
      topHoldings: [r('NVDA — NVIDIA Corp', '7.520'), r('AAPL — Apple Inc', '6.590')],
    })!;
    expect(p).toEqual({
      lastUpdate: '2026-11-16', holdings: 503, newHoldings: 6, value: '$781.03 B', turnover: 4,
      top: [{ ticker: 'NVDA', company: 'NVIDIA Corp', weight: 7.52 }, { ticker: 'AAPL', company: 'Apple Inc', weight: 6.59 }],
      others: { count: 501, weight: expect.closeTo(85.89, 6) },
    });
  });
  it('valor sin unidad (scraper) → sin valor; "otras" sin total conocido', () => {
    const p = parseEtfProfile({
      etfProfile: [r('Portfolio Value ($)', '1.67')],
      topHoldings: [r('NVDA — NVIDIA Corp', '7.5')],
    })!;
    expect(p.value).toBeNull();
    expect(p.others).toEqual({ count: null, weight: 92.5 });
  });
  it('null si no es ETF; tolera datos faltantes', () => {
    expect(parseEtfProfile({ keyMetrics: [r('Beta', '1')] })).toBeNull();
    expect(parseEtfProfile(null)).toBeNull();
    const p = parseEtfProfile({ etfProfile: [r('Number of Holdings', '30')] })!;
    expect([p.holdings, p.value, p.top, p.others]).toEqual([30, null, [], null]);
  });
});
