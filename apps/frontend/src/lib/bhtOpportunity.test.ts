import { describe, expect, it } from 'vitest';
import { fmtPct, opportunityMessage, opportunityTier } from './bhtOpportunity';

describe('bhtOpportunity', () => {
  it('escalones por percentil', () => {
    expect([0.5, 10, 20, 50, 70, 95].map(opportunityTier)).toEqual(['exceptional', 'exceptional', 'good', 'neutral', 'expensive', 'very_expensive']);
  });
  it('formato del %', () => {
    expect([fmtPct(1.1), fmtPct(0.04), fmtPct(12.6), fmtPct(0)]).toEqual(['1', '0.1', '13', '0.1']);
  });
  it('mensaje de compra barata y de caro', () => {
    expect(opportunityMessage(1.1, 'es').text).toContain('mejor 1% de la historia');
    const caro = opportunityMessage(92, 'es');
    expect(caro.label).toBe('Muy caro');
    expect(caro.text).toContain('solo el 8%');
    expect(opportunityMessage(20, 'en').label).toBe('Good time to buy');
  });
});
