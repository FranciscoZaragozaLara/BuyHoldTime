import { isMarketClosed, lastOpenDay, nyseHolidays } from './market-calendar';

describe('calendario de la bolsa de Nueva York', () => {
  test('feriados de 2026 (calendario publicado por la NYSE)', () => {
    expect([...nyseHolidays(2026)].sort()).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ]);
  });
  test('observancia: 4-jul-2027 en domingo → lunes 5; año nuevo 2022 en sábado no cierra el 31-dic-2021', () => {
    expect(nyseHolidays(2027).has('2027-07-05')).toBe(true);
    expect(nyseHolidays(2022).has('2021-12-31')).toBe(false);
    expect(nyseHolidays(2021).has('2021-12-31')).toBe(false);
    expect(nyseHolidays(2023).has('2023-01-02')).toBe(true); // 1-ene-2023 domingo
  });
  test('Viernes Santo; Juneteenth solo desde 2022', () => {
    expect(nyseHolidays(2025).has('2025-04-18')).toBe(true);
    expect(nyseHolidays(2021).has('2021-06-18')).toBe(false);
  });
  test('fines de semana, feriados y días hábiles', () => {
    expect(isMarketClosed('2026-11-26')).toBe(true); // Thanksgiving
    expect(isMarketClosed('2026-11-28')).toBe(true); // sábado
    expect(isMarketClosed('2026-11-27')).toBe(false); // viernes posterior (medio día)
    expect(lastOpenDay('2026-11-26')).toBe('2026-11-25');
    expect(lastOpenDay('2026-11-29')).toBe('2026-11-27');
    expect(lastOpenDay('2026-11-25')).toBe('2026-11-25');
  });
  test('cierres especiales: sin cierre del S&P 500 entre dos días con cierre', () => {
    const spx = new Map([['2025-01-08', 1], ['2025-01-10', 1]]); // funeral de Carter, 9-ene-2025
    expect(isMarketClosed('2025-01-09', spx)).toBe(true);
    expect(lastOpenDay('2025-01-09', spx)).toBe('2025-01-08');
    // hoy, día hábil aún sin cierre (ni posterior): abierto
    expect(isMarketClosed('2025-01-13', spx)).toBe(false);
  });
});
