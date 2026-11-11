import { bandScore } from './thermo-history';
import { capeSegsForDate, capeSegsForYear, __setBandsForTest } from './bht-bands';

// Bandas CAPE anuales: el año del dato manda; sin entrada, el anterior más
// cercano; sin anterior, defaultYear. Valores fijados a bands.json vigente.
describe('bht-bands por año', () => {
  test('2024 recalibra arriba: CAPE 40 => 85', () => {
    expect(bandScore(capeSegsForYear('2024'), 40)).toBe(85);
  });
  test('2014 usa escalera 27: CAPE 28 => ~33.3 (antes ~25 plano)', () => {
    expect(bandScore(capeSegsForDate('2014-06-15'), 28)).toBeCloseTo(33.3, 1);
  });
  test('año sin historia (1990) cae al default 2027: CAPE 40 => 70', () => {
    expect(bandScore(capeSegsForYear('1990'), 40)).toBe(70);
  });
  test('año futuro (2030) usa el anterior más cercano (2027)', () => {
    expect(bandScore(capeSegsForYear('2030'), 40)).toBe(70);
  });
  test('año intermedio sin entrada usa el anterior más cercano', () => {
    __setBandsForTest({
      defaultYear: '2010',
      years: {
        '2000': { CAPE: { segments: [{ lo: 0, hi: 100, scoreLo: 0, scoreHi: 20, label: 'x', display: 'x' }] } },
        '2010': { CAPE: { segments: [{ lo: 0, hi: 100, scoreLo: 0, scoreHi: 22, label: 'x', display: 'x' }] } },
      },
    });
    try {
      expect(bandScore(capeSegsForYear('2005'), 50)).toBe(10);
      expect(bandScore(capeSegsForYear('2015'), 50)).toBe(11);
    } finally {
      __setBandsForTest(null);
    }
  });
});
