import { marketDate } from './market-date';

describe('fecha de mercado (Nueva York)', () => {
  test('la noche del 25-nov en CDMX (ya 26 en UTC) sigue siendo el 25 en Nueva York', () => {
    expect(marketDate(new Date('2026-11-26T01:34:00Z'))).toBe('2026-11-25'); // 19:34 CDMX / 20:34 ET
  });
  test('después de medianoche en Nueva York cambia de día', () => {
    expect(marketDate(new Date('2026-11-26T05:30:00Z'))).toBe('2026-11-26'); // 00:30 ET
  });
  test('horario de verano: 23:30 ET del 1-jul sigue siendo el 1', () => {
    expect(marketDate(new Date('2026-07-02T03:30:00Z'))).toBe('2026-07-01');
  });
});
