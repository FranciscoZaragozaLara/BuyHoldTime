import { indicatorStatus, indicatorUpdates, monthEnd, monthlyLast, peMonthlyHistory, syncIndicatorsTable, valuationUpdates } from './indicator-sync';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('indicator-sync', () => {
  test('valores actuales: último dato ≤ hoy y CPI interanual', () => {
    const ups = indicatorUpdates({
      DFEDTARU: m({ '2026-11-10': 4.0, '2026-11-13': 4.0, '2026-12-01': 3.75 }),
      VIXCLS: m({ '2026-11-12': 17.49 }),
      FEAR_GREED: m({ '2026-11-14': 39 }),
      CPIAUCSL: m({ '2025-10-01': 320, '2026-10-01': 333.06 }),
    }, '2026-11-15');
    expect(ups).toEqual([
      { key: 'fed_rate', value: 4.0, status: 'Normal', asOf: '2026-11-13' },
      { key: 'vix', value: 17.49, status: 'Normal', asOf: '2026-11-12' },
      { key: 'fear_greed', value: 39, status: 'Fear', asOf: '2026-11-14' },
      { key: 'inflation', value: expect.closeTo(4.08, 2), status: 'High', asOf: '2026-10-01' },
    ]);
  });
  test('sin serie no se toca la fila', () => {
    expect(indicatorUpdates({}, '2026-11-15')).toEqual([]);
  });
  test('etiquetas', () => {
    expect(['vix', 'vix', 'vix'].map((k, i) => indicatorStatus(k, [12, 20, 30][i]))).toEqual(['Low', 'Normal', 'High']);
    expect([10, 30, 50, 60, 80].map((v) => indicatorStatus('fear_greed', v))).toEqual(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']);
    expect([1.5, 4, 5.25].map((v) => indicatorStatus('fed_rate', v))).toEqual(['Low', 'Normal', 'High']);
    expect(indicatorStatus('core_inflation', 2.87)).toBe('Normal');
  });
  test('escribe una fila por indicador con dato', async () => {
    const calls: unknown[][] = [];
    const db = {
      btMarketData: { findMany: async () => [{ ticker: 'DGS30', date: new Date('2026-11-13T00:00:00Z'), close: 4.86 }] },
      $executeRawUnsafe: async (...a: unknown[]) => { calls.push(a); return 1; },
      $queryRawUnsafe: async () => [],
    };
    const ups = await syncIndicatorsTable(db, new Date('2026-11-15T12:00:00Z'));
    expect(ups).toEqual([{ key: 'treasury_30y', value: 4.86, status: 'High', asOf: '2026-11-13' }]);
    expect(calls).toEqual([[expect.stringContaining('UPDATE indicators'), 4.86, 'High', 'treasury_30y']]);
  });
});

describe('valuación e historias derivadas', () => {
  const spx = m({ '2026-10-30': 7580.07, '2026-11-12': 7592.4, '2026-11-13': 7561.67 });
  const spxEps = m({ '2026-03-31': 272.94, '2026-06-30': 295.39 }); // jun se publica el 3 oct
  test('P/E con EPS registrado, Fwd PE con EPS de WSJ, CAPE y precio', () => {
    const u = valuationUpdates({ spx, spxEps, fwdEps: m({ '2026-11-13': 403.29 }), cape: m({ '2026-11-13': 39.81 }) }, '2026-11-15');
    const by = Object.fromEntries(u.map((x) => [x.key, x]));
    expect(by.sp500_price.value).toBe(7561.67);
    expect(by.pe_ratio.value).toBeCloseTo(7561.67 / 295.39, 6);
    expect(by.fwd_pe_ratio.value).toBeCloseTo(18.75, 2);
    expect(by.fwd_pe_ratio.status).toBe('Normal');
    expect(by.schiller_pe).toMatchObject({ value: 39.81, status: 'High' });
  });
  test('monthlyLast: último valor de cada mes posterior al corte, fecha fin de mes', () => {
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthlyLast(spx, '2026-09', '2026-11-15')).toEqual([{ date: '2026-10-31', value: 7580.07 }, { date: '2026-11-30', value: 7561.67 }]);
    expect(monthlyLast(spx, '2026-10', '2026-11-12')).toEqual([{ date: '2026-11-30', value: 7592.4 }]);
  });
  test('P/E mensual: Shiller antes de 1990, SPX ÷ EPS registrado después', () => {
    const pe = peMonthlyHistory({
      shillerPrice: m({ '1989-11-30': 340, '1989-12-31': 350, '1990-01-31': 330 }),
      shillerEarnings: m({ '1989-09-30': 25 }),
      spx, spxEps,
    }, '2026-11-15');
    expect(pe.slice(0, 2)).toEqual([{ date: '1989-11-30', value: 13.6 }, { date: '1989-12-31', value: 14 }]);
    expect(pe.map((p) => p.date)).toEqual(['1989-11-30', '1989-12-31', '2026-10-31', '2026-11-30']);
    expect(pe[2].value).toBeCloseTo(7580.07 / 295.39, 6); // 30 oct ya conoce el EPS de junio (publicado 3 oct)
  });
});
