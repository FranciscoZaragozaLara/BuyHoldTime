import { describe, expect, it } from 'vitest';
import { trancheCheckText, TRANCHE_LIGHT } from './tranches';

describe('tranches', () => {
  it('textos de condiciones con valor contra lo exigido', () => {
    expect(trancheCheckText({ key: 'ddReached', ok: false, value: -16.04, need: -22 }, 'es')).toBe('caída alcanzada -16.0% / -22%');
    expect(trancheCheckText({ key: 'capeBelowMedian', ok: false, value: 37.26, need: 27.56 }, 'en')).toBe('CAPE < 20y median (37.3 vs 27.6)');
    expect(trancheCheckText({ key: 'afterT1', ok: false, value: null, need: 5 }, 'es')).toBe('T1 primero');
    expect(trancheCheckText({ key: 'votes2', ok: false, value: 1, need: 2 }, 'es')).toBe('2 votos (1)');
    expect(trancheCheckText({ key: 'noVeto', ok: false }, 'en')).toBe('no credit veto');
    expect(trancheCheckText({ key: 'speed', ok: false, value: 14.8, need: -13 }, 'es')).toBe('caída en 10 días +14.8% / -13%');
  });
  it('semáforo de 5 colores con mensaje en los dos idiomas', () => {
    expect(Object.keys(TRANCHE_LIGHT)).toEqual(['gray', 'purple', 'red', 'amber', 'green']);
    expect(TRANCHE_LIGHT.red.es).toContain('cuchillo');
  });
});
