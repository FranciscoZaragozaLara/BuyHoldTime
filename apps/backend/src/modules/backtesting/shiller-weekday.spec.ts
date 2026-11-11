import { isTradingDayIso } from './backtesting.service';

// shiller-daily no debe servir fines de semana: el mercado no opera y el
// BHT no se calcula esos días (el 2026-10-31 sábado se coló por el CSV).
describe('isTradingDayIso', () => {
  test('sábado 2026-10-31 no es día de mercado', () => {
    expect(isTradingDayIso('2026-10-31')).toBe(false);
  });
  test('domingo 2026-11-01 no es día de mercado', () => {
    expect(isTradingDayIso('2026-11-01')).toBe(false);
  });
  test('viernes 2026-10-30 y lunes 2026-11-02 sí operan', () => {
    expect(isTradingDayIso('2026-10-30')).toBe(true);
    expect(isTradingDayIso('2026-11-02')).toBe(true);
  });
});
