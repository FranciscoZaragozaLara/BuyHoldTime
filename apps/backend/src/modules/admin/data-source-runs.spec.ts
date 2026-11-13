import { logSourceRun, runStatus, SourceRunTracker } from './data-source-runs';
import { sourceForSeries } from './data-freshness';

describe('data-source-runs', () => {
  test('runStatus', () => {
    expect(runStatus(3, 0)).toBe('ok');
    expect(runStatus(0, 2)).toBe('error');
    expect(runStatus(2, 1)).toBe('partial');
  });

  test('sourceForSeries mapea series de bt_market_data a su fuente', () => {
    expect(sourceForSeries('DGS10')).toBe('fred_daily');
    expect(sourceForSeries('CPIAUCSL')).toBe('fred_inflation');
    expect(sourceForSeries('FEAR_GREED')).toBe('cnn_fear_greed');
    expect(sourceForSeries('QQQ')).toBe('etf_prices');
    expect(sourceForSeries('NOPE')).toBeNull();
  });

  test('el tracker agrupa por fuente y resume ok/partial/error con mensajes', () => {
    const t = new SourceRunTracker('market-sync stream', new Date('2026-11-13T20:00:00Z'));
    t.add('DGS10', true, 5); t.add('DGS2', false, 0, '500'); t.add('FEAR_GREED', true, 1); t.add('XYZ', true);
    t.add('cnn_fear_greed', true, 0, undefined, true);
    const runs = Object.fromEntries(t.runs().map((r) => [r.source, r]));
    expect(Object.keys(runs).sort()).toEqual(['cnn_fear_greed', 'fred_daily']);
    expect(runs.fred_daily).toMatchObject({ status: 'partial', rows: 5, message: 'DGS2: 500', process: 'market-sync stream' });
    expect(runs.cnn_fear_greed).toMatchObject({ status: 'ok', rows: 1 });
  });

  test('logSourceRun nunca lanza y recorta el mensaje', async () => {
    const created: any[] = [];
    await logSourceRun({ dataSourceRun: { create: async ({ data }) => { created.push(data); } } }, { source: 'x', process: 'p', startedAt: new Date(), status: 'error', message: 'e'.repeat(2000) });
    expect(created[0].message).toHaveLength(1000);
    await expect(logSourceRun({ dataSourceRun: { create: async () => { throw new Error('db down'); } } }, { source: 'x', process: 'p', startedAt: new Date(), status: 'ok' })).resolves.toBeUndefined();
  });
});
