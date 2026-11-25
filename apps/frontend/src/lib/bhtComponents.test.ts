import { describe, expect, it } from 'vitest';
import { bhtComposition, groupComponents, hyAdjustmentLabel, liqAdjustmentLabel, oilAdjustmentLabel, PART_EXPLAIN, PART_META, stampLabel } from './bhtComponents';

const parts = [
  { key: 'CAPE', score: 60, weight: 20, value: 37.955 },
  { key: 'FWD', score: 40, weight: 10, value: 18.8 },
  { key: 'CPI', score: 70, weight: 10, value: 4.08 },
  { key: 'VIX', score: 30, weight: 10, value: 26.7 },
  { key: 'XXX', score: 99, weight: 0, value: 1 },
];

describe('groupComponents', () => {
  it('agrupa por categoría en orden fijo, con aporte = puntaje × peso ÷ peso total y la fecha de su serie', () => {
    const g = groupComponents(parts, { CAPE: { date: '2026-11-24', source: 'db' }, CPIAUCSL: { date: '2026-10-01', source: 'FRED' } });
    expect(g.map((x) => x.key)).toEqual(['valuation', 'inflation', 'sentiment']);
    const cape = g[0].rows[0];
    expect(cape.display).toMatch(/^37\.9[56]x$/);
    expect(cape.points).toBeCloseTo((60 * 20) / 50, 9);
    expect(cape.weightPct).toBeCloseTo(40, 9);
    expect(cape.stamp?.date).toBe('2026-11-24');
    expect(g[0].rows[1].stamp).toBeNull(); // FWD no trae fecha en thermo-live
    expect(g[1].rows[0].stamp?.source).toBe('FRED');
    // la suma de los aportes es la base del BHT
    const sum = g.reduce((m, x) => m + x.points, 0);
    expect(sum).toBeCloseTo(bhtComposition(parts, []).base, 9);
  });
  it('nombres en inglés', () => {
    expect(groupComponents(parts, {}, 'en')[0].name).toBe('Valuation');
    expect(groupComponents(parts, {}, 'en')[0].rows[0].name).toBe('Shiller CAPE');
  });
});

describe('stampLabel', () => {
  it('diario, mensual y trimestral', () => {
    expect(stampLabel('2026-11-20', 'daily')).toBe('20-nov-2026');
    expect(stampLabel('2026-10-01', 'monthly')).toBe('oct 2026');
    expect(stampLabel('2026-07-01', 'quarterly')).toBe('T3 2026');
    expect(stampLabel('2026-07-01', 'quarterly', 'en')).toBe('Q3 2026');
    expect(stampLabel('2026-11-20', 'daily', 'en')).toBe('Nov 20, 2026');
  });
});

describe('bhtComposition', () => {
  it('base ponderada + ajustes, recortado a 0–100', () => {
    const c = bhtComposition(parts.slice(0, 4), [2, -3]);
    expect(c.base).toBeCloseTo((60 * 20 + 40 * 10 + 70 * 10 + 30 * 10) / 50, 9);
    expect(c.adj).toBe(-1);
    expect(c.total).toBeCloseTo(c.base - 1, 9);
    expect(bhtComposition([{ key: 'CAPE', score: 2, weight: 1, value: 0 }], [-10]).total).toBe(0);
  });
});

describe('hyAdjustmentLabel', () => {
  it('traduce los estados del ajuste de crédito', () => {
    expect(hyAdjustmentLabel('armado', 'en')).toBe('Complacency: spread in the lowest 20% of the last 3 years');
    expect(hyAdjustmentLabel('armado', 'es')).toBe('Complacencia: spread en el 20% más bajo de 3 años');
    expect(hyAdjustmentLabel('sostenido 5.91', 'es')).toBe('Estrés sostenido: promedio de 5.91% en 3 meses');
    expect(hyAdjustmentLabel('G2 Δ1M +1.32', 'en')).toBe('Sharp stress: +1.32 pts in one month');
    expect(hyAdjustmentLabel('G1 z 1.84', 'es')).toBe('Tensión: subida de 3 meses de 1.84 desviaciones');
    expect(hyAdjustmentLabel('crítico HY>10 Δ3M +2.10', 'en')).toBe('Critical: spread above 10% and rising (+2.10 in 3 months)');
    expect(hyAdjustmentLabel('—', 'es')).toBe('Sin ajuste');
    expect(hyAdjustmentLabel('sin dato', 'en')).toBe('No data');
  });
  it('agrega el tope por rescate de la Fed y deja igual lo desconocido', () => {
    expect(hyAdjustmentLabel('G2 Δ1M +1.05 · tope Fed', 'es')).toBe('Tensión fuerte: +1.05 pts en un mes (tope por rescate de la Fed)');
    expect(hyAdjustmentLabel('otro', 'en')).toBe('otro');
  });
});

describe('liqAdjustmentLabel / oilAdjustmentLabel', () => {
  it('traduce los estados de liquidez', () => {
    expect(liqAdjustmentLabel('viento a favor prom. 3M (0/0/-10)', 'en')).toBe('Tailwind (3-month average: 0/0/-10)');
    expect(liqAdjustmentLabel('viento a favor prom. 3M (0/0/-10)', 'es')).toBe('Viento a favor (promedio de 3 meses: 0/0/-10)');
    expect(liqAdjustmentLabel('viento en contra prom. 3M (+10/+10/0)', 'en')).toBe('Headwind (3-month average: +10/+10/0)');
    expect(liqAdjustmentLabel('megabazuca M0 Δ3M +45.2% M2 +12.1%', 'en')).toBe('Fed mega-bazooka: M0 +45.2% in 3 months, M2 +12.1% a year');
    expect(liqAdjustmentLabel('bazuca M0 Δ3M +6.0% M2 +9.0%', 'es')).toBe('Bazuca de la Fed: M0 +6.0% en 3 meses, M2 +9.0% anual');
    expect(liqAdjustmentLabel('viento en contra M2 −40% del pico', 'en')).toBe('Headwind: M2 growth is 40% below its peak');
    expect(liqAdjustmentLabel('viento a favor M2 +5.7%', 'en')).toBe('Tailwind: M2 growing 5.7% a year');
    expect(liqAdjustmentLabel('—', 'en')).toBe('No adjustment');
  });
  it('traduce los estados del petróleo', () => {
    expect(oilAdjustmentLabel('caro WTI 1.25 (sin persistencia)', 'en')).toBe('Expensive: WTI 1.25× its 36-month mean (not persistent)');
    expect(oilAdjustmentLabel('shock WTI 1.42', 'es')).toBe('Choque de precio: WTI 1.42× su media de 36 meses');
    expect(oilAdjustmentLabel('alivio WTI 0.65', 'en')).toBe('Relief: WTI 0.65× its 36-month mean');
    expect(oilAdjustmentLabel('sin dato', 'es')).toBe('Sin dato');
  });
});

describe('PART_EXPLAIN', () => {
  it('cada indicador del BHT y cada ajuste tiene explicación en español e inglés', () => {
    for (const k of [...Object.keys(PART_META), 'HY', 'LIQ', 'OIL']) {
      expect(PART_EXPLAIN[k]?.es?.length, `${k}.es`).toBeGreaterThan(60);
      expect(PART_EXPLAIN[k]?.en?.length, `${k}.en`).toBeGreaterThan(60);
    }
  });
});
