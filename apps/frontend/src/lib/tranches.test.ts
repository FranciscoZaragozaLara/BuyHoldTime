import { describe, expect, it } from 'vitest';
import { pnlColor, trancheCheckText, trancheMode, TRANCHE_LIGHT } from './tranches';
import { TOKENS } from './designTokens';

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
  it('P&L semaforizado: ganancia verde; pérdidas ámbar, naranja y rojo', () => {
    expect([12, 0, -3, -10, -20].map(pnlColor)).toEqual([TOKENS.favorable, TOKENS.favorable, TOKENS.caution, TOKENS.elevated, TOKENS.risk]);
  });
  it('modo: compra si hay episodio de caída, venta si hay ciclo de codicia, si no en espera', () => {
    expect([trancheMode(true, true), trancheMode(false, true), trancheMode(false, false)]).toEqual(['buy', 'sell', 'wait']);
    expect(trancheCheckText({ key: 'bht', ok: false, value: 68.2, need: 75 }, 'es')).toBe('BHT ≥ 75 (68.2)');
    expect(trancheCheckText({ key: 'trendBroken', ok: false, value: 1, need: 3 }, 'en')).toContain('(1/3)');
  });
});
