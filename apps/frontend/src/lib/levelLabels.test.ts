import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LEVEL_EN, levelLabel } from './levelLabels';

describe('levelLabel', () => {
  it('es devuelve igual; en traduce; desconocido pasa tal cual', () => {
    expect(levelLabel('Barato', 'es')).toBe('Barato');
    expect(levelLabel('Barato', 'en')).toBe('Cheap');
    expect(levelLabel('XYZ', 'en')).toBe('XYZ');
  });
  it('cubre todas las etiquetas de bandas de IndicatorsPanel', () => {
    const s = readFileSync('src/components/backtesting/IndicatorsPanel.tsx', 'utf8');
    const labels = new Set<string>();
    for (const m of s.matchAll(/'[^']*', '[^']*', '([^']+)'\]/g)) labels.add(m[1]);
    for (const m of s.matchAll(/BandLabel = \([^)]*\) =>([^\n]+)/g)) for (const w of m[1].matchAll(/'([^']+)'/g)) labels.add(w[1]);
    const missing = [...labels].filter((l) => /^[A-ZÁÉÍÓÚ]/.test(l) && !l.includes('_') && !(l in LEVEL_EN));
    expect(missing).toEqual([]);
  });
});
