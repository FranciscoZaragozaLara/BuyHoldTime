import { dayQuote } from './day-quotes';

describe('dayQuote', () => {
  const dates = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  it('cambio diario vs el cierre previo disponible y % desde el máximo', () => {
    const q = dayQuote(dates, [100, 120, null, 108], 3)!;
    expect(q.price).toBe(108);
    expect(q.change).toBeCloseTo(-10);
    expect(q.fromHigh).toBeCloseTo(-10);
    expect(q.highDate).toBe('2020-01-03');
  });
  it('sin precio ese día → null; primer día sin cambio', () => {
    expect(dayQuote(dates, [100, 120, null, 108], 2)).toBeNull();
    expect(dayQuote(dates, [100, 120, null, 108], 0)!.change).toBeNull();
  });
  it('máximo de hace más de 5 años → usa el de 5 años', () => {
    const d = ['2010-01-04', '2020-01-02', '2020-06-01'];
    const q = dayQuote(d, [500, 100, 90], 2)!;
    expect(q.window5y).toBe(true);
    expect(q.fromHigh).toBeCloseTo(-10);
  });
});
