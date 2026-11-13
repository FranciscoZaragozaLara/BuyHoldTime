import { describe, expect, test } from 'vitest';
import { strategyLabel } from './strategyLabel';

describe('strategyLabel', () => {
  test('el administrador ve el código interno', () => {
    expect(strategyLabel({ code: 'BH_QQQ', name: 'Buy & Hold QQQ' }, true)).toBe('BH_QQQ');
  });
  test('los visitantes ven el nombre', () => {
    expect(strategyLabel({ code: 'BH_QQQ', name: 'Buy & Hold QQQ' }, false)).toBe('Buy & Hold QQQ');
  });
  test('sin nombre: el código en formato legible', () => {
    expect(strategyLabel({ code: 'SPY_BH_2010', name: '' }, false)).toBe('Spy Bh 2010');
    expect(strategyLabel({ code: 'SPY_BH_2010' }, false)).toBe('Spy Bh 2010');
  });
});
