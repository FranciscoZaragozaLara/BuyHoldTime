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
});
