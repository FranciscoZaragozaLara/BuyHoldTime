import { GetTickersUseCase } from './get-tickers.use-case';

// GET /tickers debe servir el resumen (sin series históricas): con ellas pesaba ~1.9–2.4 MB
// y Next no lo guardaba en su data cache (límite 2 MB), así que se pedía en cada render.
describe('GetTickersUseCase', () => {
  test('usa findAllSummary, no findAll (que trae las series completas para el sync)', async () => {
    const summary = [{ symbol: 'AAPL' }] as any;
    const repo: any = {
      findAll: jest.fn(async () => { throw new Error('no debe llamarse'); }),
      findAllSummary: jest.fn(async () => summary),
    };
    const out = await new GetTickersUseCase(repo).execute();
    expect(out.map((t) => t.symbol)).toEqual(['AAPL']);
    expect(repo.findAllSummary).toHaveBeenCalledTimes(1);
    expect(repo.findAll).not.toHaveBeenCalled();
  });

  test('con cotizaciones de más de 15 minutos responde lo guardado y refresca todas en segundo plano', async () => {
    const now = Date.parse('2026-11-25T20:00:00Z');
    const list = [{ symbol: 'SPY', updatedAt: new Date(now - 16 * 60e3) }, { symbol: 'QQQ', updatedAt: new Date(now - 20 * 60e3) }] as any;
    const repo: any = { findAllSummary: jest.fn(async () => list) };
    const fast: any = { refreshAllInBackground: jest.fn(() => true) };
    expect((await new GetTickersUseCase(repo, fast).execute(now)).length).toBe(2);
    expect(fast.refreshAllInBackground).toHaveBeenCalledTimes(1);
  });
  test('si la cotización más reciente tiene menos de 15 minutos no refresca', async () => {
    const now = Date.parse('2026-11-25T20:00:00Z');
    const repo: any = { findAllSummary: jest.fn(async () => [{ symbol: 'SPY', updatedAt: new Date(now - 5 * 60e3) }]) };
    const fast: any = { refreshAllInBackground: jest.fn() };
    await new GetTickersUseCase(repo, fast).execute(now);
    expect(fast.refreshAllInBackground).not.toHaveBeenCalled();
  });

  test('agrega los niveles (ATH, último piso, rendimientos) con los cierres y el precio en vivo; caché por día', async () => {
    const now = Date.parse('2025-06-03T20:00:00Z');
    const closes = new Map([['SPY', [
      { date: '2024-12-31', close: 100 }, { date: '2025-02-03', close: 120 }, { date: '2025-04-01', close: 96 }, { date: '2025-06-02', close: 110 },
    ]]]);
    const repo: any = {
      findAllSummary: jest.fn(async () => [{ symbol: 'SPY', price: 108, updatedAt: new Date(now - 60e3) }, { symbol: 'NEW', price: 50, updatedAt: new Date(now) }]),
      latestCloseDate: jest.fn(async () => '2025-06-02'),
      findAllCloses: jest.fn(async () => closes),
      findAllQuarterlyFundamentals: jest.fn(async () => new Map([['SPY', []], ['NEW', [
        { date: '2025-03-31', revenue: 40, eps: 1, operatingIncome: 8 }, { date: '2024-12-31', revenue: 30, eps: 1, operatingIncome: 6 },
        { date: '2024-09-30', revenue: 20, eps: 1, operatingIncome: 4 }, { date: '2024-06-30', revenue: 10, eps: 1, operatingIncome: 2 },
      ]]])),
    };
    const uc = new GetTickersUseCase(repo);
    const [spy, nw] = await uc.execute(now);
    expect(spy.levels).toMatchObject({ ath: 120, athDate: '2025-02-03', bottom: 96, bottomDate: '2025-04-01' });
    expect(spy.levels!.fromAth).toBeCloseTo(-10, 6);
    expect(spy.levels!.fromBottom).toBeCloseTo(12.5, 6);
    expect(spy.levels!.perfYTD).toBeCloseTo(8, 6);
    expect(nw.levels).toBeNull(); // sin historia
    expect(spy.fundamentals).toBeNull(); // ETF: sin trimestres
    expect(nw.fundamentals!.revenue).toEqual({ ttm: 100, prev: null, yoy: null, lastQuarter: '2025-03-31' });
    expect(nw.fundamentals!.eps!.ttm).toBe(4);
    expect(nw.fundamentals!.margin).toEqual({ now: 20, prev: null });
    await uc.execute(now + 60e3);
    expect(repo.findAllCloses).toHaveBeenCalledTimes(1); // mismo último cierre y mismo día: usa la caché
    expect(repo.findAllQuarterlyFundamentals).toHaveBeenCalledTimes(1);
  });
});
