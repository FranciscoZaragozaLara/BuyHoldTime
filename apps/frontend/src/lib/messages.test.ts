import { describe, expect, test } from 'vitest';
import es from '../../messages/es.json';
import en from '../../messages/en.json';

// Toda clave de traducción debe existir en ambos idiomas y no estar vacía.
const flat = (o: unknown, p = ''): [string, unknown][] =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => flat(v, `${p}${k}.`))
    : [[p.slice(0, -1), o]];

describe('messages es/en', () => {
  const esF = new Map(flat(es));
  const enF = new Map(flat(en));

  test('mismas claves en ambos idiomas', () => {
    expect([...esF.keys()].filter((k) => !enF.has(k))).toEqual([]);
    expect([...enF.keys()].filter((k) => !esF.has(k))).toEqual([]);
  });

  test('sin textos vacíos', () => {
    const empty = [...esF, ...enF].filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
    expect(empty).toEqual([]);
  });

  test('mismos marcadores {variable} en ambos idiomas', () => {
    const vars = (v: unknown) => (typeof v === 'string' ? (v.match(/\{\w+\}/g) ?? []).sort().join(',') : '');
    const diff = [...esF.keys()].filter((k) => vars(esF.get(k)) !== vars(enF.get(k)));
    expect(diff).toEqual([]);
  });
});
