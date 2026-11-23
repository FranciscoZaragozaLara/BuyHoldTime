import { latestReportFiling, symbolsToSync } from './edgar-new-filings';

describe('chequeo diario de reportes nuevos en EDGAR', () => {
  test('periodo del último 10-Q/10-K ignorando 8-K, formularios 4 y 144', () => {
    const sub = { filings: { recent: { form: ['4', '8-K', '144', '10-Q', '10-K', '8-K'], filingDate: ['2026-11-23', '2026-11-17', '2026-11-19', '2026-08-26', '2026-03-12', '2026-05-01'],
      reportDate: ['2026-11-19', '2026-11-17', '', '2026-07-26', '2026-01-25', '2026-04-30'] } } };
    expect(latestReportFiling(sub)).toBe('2026-07-26');
    expect(latestReportFiling({ filings: { recent: { form: ['8-K'], filingDate: ['2026-11-17'], reportDate: ['2026-11-17'] } } })).toBeNull();
    expect(latestReportFiling({})).toBeNull();
  });
  test('sincroniza solo las que reportaron un periodo posterior al último trimestre guardado (o sin datos)', () => {
    // V: el 10-K de sep ya está guardado como Q4 derivado (mismo periodo) → no se vuelve a sincronizar
    const stored = new Map<string, string | null>([['NVDA', '2026-07-26'], ['V', '2026-09-30'], ['CEG', '2026-06-30'], ['NEW', null]]);
    const latest = new Map<string, string | null>([['NVDA', '2026-07-26'], ['V', '2026-09-30'], ['CEG', '2026-09-30'], ['NEW', '2026-09-30'], ['FAIL', null]]);
    expect(symbolsToSync(stored, latest)).toEqual(['CEG', 'NEW']);
  });
});
