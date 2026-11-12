import { describe, expect, test } from 'vitest';
import es from '../../messages/es.json';
import en from '../../messages/en.json';

// Los textos legales deben existir completos en ambos idiomas (mismas claves y secciones).
const keys = (o: unknown, prefix = ''): string[] =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
    : [prefix.slice(0, -1)];

describe('Legal (messages)', () => {
  test('mismas claves en es y en', () => {
    expect(keys(es.Legal).sort()).toEqual(keys(en.Legal).sort());
  });

  test('mismo número de secciones y de párrafos por sección', () => {
    const shape = (l: typeof es.Legal) => l.terms.sections.map((s) => s.paragraphs.length);
    expect(shape(es.Legal)).toEqual(shape(en.Legal));
    expect(es.Legal.terms.summary.length).toBe(en.Legal.terms.summary.length);
  });

  test('cubre lo esencial: no asesoría, rendimiento hipotético, limitación de responsabilidad', () => {
    const titles = en.Legal.terms.sections.map((s) => s.title).join(' | ');
    for (const t of ['No professional advice', 'Hypothetical performance', 'Limitation of liability', 'Indemnification', 'Disclaimer of warranties']) {
      expect(titles).toContain(t);
    }
  });

  test('los marcadores de jurisdicción y contacto están en ambos idiomas', () => {
    for (const l of [es.Legal, en.Legal]) {
      const all = l.terms.sections.flatMap((s) => s.paragraphs).join(' ');
      expect(all).toContain('{jurisdiction}');
      expect(all).toContain('{contact}');
    }
  });
});
