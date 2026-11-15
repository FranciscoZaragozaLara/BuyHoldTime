import { buildValuationDaily } from './valuation-daily';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('buildValuationDaily', () => {
  test('arreglos paralelos ordenados, P/E con EPS registrado y huecos en null', () => {
    const v = buildValuationDaily(
      m({ '1989-12-29': 350, '2026-10-02': 7600.123, '2026-10-05': 7650 }),
      m({ '2026-03-31': 261.7, '2026-06-30': 295.39 }), // jun se publica el 3 oct
      m({ '2026-10-02': 40.555, '2026-10-06': 40.1 }),
    );
    expect(v.dates).toEqual(['2026-10-02', '2026-10-05', '2026-10-06']);
    expect(v.spx).toEqual([7600.12, 7650, null]);
    expect(v.pe[0]).toBeCloseTo(7600.123 / 261.7, 2); // 2 oct todavía no conoce junio
    expect(v.pe[1]).toBeCloseTo(7650 / 295.39, 2);
    expect(v.pe[2]).toBeNull();
    expect(v.cape).toEqual([40.56, null, 40.1]);
  });
});
