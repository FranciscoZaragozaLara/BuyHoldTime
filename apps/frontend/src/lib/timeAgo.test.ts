import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo';

describe('timeAgo', () => {
  const now = Date.parse('2026-11-13T20:00:00Z');
  it('segundos, minutos, horas y días por idioma', () => {
    expect(timeAgo('2026-11-13T19:59:30Z', 'es', now)).toBe('hace segundos');
    expect(timeAgo('2026-11-13T19:15:00Z', 'es', now)).toBe('hace 45 min');
    expect(timeAgo('2026-11-13T17:00:00Z', 'en', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-10T20:00:00Z', 'es', now)).toBe('hace 3 d');
  });
});
