import { MarketSyncService } from "../modules/market-data/market-sync.service";

/**
 * SALVAGUARDA: el stream (/daily/stream) es el proceso completo on-demand.
 * Al iniciar dispara daily_update.py + BH patch en background UNA sola vez
 * aunque se presione el botón en indicadores y regímenes a la vez.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("MarketSync full-sync guard Suite", () => {
  it("dispara el full sync una sola vez ante llamadas concurrentes", async () => {
    const svc = new MarketSyncService({} as any);
    let pyCalls = 0;
    let bhCalls = 0;
    (svc as any).runPython = async () => { pyCalls++; await sleep(50); };
    (svc as any).patchBHPerformance = async () => { bhCalls++; };
    (svc as any).runTsScript = async () => {};
    (svc as any).kickFullSyncBackground();
    (svc as any).kickFullSyncBackground();
    await sleep(150);
    expect(pyCalls).toBe(1);
    expect(bhCalls).toBe(1);
  });

  it("permite una nueva corrida cuando la anterior terminó", async () => {
    const svc = new MarketSyncService({} as any);
    let pyCalls = 0;
    (svc as any).runPython = async () => { pyCalls++; };
    (svc as any).patchBHPerformance = async () => {};
    (svc as any).runTsScript = async () => {};
    (svc as any).kickFullSyncBackground();
    await sleep(50);
    (svc as any).kickFullSyncBackground();
    await sleep(50);
    expect(pyCalls).toBe(2);
  });

  it("tras el sync recalcula la cola del termómetro + BHT (últimos 7 días)", async () => {
    const svc = new MarketSyncService({} as any);
    const calls: Array<{ script: string; env: any }> = [];
    (svc as any).runPython = async () => {};
    (svc as any).patchBHPerformance = async () => {};
    (svc as any).runTsScript = async (script: string, env: any) => { calls.push({ script, env }); };
    await svc.runNow();
    expect(calls.map((c) => c.script)).toEqual([
      'prisma/compute-thermo-history.ts',
      'prisma/compute-bht-forward.ts',
    ]);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    for (const c of calls) expect(c.env.FROM).toBe(weekAgo);
  });
});
