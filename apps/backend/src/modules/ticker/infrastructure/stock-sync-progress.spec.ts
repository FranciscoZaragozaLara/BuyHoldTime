import { applyEdgarLine, applyGuruStatus, emptyPhase, LOG_LINES } from './stock-sync-progress';

describe('applyEdgarLine', () => {
  test('total, acción actual y fondos omitidos cuentan como avance', () => {
    const p = emptyPhase(), sk = { n: 0 };
    applyEdgarLine(p, 'Found 5 tickers in database.', sk);
    expect([p.done, p.total]).toEqual([0, 5]);
    applyEdgarLine(p, '\n>>> Skipping Fund/ETF/ADR SPY (Uses Sector/Index Benchmark)...', sk);
    expect(p.done).toBe(1);
    applyEdgarLine(p, '[1/5] EXTRACTING & UPDATING STOCK: AAPL (Apple Inc.)', sk);
    expect([p.done, p.current]).toEqual([1, 'AAPL']); // AAPL aún en curso
    applyEdgarLine(p, '[2/5] EXTRACTING & UPDATING STOCK: NVDA (NVIDIA)', sk);
    expect([p.done, p.current]).toEqual([2, 'NVDA']);
    applyEdgarLine(p, 'ALL STOCKS EXTRACTION & SYNC COMPLETED SUCCESSFULLY!', sk);
    expect([p.done, p.current]).toEqual([5, null]);
  });
  test('guarda solo las últimas líneas relevantes', () => {
    const p = emptyPhase(), sk = { n: 0 };
    for (let k = 1; k <= 30; k++) applyEdgarLine(p, `[${k}/30] EXTRACTING & UPDATING STOCK: T${k} (x)`, sk);
    expect(p.log).toHaveLength(LOG_LINES);
    expect(p.log[p.log.length - 1]).toBe('T30 (30/30)');
    expect(applyEdgarLine(p, 'Summary Table of Extracted Quarters', sk)).toBe(false);
  });
});

describe('applyGuruStatus', () => {
  const started = '2026-11-18T10:00:00.000Z';
  test('en curso: toma el avance si GuruFocus lo reporta', () => {
    const p = { ...emptyPhase(), state: 'running' as const, startedAt: started };
    const fin = applyGuruStatus(p, { running: true, lastStartedAt: started, lastFinishedAt: null, lastSummary: null, progress: { phase: 'scrape', done: 3, total: 70, current: 'NVDA' } }, 'x');
    expect(fin).toBe(false);
    expect([p.done, p.total, p.current, p.message]).toEqual([3, 70, 'NVDA', 'Scrapeando']);
  });
  test('terminado después del inicio: done con resumen; un fin anterior no cuenta', () => {
    const p = { ...emptyPhase(), state: 'running' as const, startedAt: started };
    expect(applyGuruStatus(p, { running: false, lastStartedAt: '2026-11-18T06:00:00Z', lastFinishedAt: '2026-11-18T07:00:00.000Z', lastSummary: { planned: 70 } }, 'x')).toBe(false);
    expect(applyGuruStatus(p, { running: false, lastStartedAt: started, lastFinishedAt: '2026-11-18T10:40:00.000Z', lastSummary: { planned: 70, ok: 68 } }, 'now')).toBe(true);
    expect([p.state, p.done, p.total, p.finishedAt]).toEqual(['done', 70, 70, 'now']);
    expect(p.summary).toEqual({ planned: 70, ok: 68 });
  });
  test('terminado sin resumen: error (job abortado)', () => {
    const p = { ...emptyPhase(), state: 'running' as const, startedAt: started };
    applyGuruStatus(p, { running: false, lastStartedAt: started, lastFinishedAt: '2026-11-18T10:01:00.000Z', lastSummary: null }, 'now');
    expect(p.state).toBe('error');
  });
});
