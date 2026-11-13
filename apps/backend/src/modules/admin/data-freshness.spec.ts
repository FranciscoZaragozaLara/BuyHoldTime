import { addDays, DATA_SOURCES, daysBetween, evaluateSource, freshnessStatus, summarize, toRunInfo } from './data-freshness';

describe('data-freshness', () => {
  test('daysBetween y estatus por umbrales', () => {
    expect(daysBetween('2026-11-10', '2026-11-13')).toBe(3);
    expect(freshnessStatus('2026-11-10', '2026-11-13', 4, 8)).toBe('fresh');
    expect(freshnessStatus('2026-11-07', '2026-11-13', 4, 8)).toBe('late');
    expect(freshnessStatus('2026-11-01', '2026-11-13', 4, 8)).toBe('stale');
    expect(freshnessStatus(null, '2026-11-13', 4, 8)).toBe('missing');
  });

  test('la fuente vale lo que su serie más atrasada; serie sin dato → missing', () => {
    const cfg = DATA_SOURCES.find((s) => s.id === 'fred_daily')!;
    const r = evaluateSource(cfg, [{ series: 'DGS10', d: '2026-11-10' }, { series: 'VIXCLS', d: '2026-11-12' }], '2026-11-13');
    expect(r).toMatchObject({ lastDate: '2026-11-10', ageDays: 3, status: 'fresh' });
    expect(r.series.map((s) => s.status)).toEqual(['fresh', 'fresh']);
    expect(evaluateSource(cfg, [{ series: 'DGS10', d: null }], '2026-11-13').status).toBe('missing');
    expect(evaluateSource(cfg, [], '2026-11-13').status).toBe('missing');
    expect(evaluateSource(cfg, [], '2026-11-13', 'boom')).toMatchObject({ status: 'missing', error: 'boom' });
  });

  test('retrasos de publicación: CPI de octubre y PIB del 3T están al día a mediados de noviembre', () => {
    const today = '2026-11-13';
    const cpi = DATA_SOURCES.find((s) => s.id === 'fred_inflation')!;
    const gdp = DATA_SOURCES.find((s) => s.id === 'fred_gdp')!;
    expect(evaluateSource(cpi, [{ series: 'CPIAUCSL', d: '2026-10-01' }], today).status).toBe('fresh');
    expect(evaluateSource(gdp, [{ series: 'GDP', d: '2026-07-01' }], today).status).toBe('fresh');
    expect(evaluateSource(cpi, [{ series: 'CPIAUCSL', d: '2026-09-01' }], today).status).toBe('late');
    expect(evaluateSource(cpi, [{ series: 'CPIAUCSL', d: '2026-08-01' }], today).status).toBe('stale');
  });

  test('configuración: ids únicos, umbrales coherentes y SQL sin punto y coma', () => {
    const ids = DATA_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DATA_SOURCES) {
      expect(s.staleDays).toBeGreaterThan(s.lateDays);
      expect(s.sql).not.toContain(';');
      expect(s.sql).toMatch(/AS series/);
    }
  });

  test('summarize cuenta por estatus', () => {
    const base = { type: 'api', cadence: 'daily', lateDays: 1, staleDays: 2, lastDate: null, ageDays: null, series: [] } as any;
    expect(summarize([{ ...base, id: 'a', status: 'fresh' }, { ...base, id: 'b', status: 'stale', runFailing: true }, { ...base, id: 'c', status: 'fresh' }]))
      .toEqual({ fresh: 2, late: 0, stale: 1, missing: 0, failingRuns: 1 });
  });
  test('fecha esperada del próximo dato y corrida fallida', () => {
    const finra = DATA_SOURCES.find((s) => s.id === 'finra_margin')!;
    const run = toRunInfo({ last: JSON.stringify({ status: 'error', process: 'daily_update.py', finishedAt: '2026-11-13T03:10:00Z', rows: null, message: '403' }), last_ok: '2026-11-12T03:10:00Z' });
    const r = evaluateSource(finra, [{ series: 'FINRA_DEBIT', d: '2026-09-01' }], '2026-11-13', undefined, run);
    expect(r.expectedBy).toBe(addDays('2026-09-01', 85));
    expect(r.expectedBy).toBe('2026-11-25');
    expect(r).toMatchObject({ status: 'fresh', runFailing: true, lastOkAt: '2026-11-12T03:10:00.000Z' });
    expect(r.lastRun).toMatchObject({ status: 'error', message: '403', process: 'daily_update.py' });
    expect(toRunInfo(undefined)).toEqual({ lastRun: null, lastOkAt: null });
  });
});
