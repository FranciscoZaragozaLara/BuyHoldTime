import { describe, expect, test } from 'vitest';
import { createTranslator } from 'next-intl';
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

describe('mensajes ICU válidos', () => {
  // Llaves sueltas en un texto (p. ej. "CPI_{t-12}") rompen el formato ICU y next-intl muestra un error.
  const leaves = (o: any, pre = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));
  for (const [locale, messages] of [['es', es], ['en', en]] as const) {
    test(`${locale}: todos los mensajes se pueden interpretar`, () => {
      const bad: string[] = [];
      const t = createTranslator({ locale, messages: messages as any, onError: (e: any) => { if (e.code === 'INVALID_MESSAGE') bad.push(e.message.slice(0, 80)); }, getMessageFallback: ({ key }: any) => key });
      for (const k of leaves(messages)) { try { (t as any).raw(k); (t as any)(k, new Proxy({}, { get: () => 'x' })); } catch { /* formato con argumentos: no aplica */ } }
      expect(bad).toEqual([]);
    });
  }
});
