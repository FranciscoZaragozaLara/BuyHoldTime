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
    expect(out).toBe(summary);
    expect(repo.findAllSummary).toHaveBeenCalledTimes(1);
    expect(repo.findAll).not.toHaveBeenCalled();
  });

  test('con cotizaciones de más de 15 minutos responde lo guardado y refresca todas en segundo plano', async () => {
    const now = Date.parse('2026-11-25T20:00:00Z');
    const list = [{ symbol: 'SPY', updatedAt: new Date(now - 16 * 60e3) }, { symbol: 'QQQ', updatedAt: new Date(now - 20 * 60e3) }] as any;
    const repo: any = { findAllSummary: jest.fn(async () => list) };
    const fast: any = { refreshAllInBackground: jest.fn(() => true) };
    expect(await new GetTickersUseCase(repo, fast).execute(now)).toBe(list);
    expect(fast.refreshAllInBackground).toHaveBeenCalledTimes(1);
  });
  test('si la cotización más reciente tiene menos de 15 minutos no refresca', async () => {
    const now = Date.parse('2026-11-25T20:00:00Z');
    const repo: any = { findAllSummary: jest.fn(async () => [{ symbol: 'SPY', updatedAt: new Date(now - 5 * 60e3) }]) };
    const fast: any = { refreshAllInBackground: jest.fn() };
    await new GetTickersUseCase(repo, fast).execute(now);
    expect(fast.refreshAllInBackground).not.toHaveBeenCalled();
  });
});
