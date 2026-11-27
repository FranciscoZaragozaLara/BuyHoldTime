import { describe, expect, test } from 'vitest';
import { projectionNote } from './projectionLabel';

const base = { modelStartGrowth: 0.24, epsNext12m: 10, years: [] };
describe('nota de la proyección de EPS', () => {
  test('mezcla: dice los pesos y que el consenso suele incorporar la guía; sin nombrar proveedores', () => {
    const t = projectionNote({ ...base, basis: 'blend', analystWeight: 0.6 }, true);
    expect(t).toContain('(40%)');
    expect(t).toContain('consenso de analistas disponible (60%)');
    expect(t).toContain('guía de las empresas');
    expect(t).not.toMatch(/gurufocus/i);
  });
  test('solo modelo y sin proyección', () => {
    expect(projectionNote({ ...base, basis: 'model', analystWeight: 0 }, false)).toContain('starting growth 24%');
    expect(projectionNote(null, true)).toContain('6% anual');
  });
});
