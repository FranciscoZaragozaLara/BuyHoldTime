import { describe, expect, it } from 'vitest';
import {
  bandScore, capeRiskScore, fwdRiskScore, fwdBandLabel, FWD_BANDS, FWD_SEGS, ratioRiskScore, ratioBandLabel, RATIO_BANDS,
  hyBandLabel, HY_BANDS, cpiMScore, momBlend, CPI_LVL_SEGS, CPI_TRD_SEGS, trendTag, vixRiskScore, fgRiskScore, partLabel,
  CAPE_BANDS, CAPE_SEGS, CPI_BANDS, Y2M_BANDS, Y30_BANDS, MG_BANDS, GDP_BANDS, MS_BANDS, VIX_BANDS, OIL_BANDS, FG_BANDS, segsOf, capeJsonSegsForYear,
} from './thermoScoring';
// El backend se importa por ruta calculada: vitest lo resuelve en el monorepo, y el type-check de
// `next build` (imagen Docker sin apps/backend) no lo sigue.
type Segs = [number, number, number, number][];
const backendModule = (name: string) => import(/* @vite-ignore */ new URL(`../../../backend/src/modules/backtesting/${name}.ts`, import.meta.url).pathname);

describe('thermoScoring', () => {
  it('interpola dentro de cada banda y satura en los extremos', () => {
    // Piso anual 19.3 (P5 de 20 años): por debajo 0 pts, de 19.3 a 29 lineal 0→25.
    expect(capeRiskScore(10)).toBe(0);
    expect(capeRiskScore(19.3)).toBe(0);
    expect(capeRiskScore(24.15)).toBeCloseTo(12.5);
    expect(capeRiskScore(32)).toBeCloseTo(37.5);
    expect(capeRiskScore(43)).toBe(100);
    expect(capeRiskScore(60)).toBe(100);
    expect(bandScore([[0, 10, 0, 100]], 20)).toBe(100);
  });
  it('Fwd PE: bandas ×1.07 (16 / 20.5 / 23.5 / 25.5)', () => {
    expect(fwdRiskScore(16)).toBe(25);
    expect(fwdRiskScore(20.5)).toBe(50);
    expect(fwdRiskScore(23.5)).toBe(80);
    expect(fwdRiskScore(25.5)).toBe(100);
  });
  it('etiquetas coherentes con las tablas de bandas del popover', () => {
    const check = (bands: [number, number, string, string, string][], label: (v: number) => string) => {
      for (const [lo, hi, , , lvl] of bands) {
        const v = Number.isFinite(lo) ? (Number.isFinite(hi) ? (lo + hi) / 2 : lo + 1) : hi - 1;
        expect(label(v)).toBe(lvl);
      }
    };
    check(FWD_BANDS, fwdBandLabel);
    check(RATIO_BANDS, ratioBandLabel);
    check(HY_BANDS, hyBandLabel);
    expect(FWD_BANDS.slice(0, -1).map((b) => b[1])).toEqual(FWD_SEGS.slice(0, -1).map((s) => s[1]));
  });
  it('momentum: nivel 40% + tendencia 60%', () => {
    const b = momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, 3.5, 2.5);
    expect(b.delta).toBeCloseTo(1);
    expect(cpiMScore(3.5, 2.5)).toBeCloseTo(0.4 * b.levelScore + 0.6 * b.trendScore);
    expect(ratioRiskScore(1.1)).toBeCloseTo(70);
  });
  it('VIX invertido, F&G estirado, tendencia y etiquetas', () => {
    expect(vixRiskScore(10)).toBeGreaterThan(vixRiskScore(35));
    expect(fgRiskScore(5)).toBe(0);
    expect(fgRiskScore(90)).toBe(100);
    expect(trendTag(0.05).text).toBe('Lateral');
    expect(trendTag(1.2).text).toBe('Alcista Extrema');
    expect(trendTag(-0.3).text).toBe('Bajista Leve');
    expect(partLabel('RATIO')).toBe('CAPE Ratio - (vs media 3a)');
  });
});

describe('bandas continuas', () => {
  it('ningún componente salta en las fronteras de sus tramos (el VIX tenía un diente de sierra)', () => {
    const names = ['PE', 'FWD', 'RATIO', 'CPI', 'CPI_LVL', 'CPI_TRD', 'FED', 'Y2M_LVL', 'Y2M_TRD', 'Y30', 'Y30M_LVL', 'HY', 'MG', 'MG_TRD', 'VIX', 'FG', 'MS', 'GDP', 'OIL'];
    for (const n of names) {
      const segs = segsOf(n);
      for (let i = 0; i + 1 < segs.length; i++) expect(segs[i][3], `${n} en ${segs[i][1]}`).toBe(segs[i + 1][2]);
    }
    // VIX: más miedo → menos riesgo, siempre
    const xs = [8, 10, 12, 14, 17, 20, 23, 24.5, 25.5, 28, 30, 35, 45, 60];
    const ys = xs.map(vixRiskScore);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1]);
  });
});

describe('fuente única de bandas (packages/bht-bands)', () => {
  type Band = [number, number, string, string, string];
  const pts = (x: string) => x.split('–').map(Number);
  it('las tablas de los popovers tienen los mismos cortes y puntos que thermo-segs.json', () => {
    const pairs: [string, Band[], string][] = [
      ['FWD', FWD_BANDS, 'FWD'], ['RATIO', RATIO_BANDS, 'RATIO'], ['CPI', CPI_BANDS, 'CPI_LVL'], ['Y2M', Y2M_BANDS, 'Y2M_LVL'],
      ['Y30', Y30_BANDS, 'Y30M_LVL'], ['HY', HY_BANDS, 'HY'], ['MG', MG_BANDS, 'MG'], ['GDP', GDP_BANDS, 'GDP'], ['MS', MS_BANDS, 'MS'],
      ['VIX', VIX_BANDS, 'VIX'], ['OIL', OIL_BANDS, 'OIL'], ['FG', FG_BANDS, 'FG'], ['CAPE', CAPE_BANDS, ''],
    ];
    for (const [name, bands, key] of pairs) {
      const segs = key ? segsOf(key) : CAPE_SEGS.map(([lo, hi, a, b]) => [lo, hi, a, b] as [number, number, number, number]);
      const sorted = [...bands].sort((x, y) => x[0] - y[0]);
      expect(sorted.map((b) => [b[0], b[1]]), name).toEqual(segs.map((x) => [x[0], x[1]]));
      sorted.forEach((b, i) => {
        const [a, c] = pts(b[3]);
        expect([a, c ?? a], `${name} ${b[2]}`).toEqual([segs[i][2], segs[i][3]]);
      });
    }
  });
  it('backend y frontend leen las mismas bandas', async () => {
    const backend = (await backendModule('thermo-history')) as Record<string, Segs>;
    const { capeSegsForYear } = (await backendModule('bht-bands')) as { capeSegsForYear: (y: string) => Segs };
    const names = ['FWD', 'RATIO', 'CPI_LVL', 'CPI_TRD', 'Y2M_LVL', 'Y2M_TRD', 'Y30M_LVL', 'HY', 'MG', 'MG_TRD', 'VIX', 'MS', 'GDP', 'FG'];
    for (const n of names) expect(segsOf(n), n).toEqual(backend[`${n}_SEGS`]);
    const y = new Date().getFullYear();
    expect(capeJsonSegsForYear(y).map((x) => [x.lo ?? -Infinity, x.hi ?? Infinity, x.scoreLo, x.scoreHi])).toEqual(capeSegsForYear(String(y)));
    expect(capeJsonSegsForYear(1990)).toEqual(capeJsonSegsForYear(1990)); // años sin entrada resuelven igual
    expect(capeJsonSegsForYear(2009).map((x) => x.lo ?? -Infinity)).toEqual(capeSegsForYear('2009').map((x) => x[0]));
  });
});
