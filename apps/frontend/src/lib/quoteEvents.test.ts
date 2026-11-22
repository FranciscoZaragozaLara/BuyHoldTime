import { describe, expect, it } from 'vitest';
import { quoteEvent } from './quoteEvents';

describe('quoteEvent', () => {
  const day = '2026-11-20';
  it('nuevo máximo (ATH o de 5 años) cuando el máximo es de ese día', () => {
    expect(quoteEvent({ fromHigh: 0, highDate: day, window5y: false }, day)).toEqual({ kind: 'high', window5y: false, fromHigh: 0 });
    expect(quoteEvent({ fromHigh: 0, highDate: day, window5y: true }, day)?.window5y).toBe(true);
  });
  it('nuevo mínimo de la corrección cuando el piso es de ese día', () => {
    expect(quoteEvent({ fromHigh: -19.9, highDate: '2026-10-06', window5y: false, fromBottom: 0, bottomDate: day }, day)).toEqual({ kind: 'low', window5y: false, fromHigh: -19.9 });
  });
  it('sin evento: máximo o piso de otro día, o sin datos', () => {
    expect(quoteEvent({ fromHigh: -2, highDate: '2026-10-06', window5y: false, fromBottom: 12, bottomDate: '2025-04-08' }, day)).toBeNull();
    expect(quoteEvent(null, day)).toBeNull();
  });
});
