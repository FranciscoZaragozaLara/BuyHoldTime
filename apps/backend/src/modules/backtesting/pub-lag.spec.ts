import { lagSeries, withPubLag, PUB_LAG_DAYS, getMarginGdpRatio, computeThermoDay } from './thermo-history';

describe('rezago de publicación', () => {
  it('corre las fechas y no corre dos veces', () => {
    const m = new Map([['2026-10-01', 1]]);
    const l = lagSeries(m, 50);
    expect([...l.keys()]).toEqual(['2026-11-20']);
    expect(lagSeries(l, 50)).toBe(l);
    expect(lagSeries(m, 50)).toBe(l); // memorizado
  });
  it('solo toca las series con rezago', () => {
    const s = { FINRA_DEBIT: new Map([['2026-10-01', 1]]), VIXCLS: new Map([['2026-10-01', 20]]) };
    const L = withPubLag(s);
    expect(L.VIXCLS).toBe(s.VIXCLS);
    expect(L.FINRA_DEBIT.has('2026-10-01')).toBe(false);
    expect(PUB_LAG_DAYS.GDP).toBe(120);
  });
  it('el dato FINRA de octubre no se ve antes de su publicación', () => {
    const s = withPubLag({
      FINRA_DEBIT: new Map([['2026-09-01', 1000], ['2026-10-01', 2000]]),
      GDP: new Map([['2026-04-01', 100]]),
    });
    expect(getMarginGdpRatio(s, '2026-11-10')).toBeCloseTo(1); // aún septiembre
    expect(getMarginGdpRatio(s, '2026-11-21')).toBeCloseTo(2); // ya octubre
  });
  it('computeThermoDay acepta series ya corridas sin correrlas otra vez', () => {
    const s = { VIXCLS: new Map([['2026-11-20', 20]]), MSACSR: new Map([['2026-09-01', 9]]) };
    const a = computeThermoDay('2026-11-20', s, { cape: null, ratio: null });
    const b = computeThermoDay('2026-11-20', withPubLag(s), { cape: null, ratio: null });
    expect(b).toEqual(a);
    expect(a!.parts.find((p) => p.key === 'MS')?.value).toBe(9);
  });
});

import { creditFromBaa, HY_BAA_SCALE } from './thermo-history';
describe('serie de crédito del modelo', () => {
  it('es 1.913477 × BAA10Y (la misma escala del histórico) y se memoriza por mapa', () => {
    const baa = new Map([['2008-12-15', 6.1]]);
    const c = creditFromBaa(baa)!;
    expect(c.get('2008-12-15')).toBeCloseTo(11.6722, 3);
    expect(creditFromBaa(baa)).toBe(c);
    expect(HY_BAA_SCALE).toBe(1.913477);
  });
});
