import { applyCapeFloor, capeFloorForYear, percentile, BandSeg } from './cape-floor';
import { bandScore } from './thermo-history';

const SEGS: BandSeg[] = [
  { lo: null, hi: 29, scoreLo: 0, scoreHi: 25, label: 'Barato', display: '≤ 29' },
  { lo: 29, hi: 35, scoreLo: 25, scoreHi: 50, label: 'Justo', display: '29–35' },
  { lo: 35, hi: null, scoreLo: 50, scoreHi: 100, label: 'Caro', display: '≥ 35' },
];
const toSeg = (s: BandSeg[]) => s.map((x) => [x.lo ?? -Infinity, x.hi ?? Infinity, x.scoreLo, x.scoreHi] as [number, number, number, number]);

describe('cape-floor', () => {
  test('percentil lineal', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
  });
  test('piso con solo años previos (sin futuro)', () => {
    const monthly = Array.from({ length: 30 * 12 }, (_, i) => ({ date: `${1980 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, cape: 1980 + Math.floor(i / 12) - 1970 }));
    // 2000: ventana 1980–1999 → valores 10..29, P5 ≈ 10.95 → 11.0; el dato de 2000+ no cuenta
    expect(capeFloorForYear(monthly, 2000)).toBe(11);
    expect(capeFloorForYear(monthly, 1985)).toBeNull(); // historia insuficiente
  });
  test('aplica el piso: 0 abajo, lineal hasta el corte, cortes superiores intactos', () => {
    const segs = applyCapeFloor(SEGS, 15);
    expect(segs.map((s) => s.display)).toEqual(['≤ 15.0', '15.0–29', '29–35', '≥ 35']);
    const s = toSeg(segs);
    expect(bandScore(s, 11.9)).toBe(0);
    expect(bandScore(s, 15)).toBe(0);
    expect(bandScore(s, 22)).toBeCloseTo(12.5);
    expect(bandScore(s, 29)).toBe(25);
    expect(bandScore(s, 32)).toBeCloseTo(37.5);
  });
  test('idempotente y piso acotado bajo el corte', () => {
    expect(applyCapeFloor(applyCapeFloor(SEGS, 15), 18)).toEqual(applyCapeFloor(SEGS, 18));
    expect(applyCapeFloor(SEGS, 40)[0].hi).toBe(28);
  });
});
