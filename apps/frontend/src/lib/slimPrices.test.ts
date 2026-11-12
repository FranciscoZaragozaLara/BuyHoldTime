import { describe, expect, test } from 'vitest';
import { slimPrice, slimPrices } from './slimPrices';

const row = {
  id: 'cf0624a3', tickerId: 'e4d52445', date: '1997-01-02T00:00:00.000Z',
  open: 0.18861599266529083, high: 0.18973200023174286, low: 0.18526799976825714,
  close: 0.1875, adjClose: 0.1875, volume: 1234,
};

describe('slimPrice', () => {
  test('quita id/tickerId y conserva solo los campos que usa la página', () => {
    expect(Object.keys(slimPrice(row))).toEqual(['date', 'open', 'high', 'low', 'close', 'adjClose', 'volume']);
  });

  test('fecha YYYY-MM-DD = mismo instante UTC que la ISO original', () => {
    const r = slimPrice(row);
    expect(r.date).toBe('1997-01-02');
    expect(new Date(r.date).getTime()).toBe(new Date(row.date).getTime());
    expect(r.date.split('T')[0]).toBe('1997-01-02');
  });

  test('precios con precisión completa (el simulador compone miles de días)', () => {
    expect(slimPrice(row).open).toBe(0.18861599266529083);
  });

  test('slimPrices conserva orden y longitud', () => {
    const out = slimPrices([row, { ...row, date: '1997-01-03T00:00:00.000Z' }]);
    expect(out.map((p) => p.date)).toEqual(['1997-01-02', '1997-01-03']);
  });
});
