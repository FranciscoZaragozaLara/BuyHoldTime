import { TOKENS } from './designTokens';
import { describe, expect, it } from 'vitest';
import { athDrawdownLine, buildValuationChart, buyLadderMarkers, mergeBuyLabels, mergeSellLabels, netLadderMarkers, NET_COLOR, sellLadderMarkers, signalMarkers, signalState, thinMarkers, DEATH_CROSS_MIN_BHT, MERGED_MARKER_SIZE, CROSS_MIN_SESSIONS, SIGNAL_REPEAT, type ChartPoint, type DailyValuation, type MonthlyRow } from './valuationChart';

const monthly: MonthlyRow[] = [
  { date: '1989-11', sp500Price: 340, peRatio: 14, shillerPe: 17 },
  { date: '1989-12', sp500Price: 350, peRatio: 14.5, shillerPe: 17.5 },
  { date: '1990-01', sp500Price: 330, peRatio: 13.9, shillerPe: 17.1 },
];

const BUY_KINDS = ['max', 'strong', 'buy', 'starter'];

describe('valuationChart', () => {
  it('sin serie diaria: puntos mensuales con SMA de 3 y 10 meses (≈ 50 y 200 sesiones)', () => {
    const p = buildValuationChart(monthly, null);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01']);
    expect(p[0].sp500PriceMa50).toBe(340);
    expect(p[1].sp500PriceMa50).toBe(345); // media de 340 y 350
    expect(p[2].sp500PriceMa50).toBeCloseTo((340 + 350 + 330) / 3, 2);
    expect(p[2].sp500PriceMa200).toBeCloseTo((340 + 350 + 330) / 3, 2); // menos de 10 meses: media de lo disponible
    expect(p.every((x) => !x.daily)).toBe(true);
  });

  it('diaria: SMA 50 y 200 de las últimas sesiones (las mismas que usan los cruces)', () => {
    const dates = Array.from({ length: 260 }, (_, k) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10));
    const spx = dates.map((_, k) => 100 + k);
    const p = buildValuationChart([], { dates, spx, pe: spx.map(() => null), cape: spx.map(() => null) });
    const last = p[p.length - 1];
    expect(last.sp500PriceMa50).toBeCloseTo(spx.slice(-50).reduce((a, b) => a + b) / 50, 2);
    expect(last.sp500PriceMa200).toBeCloseTo(spx.slice(-200).reduce((a, b) => a + b) / 200, 2);
  });
  it('híbrida: mensual antes del primer día diario, diaria después', () => {
    const daily: DailyValuation = { dates: ['1990-01-01', '1990-01-02', '1990-01-03'], spx: [null, 353.4, 355.67], pe: [null, 15.1, 15.2], cape: [17.9, 17.95, 18.0], bht: [null, 52.3, 71] };
    const p = buildValuationChart(monthly, daily);
    expect(p.map((x) => x.time)).toEqual(['1989-11-01', '1989-12-01', '1990-01-01', '1990-01-02', '1990-01-03']);
    expect(p[2]).toMatchObject({ daily: true, shillerPe: 17.9, sp500Price: undefined, sp500PriceMa50: undefined });
    expect(p[3].sp500PriceMa50).toBe(353.4); // primera sesión con precio: la SMA arranca con él
    expect(p[4].sp500PriceMa50).toBeCloseTo((353.4 + 355.67) / 2, 1); // redondeado a 2 decimales
    expect(p.map((x) => x.bht)).toEqual([undefined, undefined, undefined, 52.3, 71]); // BHT del día solo en el tramo diario
  });
  it('Nasdaq 100 / TQQQ: sin tramo mensual; precio, P/E y SMA del instrumento; CAPE y BHT del mercado', () => {
    const daily: DailyValuation = {
      dates: ['1999-03-09', '1999-03-10', '1999-03-11'], spx: [1280, 1286, 1290], pe: [30, 30.1, 30.2], cape: [40, 40.1, 40.2], bht: [70, 71, 72],
      qqq: [null, 100, 102], tqqq: [null, null, null], ndxPe: [null, 70, 71.4],
    };
    const n = buildValuationChart(monthly, daily, 'ndx');
    expect(n.every((x) => x.daily)).toBe(true);
    expect(n.map((x) => [x.sp500Price, x.peRatio, x.shillerPe, x.bht])).toEqual([[undefined, undefined, 40, 70], [100, 70, 40.1, 71], [102, 71.4, 40.2, 72]]);
    expect(n[1].sp500PriceMa50).toBe(100); // la SMA arranca con el primer precio del instrumento
    const t = buildValuationChart(monthly, daily, 'tqqq');
    expect(t.map((x) => x.peRatio)).toEqual([undefined, 70, 71.4]); // P/E del subyacente
    expect(t.every((x) => x.sp500Price === undefined)).toBe(true);
  });
});


describe('señales BHT × tendencia y cruces', () => {
  it('escalera de compra por lo barato del BHT; abajo de la SMA 200 baja un nivel', () => {
    // arriba de la SMA 200
    expect([55, 45, 35, 25].map((b) => signalState(b, 'U'))).toEqual(['starter', 'buy', 'strong', 'max']);
    expect(signalState(60.5, 'P')).toBe('starter');
    expect(signalState(64, 'U')).toBeNull();
    expect(signalState(75, 'U')).toBeNull(); // rally con BHT alto: sin alerta
    // abajo de la SMA 200 (Rebote o Bajista)
    expect([45, 35, 25].map((b) => signalState(b, 'R'))).toEqual(['starter', 'buy', 'strong']);
    expect([45, 35, 25].map((b) => signalState(b, 'D'))).toEqual(['starter', 'buy', 'strong']);
    expect(signalState(55, 'R')).toBeNull(); // Rebote con BHT neutral: ni compra ni alerta
    expect(signalState(55, 'D')).toBe('danger');
    expect(signalState(75, 'D')).toBe('danger');
    expect(signalState(undefined, 'U')).toBeNull();
    expect(signalState(30, undefined)).toBeNull();
  });

  const day = (k: number) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10);
  const pts = (n: number, f: (k: number) => Partial<ChartPoint>): ChartPoint[] =>
    Array.from({ length: n }, (_, k) => ({ time: day(k), daily: true, sp500Price: 100, ...f(k) }));

  it('mientras siga barato vuelve a comprar cada ~mes aunque el precio no baje', () => {
    const p = pts(70, () => ({ bht: 35, trend: 'U' }));
    const m = signalMarkers(p);
    expect(m.map((x) => [x.kind, x.time])).toEqual([['strong', day(0)], ['strong', day(21)], ['strong', day(42)], ['strong', day(63)]]);
    expect(m.map((x) => x.priority)).toEqual([2, 1, 1, 1]); // entrada y recordatorios
    expect(SIGNAL_REPEAT).toBe(21);
  });

  it('más barato = señal más grande, de inmediato; volver a un nivel menos barato espera el mes', () => {
    // 0-4 ¼$ (55), 5-9 $ (45), 10-14 $$ (35), 15-19 $$$ (25), 20-29 $ (45) → espera; día 36 (21 tras el $$$) → $
    const bht = (k: number) => (k < 5 ? 55 : k < 10 ? 45 : k < 15 ? 35 : k < 20 ? 25 : 45);
    const m = signalMarkers(pts(40, (k) => ({ bht: bht(k), trend: 'U' })));
    expect(m.map((x) => [x.kind, x.time])).toEqual([['starter', day(0)], ['buy', day(5)], ['strong', day(10)], ['max', day(15)], ['buy', day(36)]]);
    expect(m.map((x) => x.size)).toEqual([0.7, 0.95, 1.25, 1.6, 0.95]);
    expect(m.find((x) => x.kind === 'max')).toMatchObject({ text: '$$$' });
  });

  it('BHT 40–49 abajo de la SMA 200 (como sep–nov 2022): tramo pequeño ¼$ mensual', () => {
    const m = signalMarkers(pts(45, () => ({ bht: 46, trend: 'D' })));
    expect(m.map((x) => [x.kind, x.time])).toEqual([['starter', day(0)], ['starter', day(21)], ['starter', day(42)]]);
  });

  it('una alerta por episodio bajista: oscilar entre Bajista y Rebote no la repite si el precio no subió', () => {
    const p = pts(100, (k) => ({ bht: 58, trend: k < 5 ? 'U' : Math.floor((k - 5) / 10) % 2 === 0 ? 'D' : 'R', sp500Price: 100 - k * 0.2 }));
    expect(signalMarkers(p).filter((x) => x.kind === 'danger').map((x) => x.time)).toEqual([day(5)]);
  });

  it('la alerta se repite solo si el precio subió desde la anterior', () => {
    const p = pts(50, (k) => ({ bht: 60, trend: 'D', sp500Price: k < 30 ? 100 - k : 70 + (k - 30) * 3 }));
    expect(signalMarkers(p).filter((x) => x.kind === 'danger').map((x) => x.time)).toEqual([day(0), day(41)]);
  });

  it('ventas V1–V5 del backend: más grave = más grande; crédito en rojo con «·C»; solo fechas de la gráfica', () => {
    const ev = [
      { date: day(1), id: 'V1' as const, price: 100, credit: false },
      { date: day(3), id: 'V5' as const, price: 90, credit: false },
      { date: day(5), id: 'V4' as const, price: 95, credit: true },
      { date: '1900-01-01', id: 'V2' as const, price: 1, credit: false },
    ];
    const m = sellLadderMarkers(ev, new Set([day(1), day(3), day(5)]));
    expect(m.map((x) => [x.time, x.text])).toEqual([[day(1), 'V1'], [day(3), 'V5'], [day(5), 'V4·C']]);
    expect(m[0]).toMatchObject({ kind: 'sell', shape: 'arrowDown', position: 'aboveBar' });
    expect(m[1].size).toBeGreaterThan(m[0].size);
    expect(m[2].color).toBe(TOKENS.risk);
    // el raleo por zoom conserva la venta más grave y le suma las que chocan (etiqueta compacta)
    const thin = thinMarkers(m, (t) => m.findIndex((x) => x.time === t), 10);
    // …y las agrupadas siguen en su fecha, chicas y sin texto
    expect(thin.map((x) => [x.time, x.text])).toEqual([[day(1), ''], [day(3), 'V1/4/5·C'], [day(5), '']]);
    expect(thin[0].size).toBe(MERGED_MARKER_SIZE);
    expect(thin[0]).toMatchObject({ shape: 'arrowDown', color: m[0].color });
    expect(mergeSellLabels(['V4', 'V1'])).toBe('V1/4');
    // zoom cercano: cada venta con su etiqueta
    expect(thinMarkers(m, (t) => m.findIndex((x) => x.time === t), 1).map((x) => x.text)).toEqual(['V1', 'V5', 'V4·C']);
    // signalMarkers ya no genera ventas
    expect(signalMarkers(pts(3, (k) => ({ bht: [60, 80, 90][k], trend: 'U' }))).some((x) => x.kind === 'sell')).toBe(false);
  });

  it('compras T0–T4 del backend: T0 morado y grande, medio tranche «½», respaldo «·r»; buys:false apaga la escalera ¼$…$$$', () => {
    const ev = [
      { date: day(1), id: 'T0' as const, price: 100, size: 1, backup: false },
      { date: day(2), id: 'T1' as const, price: 101, size: 0.5, backup: false },
      { date: day(3), id: 'T4' as const, price: 99, size: 1, backup: true },
    ];
    const m = buyLadderMarkers(ev);
    expect(m.map((x) => x.text)).toEqual(['T0', 'T1½', 'T4·r']);
    expect(m[0]).toMatchObject({ position: 'belowBar', shape: 'circle', color: '#a855f7' });
    expect(m[0].size).toBeGreaterThan(m[1].size);
    const p = pts(40, () => ({ bht: 35, trend: 'U' }));
    expect(signalMarkers(p).some((x) => BUY_KINDS.includes(x.kind))).toBe(true);
    expect(signalMarkers(p, 'es', { buys: false }).some((x) => BUY_KINDS.includes(x.kind))).toBe(false);
  });

  it('Golden Cross y Death Cross del precio (SMA 50 cruzando la SMA 200)', () => {
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

describe('athDrawdownLine', () => {
  it('va del pico al último precio con la caída y su semáforo', () => {
    const pts = [
      { time: '2026-01-02', daily: true, sp500Price: 100 },
      { time: '2026-03-02', daily: true, sp500Price: 120 },
      { time: '2026-06-01', daily: true },
      { time: '2026-11-19', daily: true, sp500Price: 102 },
    ];
    const l = athDrawdownLine(pts)!;
    expect(l.from).toEqual({ time: '2026-03-02', value: 120 });
    expect(l.to).toEqual({ time: '2026-11-19', value: 102 });
    expect(l.pct).toBeCloseTo(-15, 9);
    expect(l.tone).toBe('elevated');
    expect(athDrawdownLine([])).toBeNull();
  });
  it('red de seguridad: «R50» con el color de su regla, más grande entre más recompra; solo fechas de la gráfica', () => {
    const day = (k: number) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10);
    const m = netLadderMarkers([
      { date: day(1), rule: 'Bv', pct: 50, price: 100 }, { date: day(2), rule: 'Ds', pct: 100, price: 95 }, { date: '1900-01-01', rule: 'R1e', pct: 25, price: 1 },
    ], new Set([day(1), day(2)]));
    expect(m.map((x) => [x.text, x.color])).toEqual([['R50', NET_COLOR.Bv], ['R100', NET_COLOR.Ds]]);
    expect(m[1].size).toBeGreaterThan(m[0].size);
    expect(m[0]).toMatchObject({ kind: 'buy', position: 'belowBar' });
  });
  it('compras de la escalera y de la red que chocan se juntan en una etiqueta compacta', () => {
    expect(mergeBuyLabels(['R50', 'T1', 'T2'])).toBe('T1/2·R50');
    expect(mergeBuyLabels(['T4·r', 'T1½'])).toBe('T1½/4r');
    expect(mergeBuyLabels(['R50', 'R20'])).toBe('R50·R20');
    const day = (k: number) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10);
    const m = [...buyLadderMarkers([{ date: day(5), id: 'T1', price: 1, size: 1, backup: false }]), ...netLadderMarkers([{ date: day(2), rule: 'Ds', pct: 50, price: 1 }])];
    const thin = thinMarkers(m, (t) => Number(t.slice(8, 10)), 10);
    expect(thin.map((x) => x.text)).toEqual(['T1·R50', '']);
  });
});
