import { TickerSyncScheduler } from '../modules/ticker/infrastructure/ticker-sync.scheduler';

describe('TickerSyncScheduler', () => {
  const ok = { success: true, updatedCount: 3, errors: [] as string[] };
  let execute: jest.Mock;
  let scheduler: TickerSyncScheduler;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue(ok);
    scheduler = new TickerSyncScheduler({ execute } as any);
    delete process.env.TICKER_SYNC_CRON;
  });

  it('ejecuta el sync de tickers', async () => {
    await scheduler.handleDailyTickerSync();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('no se solapa si ya hay una ejecución en curso', async () => {
    let release!: () => void;
    execute.mockReturnValue(new Promise((r) => (release = () => r(ok))));
    const first = scheduler.handleDailyTickerSync();
    await scheduler.handleDailyTickerSync();
    expect(execute).toHaveBeenCalledTimes(1);
    release();
    await first;
    await scheduler.handleDailyTickerSync();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('no propaga errores y libera el candado', async () => {
    execute.mockRejectedValueOnce(new Error('yahoo caído'));
    await expect(scheduler.handleDailyTickerSync()).resolves.toBeUndefined();
    await scheduler.handleDailyTickerSync();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('se omite con TICKER_SYNC_CRON=off', async () => {
    process.env.TICKER_SYNC_CRON = 'off';
    await scheduler.handleDailyTickerSync();
    expect(execute).not.toHaveBeenCalled();
  });
  describe('EDGAR semanal', () => {
    let runTs: jest.SpyInstance;
    beforeEach(() => {
      runTs = jest.spyOn(scheduler as any, 'runTsScript').mockResolvedValue(undefined);
      delete process.env.EDGAR_SYNC_CRON;
    });

    it('lanza el script de EDGAR', async () => {
      await scheduler.handleWeeklyEdgarSync();
      expect(runTs).toHaveBeenCalledTimes(1);
      expect(runTs.mock.calls[0][0]).toBe('prisma/sync-all-stocks-edgar.ts');
    });

    it('no se solapa y libera el candado aunque falle', async () => {
      let release!: () => void;
      runTs.mockReturnValueOnce(new Promise<void>((r) => (release = r)));
      const first = scheduler.handleWeeklyEdgarSync();
      await scheduler.handleWeeklyEdgarSync();
      expect(runTs).toHaveBeenCalledTimes(1);
      release();
      await first;
      runTs.mockRejectedValueOnce(new Error('sec caído'));
      await expect(scheduler.handleWeeklyEdgarSync()).resolves.toBeUndefined();
      await scheduler.handleWeeklyEdgarSync();
      expect(runTs).toHaveBeenCalledTimes(3);
    });

    it('se omite con EDGAR_SYNC_CRON=off', async () => {
      process.env.EDGAR_SYNC_CRON = 'off';
      await scheduler.handleWeeklyEdgarSync();
      expect(runTs).not.toHaveBeenCalled();
    });
  });
});
