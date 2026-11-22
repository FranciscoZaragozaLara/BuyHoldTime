import { ExperimentalService } from './experimental.service';

describe('ExperimentalService', () => {
  it('summary y scores marcan experimental: true y no fallan sin datos', async () => {
    const prisma: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const svc = new ExperimentalService(prisma);
    const s = await svc.summary();
    expect(s.experimental).toBe(true);
    expect(s.basket.members).toEqual([]);
    expect(s.cohort.members).toEqual([]);
    expect((await svc.scores('canary_p_etf')).experimental).toBe(true);
  });
  it('EXP_CRON=off apaga los crons', async () => {
    const svc = new ExperimentalService({} as any);
    const spy = jest.spyOn(svc, 'run').mockResolvedValue({ ok: true, output: '' });
    process.env.EXP_CRON = 'off';
    await svc.nearClose();
    await svc.afterClose();
    expect(spy).not.toHaveBeenCalled();
    delete process.env.EXP_CRON;
  });
});
