import { describe, expect, it } from 'vitest';
import { trendAdvice } from './bhtTrendAdvice';

describe('trendAdvice', () => {
  it('la banda Neutral cambia de lectura según la SMA 200', () => {
    expect(trendAdvice(2, 'UPTREND', 'es')!.tone).toBe('good');
    expect(trendAdvice(2, 'PULLBACK', 'es')!.tone).toBe('good');
    const bad = trendAdvice(2, 'DOWNTREND', 'es')!;
    expect(bad.tone).toBe('bad');
    expect(bad.title).toContain('Alerta');
    expect(trendAdvice(2, 'REBOUND', 'en')!.tone).toBe('bad');
  });
  it('miedo con tendencia bajista: escalonar; codicia extrema: riesgo siempre', () => {
    expect(trendAdvice(0, 'DOWNTREND', 'es')!.text).toContain('Escalonar');
    expect(trendAdvice(4, 'UPTREND', 'es')!.tone).toBe('bad');
    expect(trendAdvice(3, 'UPTREND', 'en')!.tone).toBe('ok');
  });
  it('sin régimen no hay consejo', () => {
    expect(trendAdvice(1, null, 'es')).toBeNull();
  });
});
