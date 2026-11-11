import { BacktestingService } from "../modules/backtesting/backtesting.service";

/**
 * SALVAGUARDA: el parser FRED del live no debe aceptar páginas HTML de error.
 * Regresión oct-2026: FRED sirvió error HTML y el live devolvía
 * {close:400,date:"<link href",source:"FRED"} para los 12 tickers FRED —
 * las cards pintaban 400.00% y "hace NaNh". Debe caer a db-fallback/none.
 */

const FRED_HTML_ERROR = `<html><head><link href="/fred.css" rel="stylesheet"></head><body><h1>400 Bad Request</h1></body></html>`;
const FRED_CSV_OK = `observation_date,CPIAUCSL\n2026-08-01,323.976\n2026-09-01,324.8\n`;

describe("Live FRED parser guard Suite", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  function svcWithDb(row: any) {
    return new BacktestingService({ btMarketData: { findFirst: async () => row } } as any);
  }

  it("página HTML de error => no devuelve basura (cae a db-fallback)", async () => {
    (global as any).fetch = async () => ({ ok: true, text: async () => FRED_HTML_ERROR });
    const svc = svcWithDb({ close: 324.8, date: new Date('2026-09-01') });
    const r: any = await svc.getLivePrice('CPIAUCSL');
    expect(r.source).toBe('db-fallback');
    expect(r.close).toBeCloseTo(324.8, 4);
    expect(r.date).toBe('2026-09-01');
  });

  it("página HTML de error sin fila DB => source none, close null", async () => {
    (global as any).fetch = async () => ({ ok: true, text: async () => FRED_HTML_ERROR });
    const svc = svcWithDb(null);
    const r: any = await svc.getLivePrice('DGS10');
    expect(r.source).toBe('none');
    expect(r.close).toBeNull();
  });

  it("CSV válido => resultado FRED normal", async () => {
    (global as any).fetch = async () => ({ ok: true, text: async () => FRED_CSV_OK });
    const svc = svcWithDb(null);
    const r: any = await svc.getLivePrice('CPIAUCSL');
    expect(r.source).toBe('FRED');
    expect(r.close).toBeCloseTo(324.8, 4);
    expect(r.date).toBe('2026-09-01');
  });
});
