import { describe, expect, it } from 'vitest';
import { ladderBadgesOn } from './ladderBadges';
import { NET_COLOR } from './valuationChart';

describe('ladderBadgesOn', () => {
  const voo = { buys: [{ date: '2022-11-23', id: 'T1' as const, price: 1, size: 1, backup: false }], sells: [{ date: '2021-09-17', id: 'V4' as const, price: 1, credit: false }], net: [{ date: '2022-09-26', rule: 'Ds', pct: 50, price: 1 }] };
  const qqq = { buys: [{ date: '2022-11-23', id: 'T1' as const, price: 1, size: 1, backup: false }], sells: [{ date: '2021-09-22', id: 'V1' as const, price: 1, credit: false }], net: [{ date: '2022-09-26', rule: 'Ds', pct: 50, price: 1 }] };
  it('el mismo evento en las dos rutas sale una vez con ambas', () => {
    expect(ladderBadgesOn('2022-11-23', { voo, qqq }, ['voo', 'qqq'])).toEqual([{ kind: 'buy', code: 'T1', name: 'Pánico terminando', color: expect.any(String), routes: ['voo', 'qqq'] }]);
    const net = ladderBadgesOn('2022-09-26', { voo, qqq }, ['voo', 'qqq']);
    expect(net[0]).toMatchObject({ kind: 'net', code: 'R50', color: NET_COLOR.Ds, routes: ['voo', 'qqq'] });
  });
  it('solo la ruta pedida; sin eventos → vacío', () => {
    expect(ladderBadgesOn('2021-09-17', { voo, qqq }, ['qqq'])).toEqual([]);
    expect(ladderBadgesOn('2021-09-17', { voo, qqq }, ['voo'])[0]).toMatchObject({ kind: 'sell', code: 'V4', name: 'Primera grieta' });
    expect(ladderBadgesOn('2021-09-22', { voo, qqq }, ['voo', 'qqq'], false)[0]).toMatchObject({ code: 'V1', name: 'Greed', routes: ['qqq'] });
  });
});
