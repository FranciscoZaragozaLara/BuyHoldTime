import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { TOKENS } from './designTokens';

const css = readFileSync('src/app/globals.css', 'utf8');
const FAMILY: Record<string, string> = { accent: 'teal', favorable: 'emerald', caution: 'amber', elevated: 'orange', risk: 'red' };

describe('tokens de diseño', () => {
  it('cada token de JS tiene su escala en globals.css apuntando a su familia', () => {
    for (const name of Object.keys(TOKENS)) {
      for (const sh of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
        expect(css).toMatch(new RegExp(`--color-${name}-${sh}: oklch\\([^)]+\\); /\\* ${FAMILY[name]}-${sh} \\*/`));
      }
    }
  });
  it('el código usa tokens y no las familias semánticas directas', () => {
    const files = (readdirSync('src', { recursive: true }) as string[]).map((f) => join('src', f)).filter((f) => /\.(ts|tsx)$/.test(f) && !/designTokens/.test(f));
    const bad: string[] = [];
    const cls = /(?<![\w-])(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxy])?|ring|from|to|via|fill|stroke|shadow|outline|decoration|divide)-(?:teal|emerald|amber|yellow|orange|red|rose)-\d{2,3}(?![\w])/;
    const hex = new RegExp(`#(${Object.values(TOKENS).map((h) => h.slice(1)).join('|')})\\b`, 'i');
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      if (cls.test(s)) bad.push(`${f}: clase ${s.match(cls)![0]}`);
      if (hex.test(s)) bad.push(`${f}: hex ${s.match(hex)![0]}`);
    }
    expect(bad).toEqual([]);
  });
});
