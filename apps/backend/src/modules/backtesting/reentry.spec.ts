import { NET_RULE, REENTRY_CFG, bvTarget, dsTarget, r1eTarget, type ReentryCtx } from './reentry';

const base: ReentryCtx = { k: 0, px: 105, bht: 60, hi252: 120, s50: 100, s50prev: 99, s200: 110, corrected: false, credit: false, oasOff: -20, capeRel: 1.1, oasFrom63: -5 };
const c = (o: Partial<ReentryCtx>) => ({ ...base, ...o });

describe('red de seguridad de reentrada', () => {
  test('Bv: BHT < 50 → 50%, < 40 → 100%, solo con rebote sobre la SMA50 ascendente', () => {
    expect(bvTarget(c({ bht: 48 }))).toBe(0.5);
    expect(bvTarget(c({ bht: 38 }))).toBe(1);
    expect(bvTarget(c({ bht: 55 }))).toBe(0);
    expect(bvTarget(c({ bht: 38, px: 95 }))).toBe(0); // bajo la SMA50
    expect(bvTarget(c({ bht: 38, s50prev: 101 }))).toBe(0); // SMA50 bajando
  });
  test('Bv y Ds exigen CAPE ≤ 1.25× su mediana y sin crisis de crédito (2001: CAPE 1.9×)', () => {
    expect(bvTarget(c({ bht: 38, capeRel: 1.9 }))).toBe(0);
    expect(bvTarget(c({ bht: 38, credit: true }))).toBe(0);
    expect(dsTarget(c({ bht: 30, oasFrom63: -15, capeRel: 1.9 }))).toBe(0);
    expect(dsTarget(c({ bht: 30, oasFrom63: -15, credit: true }))).toBe(0);
  });
  test('Ds: con el crédito aliviándose compra sin esperar rebote, escalonado 45/40/35', () => {
    const d = (bht: number) => dsTarget(c({ bht, px: 90, oasFrom63: -12 }));
    expect([d(46), d(44), d(39), d(34)]).toEqual([0, 0.5, 0.75, 1]);
    expect(dsTarget(c({ bht: 34, px: 90, oasFrom63: -5 }))).toBe(0); // crédito aún sin aliviar
    expect(REENTRY_CFG.ds.ease).toBe(10);
  });
  test('R1e: solo tras una corrección posterior a la venta, en máximo de 12 meses con tendencia alcista y BHT < 70', () => {
    const at = c({ px: 120, hi252: 120, s50: 112, s200: 110, bht: 60 });
    expect(r1eTarget(at)).toBe(0);
    expect(r1eTarget({ ...at, corrected: true })).toBe(1);
    expect(r1eTarget({ ...at, corrected: true, bht: 72 })).toBe(0);
    expect(r1eTarget({ ...at, corrected: true, s50: 108 })).toBe(0);
  });
  test('NET_RULE toma la mayor y dice cuál regla fue', () => {
    expect(NET_RULE(c({ bht: 48 }))).toEqual({ target: 0.5, rule: 'Bv' });
    expect(NET_RULE(c({ bht: 34, px: 90, oasFrom63: -12 }))).toEqual({ target: 1, rule: 'Ds' });
    expect(NET_RULE(c({}))).toEqual({ target: 0, rule: 'Bv' });
  });
});
