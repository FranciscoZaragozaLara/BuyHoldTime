import { describe, expect, test } from 'vitest';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
import { publicMessages } from './publicMessages';

describe('traducciones públicas', () => {
  test.each([['es', es], ['en', en]])('%s: sin el namespace Admin salvo el aviso del menú', (_l, m) => {
    const p = publicMessages(m as Record<string, unknown>);
    expect(p.Admin).toEqual({ freshness: { menuStale: (m as any).Admin.freshness.menuStale } });
    expect(p.Home).toBe((m as any).Home);
    expect(JSON.stringify(p)).not.toMatch(/gurufocus|wsj|birinyi|\bcnn\b|yahoo/i);
  });
  test('sin Admin no agrega nada', () => {
    expect(publicMessages({ Home: { a: 'b' } })).toEqual({ Home: { a: 'b' } });
  });
});
