import { describe, expect, it } from 'vitest';
import { buildValuationChart, signalMarkers, signalState, CROSS_MIN_SESSIONS, SIGNAL_COOLDOWN, type ChartPoint, type DailyValuation, type MonthlyRow } from './valuationChart';

const monthly: MonthlyRow[] = [
  { date: '1989-11', sp500Price: 340, peRatio: 14, shillerPe: 17 },
  { date: '1989-12', sp500Price: 350, peRatio: 14.5, shillerPe: 17.5 },
  { date: '1990-01', sp500Price: 330, peRatio: 13.9, shillerPe: 17.1 },
];

describe('valuationChart', () => {
  it('sin serie diaria: puntos mensuales con EMA aproximada en meses (comportamiento previo)', () => {
    const p = buildValuationChart(monthly, null);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01']);
    expect(p[0].sp500PriceMa50).toBe(340);
    expect(p[1].sp500PriceMa50).toBeCloseTo(340 + 10 * (2 / 3.4), 2);
    expect(p.every((x) => !x.daily)).toBe(true);
  });
  it('híbrida: mensual antes del primer día diario, diaria después; EMA continua', () => {
    const daily: DailyValuation = { dates: ['1990-01-01', '1990-01-02', '1990-01-03'], spx: [null, 353.4, 355.67], pe: [null, 15.1, 15.2], cape: [17.9, 17.95, 18.0], bht: [null, 52.3, 71] };
    const p = buildValuationChart(monthly, daily);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01', '1990-01-02', '1990-01-03']);
    expect(p[2]).toMatchObject({ daily: true, shillerPe: 17.9, sp500Price: undefined, sp500PriceMa50: undefined });
    const e50Dec = p[1].sp500PriceMa50!;
    expect(p[3].sp500PriceMa50).toBeCloseTo(e50Dec + (353.4 - e50Dec) * (2 / 51), 1); // sembrada con el mensual
    expect(Math.abs(p[3].sp500PriceMa200! - p[1].sp500PriceMa200!)).toBeLessThan(1);
    expect(p.map((x) => x.bht)).toEqual([undefined, undefined, undefined, 52.3, 71]); // BHT del día solo en el tramo diario
  });
  it('Nasdaq 100 / TQQQ: sin tramo mensual; precio, P/E y EMA del instrumento; CAPE y BHT del mercado', () => {
    const daily: DailyValuation = {
      dates: ['1999-03-09', '1999-03-10', '1999-03-11'], spx: [1280, 1286, 1290], pe: [30, 30.1, 30.2], cape: [40, 40.1, 40.2], bht: [70, 71, 72],
      qqq: [null, 100, 102], tqqq: [null, null, null], ndxPe: [null, 70, 71.4],
    };
    const n = buildValuationChart(monthly, daily, 'ndx');
    expect(n.every((x) => x.daily)).toBe(true);
    expect(n.map((x) => [x.sp500Price, x.peRatio, x.shillerPe, x.bht])).toEqual([[undefined, undefined, 40, 70], [100, 70, 40.1, 71], [102, 71.4, 40.2, 72]]);
    expect(n[1].sp500PriceMa50).toBe(100); // EMA arranca con el primer precio del instrumento
    const t = buildValuationChart(monthly, daily, 'tqqq');
    expect(t.map((x) => x.peRatio)).toEqual([undefined, 70, 71.4]); // P/E del subyacente
    expect(t.every((x) => x.sp500Price === undefined)).toBe(true);
  });
});


describe('señales BHT × tendencia y cruces', () => {
  it('estado del día según la banda del BHT y la SMA 200', () => {
    expect(signalState(30, 'U')).toBe('strong');
    expect(signalState(30, 'PULLBACK')).toBe('strong');
    expect(signalState(30, 'D')).toBe('buy');
    expect(signalState(45, 'U')).toBe('buy');
    expect(signalState(45, 'D')).toBeNull();
    expect(signalState(55, 'U')).toBeNull();
    expect(signalState(55, 'R')).toBe('danger');
    expect(signalState(65, 'D')).toBe('danger');
    expect(signalState(75, 'U')).toBe('danger');
    expect(signalState(undefined, 'U')).toBeNull();
    expect(signalState(30, undefined)).toBeNull();
  });

  const day = (k: number) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10);
  const pts = (n: number, f: (k: number) => Partial<ChartPoint>): ChartPoint[] =>
    Array.from({ length: n }, (_, k) => ({ time: day(k), daily: true, sp500Price: 100, ...f(k) }));

  it('se marca al entrar en el estado, no cada día, y respeta la espera entre señales iguales', () => {
    // 0-9 miedo con tendencia alcista ($$), 10-14 neutral, 15-19 otra vez $$ (dentro de la espera), 45 de nuevo $$
    const p = pts(60, (k) => ({ bht: (k < 10 || (k >= 15 && k < 20) || k >= 45) ? 30 : 55, trend: 'U' }));
    const m = signalMarkers(p).filter((x) => x.kind === 'strong');
    expect(m.map((x) => x.time)).toEqual([day(0), day(45)]);
    expect(SIGNAL_COOLDOWN).toBe(40);
    expect(m[0]).toMatchObject({ text: '$$', position: 'belowBar' });
  });

  it('subir de $ a $$ no espera; $ después de $$ sí', () => {
    // 0-4 $ (BHT 45 alcista), 5-9 $$ (BHT 30 alcista), 10-14 $ otra vez → dentro de la espera, no se marca
    const p = pts(20, (k) => ({ bht: k < 5 ? 45 : k < 10 ? 30 : 45, trend: 'U' }));
    expect(signalMarkers(p).map((x) => [x.kind, x.time])).toEqual([['buy', day(0)], ['strong', day(5)]]);
  });

  it('peligro con BHT neutral y tendencia bajista', () => {
    const p = pts(10, (k) => ({ bht: 58, trend: k < 5 ? 'U' : 'D' }));
    expect(signalMarkers(p).map((x) => [x.kind, x.time])).toEqual([['danger', day(5)]]);
  });

  it('Golden Cross y Death Cross del precio (SMA 50 cruzando la SMA 200)', () => {
    // baja hasta la sesión 250, sube hasta la 450 (golden), vuelve a bajar (death)
    const price = (k: number) => (k < 250 ? 300 - k * 0.5 : k < 450 ? 175 + (k - 250) * 1.5 : 475 - (k - 450) * 2);
    const m = signalMarkers(pts(700, (k) => ({ sp500Price: price(k) })));
    expect(m.map((x) => x.kind)).toEqual(['golden', 'death']);
    expect(m[0]).toMatchObject({ text: 'Golden Cross', shape: 'arrowUp' });
    expect(m[1]).toMatchObject({ text: 'Death Cross', shape: 'arrowDown' });
    expect(CROSS_MIN_SESSIONS).toBe(10);
  });
});
