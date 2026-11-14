import { describe, expect, it } from 'vitest';
import {
  bandScore, capeRiskScore, fwdRiskScore, fwdBandLabel, FWD_BANDS, FWD_SEGS, ratioRiskScore, ratioBandLabel, RATIO_BANDS,
  hyBandLabel, HY_BANDS, cpiMScore, momBlend, CPI_LVL_SEGS, CPI_TRD_SEGS, trendTag, vixRiskScore, fgRiskScore, partLabel,
} from './thermoScoring';

describe('thermoScoring', () => {
  it('interpola dentro de cada banda y satura en los extremos', () => {
    // Banda inferior abierta (lo = -Infinity): interpola desde -1e9, así que vale ~su puntaje alto
    // (CAPE < 29 → ~25). Igual que bandScore del backend (thermo-history.ts).
    expect(capeRiskScore(10)).toBeCloseTo(25, 4);
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
