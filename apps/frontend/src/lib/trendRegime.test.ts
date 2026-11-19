import { describe, expect, it } from 'vitest';
import { smaGapPct, toTrendRegime, TREND_META, TREND_ORDER, trendText } from './trendRegime';
import { TOKENS } from './designTokens';

describe('trendRegime', () => {
  it('acepta código completo y letra de la serie diaria', () => {
    expect(['UPTREND', 'P', 'R', 'D', 'x', null, ''].map((v) => toTrendRegime(v as string))).toEqual(['UPTREND', 'PULLBACK', 'REBOUND', 'DOWNTREND', null, null, null]);
  });
  it('semáforo de verde a rojo en el orden de riesgo', () => {
    expect(TREND_ORDER.map((r) => TREND_META[r].color)).toEqual([TOKENS.favorable, TOKENS.caution, TOKENS.elevated, TOKENS.risk]);
  });
  it('textos por idioma y distancia a la media', () => {
    expect(trendText('PULLBACK', 'es').name).toBe('Corrección');
    expect(trendText('DOWNTREND', 'en').name).toBe('Downtrend');
    expect(smaGapPct(110, 100)).toBeCloseTo(10, 9);
    expect(smaGapPct(null, 100)).toBeNull();
  });
});
