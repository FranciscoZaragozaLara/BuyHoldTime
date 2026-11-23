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
    // pasada la publicación de octubre (~13 nov) y su margen, tener solo septiembre es estar atrasado
    expect(evaluateSource(cpi, [{ series: 'CPIAUCSL', d: '2026-09-01' }], '2026-11-20').status).toBe('late');
    expect(evaluateSource(cpi, [{ series: 'CPIAUCSL', d: '2026-08-01' }], '2026-11-20').status).toBe('stale');
  });

  test('el dato mensual sigue al día hasta que sale el siguiente periodo (CPI, M2, Shiller)', () => {
    const src = (id: string) => DATA_SOURCES.find((s) => s.id === id)!;
    // CPI de octubre al 15-dic (el de noviembre sale ~10-15 dic)
    expect(evaluateSource(src('fred_inflation'), [{ series: 'CPIAUCSL', d: '2026-10-01' }], '2026-12-15').status).toBe('fresh');
    // M2 de septiembre al 27-nov (octubre sale ~24-27 nov)
    expect(evaluateSource(src('fred_money_housing'), [{ series: 'M2SL', d: '2026-09-01' }], '2026-11-27').status).toBe('fresh');
    // E10 de octubre al 3-dic (noviembre se publica ~3 dic)
    expect(evaluateSource(src('shiller_cape'), [{ series: 'E10', d: '2026-10-01' }], '2026-12-03').status).toBe('fresh');
  });

  test('WTI semanal dentro de FRED diario: umbrales propios; la fuente toma la peor serie con sus umbrales', () => {
    const fred = DATA_SOURCES.find((s) => s.id === 'fred_daily')!;
    const rows = [{ series: 'DGS10', d: '2026-11-19' }, { series: 'DCOILWTICO', d: '2026-11-17' }];
    const r = evaluateSource(fred, rows, '2026-11-23');
    expect(r.status).toBe('fresh');
    expect(r.lastDate).toBe('2026-11-17');
    expect(r.expectedBy).toBe('2026-11-23'); // DGS10 + 4 días
    expect(evaluateSource(fred, [{ series: 'DGS10', d: '2026-11-17' }, { series: 'DCOILWTICO', d: '2026-11-17' }], '2026-11-23').status).toBe('late');
    expect(evaluateSource(fred, [{ series: 'DGS10', d: '2026-11-21' }, { series: 'DCOILWTICO', d: '2026-11-04' }], '2026-11-23').status).toBe('stale');
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
