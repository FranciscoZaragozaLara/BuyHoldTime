import { buildValuationDaily, dailyPeFromMonthly, spliceSeries } from './valuation-daily';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('buildValuationDaily', () => {
  test('arreglos paralelos ordenados, P/E con EPS registrado y huecos en null', () => {
    const v = buildValuationDaily(
      m({ '1989-12-29': 350, '2026-10-02': 7600.123, '2026-10-05': 7650 }),
      m({ '2026-03-31': 261.7, '2026-06-30': 295.39 }), // jun se publica el 3 oct
      m({ '2026-10-02': 40.555, '2026-10-06': 40.1 }),
      m({ '2026-10-02': 69.94, '2026-10-05': 70.11 }),
    );
    expect(v.dates).toEqual(['2026-10-02', '2026-10-05', '2026-10-06']);
    expect(v.spx).toEqual([7600.12, 7650, null]);
    expect(v.pe[0]).toBeCloseTo(7600.123 / 261.7, 2); // 2 oct todavía no conoce junio
    expect(v.pe[1]).toBeCloseTo(7650 / 295.39, 2);
    expect(v.pe[2]).toBeNull();
    expect(v.cape).toEqual([40.56, null, 40.1]);
    expect(v.bht).toEqual([69.94, 70.11, null]);
  });
});

describe('Nasdaq 100', () => {
  test('P/E diario = cierre ÷ EPS implícito del mes (al cierre de mes da el P/E mensual)', () => {
    const qqq = m({ '2026-10-15': 600, '2026-10-30': 620, '2026-11-13': 610, '2026-11-17': 590 });
    const pe = dailyPeFromMonthly(qqq, new Map([['2026-10', 27.12], ['2026-11', 29.55]]));
    expect(pe.get('2026-10-30')).toBeCloseTo(27.12, 6);
    expect(pe.get('2026-10-15')).toBeCloseTo(600 / (620 / 27.12), 6);
    expect(pe.get('2026-11-17')).toBeCloseTo(29.55, 6); // último día disponible del mes en curso
  });
  test('QQQ, TQQQ y P/E en el endpoint; meses sin P/E quedan en null', () => {
    const v = buildValuationDaily(new Map(), new Map(), new Map(), new Map(), {
      qqq: m({ '2026-10-30': 620, '2026-12-01': 630 }), tqqq: m({ '2026-10-30': 62.01 }), ndxMonthlyPe: new Map([['2026-10', 27.12]]),
    });
    expect(v.dates).toEqual(['2026-10-30', '2026-12-01']);
    expect(v.qqq).toEqual([620, 630]);
    expect(v.tqqq).toEqual([62.01, null]);
    expect(v.ndxPe).toEqual([27.12, null]);
  });
});

describe('ancla del P/E y unión de series', () => {
  test('con ancla, el día del dato da el P/E publicado y los demás se mueven con el precio', () => {
    const qqq = m({ '2026-11-13': 679.89, '2026-11-17': 652.47 });
    const pe = dailyPeFromMonthly(qqq, new Map([['2026-11', 29.55]]), new Map([['2026-11', '2026-11-13']]));
    expect(pe.get('2026-11-13')).toBeCloseTo(29.55, 6);
    expect(pe.get('2026-11-17')).toBeCloseTo(29.55 * 652.47 / 679.89, 6);
  });
  test('spliceSeries escala la serie vieja al primer día común', () => {
    const s = spliceSeries(m({ '2010-02-10': 43.02, '2010-02-11': 43.5 }), m({ '2010-02-11': 37.86, '2010-02-12': 37.94 }));
    expect(s.get('2010-02-10')).toBeCloseTo(43.02 * 37.86 / 43.5, 6);
    expect(s.get('2010-02-11')).toBe(37.86);
    expect(s.get('2010-02-12')).toBe(37.94);
  });
});
