import { describe, expect, it } from 'vitest';
import { buildValuationChart, signalMarkers, signalState, thinMarkers, DEATH_CROSS_MIN_BHT, CROSS_MIN_SESSIONS, SIGNAL_COOLDOWN, SIGNAL_REPEAT, type ChartPoint, type DailyValuation, type MonthlyRow } from './valuationChart';

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
    expect(signalState(55, 'U')).toBe('starter'); // primer tramo pequeño con BHT 50–60 y tendencia alcista
    expect(signalState(60.5, 'P')).toBe('starter');
    expect(signalState(64, 'U')).toBeNull();
    expect(signalState(55, 'R')).toBeNull(); // Rebote: sin alerta
    expect(signalState(65, 'D')).toBe('danger');
    expect(signalState(75, 'U')).toBeNull(); // rally con BHT alto y tendencia alcista: sin alerta
    expect(signalState(75, 'D')).toBe('danger');
    expect(signalState(undefined, 'U')).toBeNull();
    expect(signalState(30, undefined)).toBeNull();
  });

  const day = (k: number) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10);
  const pts = (n: number, f: (k: number) => Partial<ChartPoint>): ChartPoint[] =>
    Array.from({ length: n }, (_, k) => ({ time: day(k), daily: true, sp500Price: 100, ...f(k) }));

  it('se marca al entrar en el estado, no cada día, y respeta la espera entre señales iguales', () => {
    // 0-9 miedo con tendencia alcista ($$), 10-14 codicia (sin señal), 15-19 otra vez $$ (en la espera), 45 de nuevo $$
    const p = pts(60, (k) => ({ bht: (k < 10 || (k >= 15 && k < 20) || k >= 45) ? 30 : 65, trend: 'U' }));
    const m = signalMarkers(p).filter((x) => x.kind === 'strong');
    expect(m.map((x) => x.time)).toEqual([day(0), day(45)]);
    expect(SIGNAL_COOLDOWN).toBe(40);
    expect(m[0]).toMatchObject({ text: '$$', position: 'belowBar' });
  });

  it('subir de nivel (¼$ → $ → $$) no espera; bajar de nivel sí', () => {
    // 0-4 ¼$ (BHT 55), 5-9 $ (45), 10-14 $$ (30), 15-19 $ otra vez → dentro de la espera, no se marca
    const p = pts(20, (k) => ({ bht: k < 5 ? 55 : k < 10 ? 45 : k < 15 ? 30 : 45, trend: 'U' }));
    expect(signalMarkers(p).map((x) => [x.kind, x.time])).toEqual([['starter', day(0)], ['buy', day(5)], ['strong', day(10)]]);
    expect(signalMarkers(p)[0]).toMatchObject({ text: '¼$' });
  });

  it('recordatorio mensual mientras el estado de compra se mantiene', () => {
    // 70 sesiones seguidas con BHT 30 y tendencia alcista: $$ al entrar y cada 21 sesiones
    const p = pts(70, () => ({ bht: 30, trend: 'U' }));
    expect(signalMarkers(p).map((x) => x.time)).toEqual([day(0), day(21), day(42), day(63)]);
    expect(SIGNAL_REPEAT).toBe(21);
  });

  it('la alerta se repite solo si el precio subió desde la anterior', () => {
    // 50 sesiones en peligro (BHT 60, tendencia bajista): precio baja las primeras 30 y luego sube
    const p = pts(50, (k) => ({ bht: 60, trend: 'D', sp500Price: k < 30 ? 100 - k : 70 + (k - 30) * 3 }));
    const m = signalMarkers(p).filter((x) => x.kind === 'danger');
    // día 0 (entrada, precio 100); día 21 precio 79 < 100 → no; sube: día 40 precio 100 ≯ 100; día 41 precio 103 > 100 → sí
    expect(m.map((x) => x.time)).toEqual([day(0), day(41)]);
  });

  it('una alerta por episodio bajista: oscilar entre Bajista y Rebote no repite la alerta si el precio no subió', () => {
    // BHT 58; 0-4 alcista (¼$), 5-49 abajo de la SMA 200 alternando Bajista/Rebote cada 10 sesiones, precio bajando
    const p = pts(100, (k) => ({ bht: 58, trend: k < 5 ? 'U' : Math.floor((k - 5) / 10) % 2 === 0 ? 'D' : 'R', sp500Price: 100 - k * 0.2 }));
    expect(signalMarkers(p).filter((x) => x.kind === 'danger').map((x) => x.time)).toEqual([day(5)]);
  });

  it('peligro con BHT neutral y tendencia bajista', () => {
    const p = pts(10, (k) => ({ bht: 58, trend: k < 5 ? 'U' : 'D' }));
    // BHT 58: primer tramo pequeño mientras la tendencia es alcista; alerta al perder la SMA 200
    expect(signalMarkers(p).map((x) => [x.kind, x.time])).toEqual([['starter', day(0)], ['danger', day(5)]]);
  });

  it('Golden Cross y Death Cross del precio (SMA 50 cruzando la SMA 200)', () => {
    // baja hasta la sesión 250, sube hasta la 450 (golden), vuelve a bajar (death)
    const price = (k: number) => (k < 250 ? 300 - k * 0.5 : k < 450 ? 175 + (k - 250) * 1.5 : 475 - (k - 450) * 2);
    const m = signalMarkers(pts(700, (k) => ({ sp500Price: price(k) })));
    expect(m.map((x) => x.kind)).toEqual(['golden', 'death']);
    expect(m[0]).toMatchObject({ text: 'Golden Cross', shape: 'arrowUp' });
    expect(m[1]).toMatchObject({ text: 'Death Cross', shape: 'arrowDown' });
    // con el BHT barato (< 50) el Death Cross se omite; el Golden Cross se mantiene
    const cheap = signalMarkers(pts(700, (k) => ({ sp500Price: price(k), bht: 30, trend: undefined })));
    expect(cheap.map((x) => x.kind)).toEqual(['golden']);
    expect(DEATH_CROSS_MIN_BHT).toBe(50);
    expect(CROSS_MIN_SESSIONS).toBe(10);
  });
});

describe('raleo de señales por zoom', () => {
  const m = (time: string, kind: any, priority: number, position: 'aboveBar' | 'belowBar' = 'belowBar') => ({ time, kind, priority, position });
  const idx = (t: string) => Number(t);
  it('mantiene la distancia mínima por carril y prioriza cruces y entradas sobre recordatorios', () => {
    const list = [m('0', 'strong', 2), m('5', 'strong', 1), m('8', 'golden', 3), m('20', 'strong', 1), m('6', 'danger', 2, 'aboveBar')];
    // gap 10: el cruce (8) gana; la entrada en 0 choca con el cruce (8) → fuera; el recordatorio de 5 también; 20 queda
    expect(thinMarkers(list, idx, 10).map((x) => x.time)).toEqual(['8', '20', '6']);
    // zoom cercano (gap 1): todas
    expect(thinMarkers(list, idx, 1)).toHaveLength(5);
  });
  it('a igual prioridad, $$ antes que ¼$', () => {
    const list = [m('0', 'starter', 2), m('3', 'strong', 2)];
    expect(thinMarkers(list, idx, 10).map((x) => x.kind)).toEqual(['strong']);
  });
});
