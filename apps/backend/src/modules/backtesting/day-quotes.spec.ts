import { dayQuote, lastBottom } from './day-quotes';

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
  it('último mínimo: piso de la corrección más reciente (≥ umbral) y % ganado desde ahí', () => {
    const d = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i) => `2021-01-0${i + 1}`);
    // 100 → 85 (corrección) → 80 piso → 95 rebote → 90 (caída de 5%, no es corrección) → 104
    const px = [100, 85, 80, 95, 90, 104, null, 104];
    expect(lastBottom(d, px, 7, 0.1)).toEqual({ price: 80, date: '2021-01-03' });
    const q = dayQuote(d, px, 7)!;
    expect(q.bottom).toBe(80);
    expect(q.bottomDate).toBe('2021-01-03');
    expect(q.fromBottom).toBeCloseTo(30);
  });
  it('corrección en curso: el piso es el cierre más bajo hasta el día; sin corrección → null', () => {
    const d = ['2021-01-01', '2021-01-02', '2021-01-03', '2021-01-04'];
    expect(lastBottom(d, [100, 89, 85, 87], 3, 0.1)).toEqual({ price: 85, date: '2021-01-03' });
    expect(lastBottom(d, [100, 95, 92, 99], 3, 0.1)).toBeNull();
    expect(dayQuote(d, [100, 95, 92, 99], 3)!.fromBottom).toBeNull();
  });
  it('una corrección nueva reemplaza al piso anterior aunque quede más arriba', () => {
    const d = Array.from({ length: 7 }, (_, i) => `2021-02-0${i + 1}`);
    // piso 80, rebote a 120 (nuevo máximo), cae 10% a 108 → nuevo piso 105, luego 115
    expect(lastBottom(d, [100, 80, 120, 108, 105, 115, 116], 6, 0.1)).toEqual({ price: 105, date: '2021-02-05' });
  });
});
