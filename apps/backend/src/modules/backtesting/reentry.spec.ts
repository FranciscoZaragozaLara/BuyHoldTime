import { NET_RULE, REENTRY_CFG, bvTarget, creditStressed, dsTarget, r1eTarget, simulateReentry, systemSince, type ReentryCtx } from './reentry';
import { prepareTranches, type TrancheSeries } from './tranches';

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
  test('Bv espera el alivio si el crédito sigue estresado (HY ≥ 1.5× su mínimo de 12 meses), como en 2008-09', () => {
    expect(creditStressed(c({ oasRel: 1.8, oasFrom63: -3 }))).toBe(true);
    expect(bvTarget(c({ bht: 38, oasRel: 1.8, oasFrom63: -3 }))).toBe(0);
    expect(bvTarget(c({ bht: 38, oasRel: 1.8, oasFrom63: -12 }))).toBe(1); // ya se alivia
    expect(bvTarget(c({ bht: 38, oasRel: 1.2, oasFrom63: -3 }))).toBe(1); // crédito normal
  });
});

describe('systemSince (vista Drawdowns)', () => {
  // 300 sesiones subiendo (BHT cruza 70 en la 250) y un desplome de 10 sesiones (−20%): vende en la caída y recompra.
  const n = 330;
  const dates = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10));
  const spx = dates.map((_, k) => (k < 300 ? 100 + k * 0.05 : k < 310 ? 115 * (1 - 0.022 * (k - 299)) : 90 + (k - 310)));
  const s: TrancheSeries = {
    dates, spx, qqq: spx, vix: dates.map((_, k) => (k < 300 ? 15 : 50)), vix3m: dates.map((_, k) => (k < 300 ? 17 : 38)),
    oas: dates.map(() => 4), cape: dates.map(() => 30), capeMedian20: dates.map(() => 25), bht: dates.map((_, k) => (k < 250 ? 50 : k < 304 ? 72 : 35)), // cruza 70 → abre el ciclo; sigue ≥ 70 en la primera debilidad
  };
  const P = prepareTranches(s, 'voo');
  test('aplicar las operaciones al mismo precio reproduce la simulación de la ruta', () => {
    const a = systemSince(P, '2020-03-01')!, b = systemSince(P, '2020-03-01', P.px)!;
    expect(b.system.pct).toBeCloseTo(a.system.pct, 9);
    expect(a.trades.length).toBeGreaterThan(0);
    expect(b.trades.map((t) => t.id)).toEqual(a.trades.map((t) => t.id));
    const sim = simulateReentry(P, NET_RULE, undefined, undefined, P.s.dates.indexOf('2020-03-01'));
    expect(a.system.cashPct).toBeCloseTo(sim.cashFrac[sim.kEnd] * 100, 9);
  });
  test('otro instrumento (TQQQ): mismas fechas y fracciones, con su propio precio; sin precio ese día → null', () => {
    const lev = P.px.map((p) => (p == null ? null : (p as number) * 3)); // mismo camino, escala distinta
    const a = systemSince(P, '2020-03-01')!, b = systemSince(P, '2020-03-01', lev, 'tqqq')!;
    expect(b.instrument).toBe('tqqq');
    expect(b.basePrice).toBeCloseTo(a.basePrice * 3, 9);
    expect(b.system.pct).toBeCloseTo(a.system.pct, 9);
    expect(b.trades.map((t) => [t.date, t.pctOfPortfolio.toFixed(6)])).toEqual(a.trades.map((t) => [t.date, t.pctOfPortfolio.toFixed(6)]));
    expect(systemSince(P, '2020-03-01', dates.map(() => null))).toBeNull();
  });
});
