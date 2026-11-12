import { bandScore, HY_SEGS, CPI_SEGS, CAPE_SEGS, PE_SEGS, FWD_SEGS, RATIO_SEGS, Y2M_LVL_SEGS, Y2M_TRD_SEGS, Y30M_LVL_SEGS, CPI_LVL_SEGS, CPI_TRD_SEGS, MG_SEGS, MG_TRD_SEGS, VIX_SEGS, getMa126, getCpiMa6, getMarginGdpMa24, getHyBonus, computeThermoLive, y2mScore, y30mScore, cpiScore, mgScore, pibScore, fgScore, computeThermoDay, PriceMap } from './thermo-history';

const map = (rows: [string, number][]): PriceMap => new Map(rows);

describe('thermo-history', () => {
  test('bandScore interpola dentro del tramo', () => {
    // HY 3.30 en [3.0,3.5] 12→25
    expect(bandScore(HY_SEGS, 3.3)).toBeCloseTo(19.8, 1);
    // Frontera pertenece al tramo superior
    expect(bandScore(CPI_SEGS, 2.0)).toBe(35);
    // MG 6 bandas: 2→20, 3→50, 4→70, 4.5→85, 5+→100
    expect(bandScore(MG_SEGS, 2)).toBe(20);
    expect(bandScore(MG_SEGS, 3)).toBe(50);
    expect(bandScore(MG_SEGS, 4)).toBe(70);
    expect(bandScore(MG_SEGS, 4.5)).toBe(85);
    expect(bandScore(MG_SEGS, 5)).toBe(100);
    // CAPE restrictivo: 40→70, 41→80, 42→90, 43+→100
    expect(bandScore(CAPE_SEGS, 40)).toBe(70);
    expect(bandScore(CAPE_SEGS, 41)).toBe(80);
    expect(bandScore(CAPE_SEGS, 42)).toBe(90);
    expect(bandScore(CAPE_SEGS, 43)).toBe(100);
    expect(bandScore(CAPE_SEGS, 35)).toBe(50);
    // PE 5 bandas: 24→50, 25→60, 26→70, 27→80, 30+→100
    expect(bandScore(PE_SEGS, 24)).toBe(50);
    expect(bandScore(PE_SEGS, 25)).toBe(60);
    expect(bandScore(PE_SEGS, 26)).toBe(70);
    expect(bandScore(PE_SEGS, 27)).toBe(80);
    expect(bandScore(PE_SEGS, 30)).toBe(100);
    // FWD 5 bandas: 19→50, 20→60, 21→70, 22→80, 23→90, 24+→100
    expect(bandScore(FWD_SEGS, 19)).toBe(50);
    expect(bandScore(FWD_SEGS, 20)).toBe(60);
    expect(bandScore(FWD_SEGS, 21)).toBe(70);
    expect(bandScore(FWD_SEGS, 22)).toBe(80);
    expect(bandScore(FWD_SEGS, 23)).toBe(90);
    expect(bandScore(FWD_SEGS, 24)).toBe(100);
    // RATIO 5 bandas: 1→50, 1.05→60, 1.10→70, 1.15→80, 1.20→90, 1.30+→100
    expect(bandScore(RATIO_SEGS, 1)).toBe(50);
    expect(bandScore(RATIO_SEGS, 1.05)).toBeCloseTo(60, 10);
    expect(bandScore(RATIO_SEGS, 1.1)).toBeCloseTo(70, 10);
    expect(bandScore(RATIO_SEGS, 1.15)).toBeCloseTo(80, 10);
    expect(bandScore(RATIO_SEGS, 1.2)).toBe(90);
    expect(bandScore(RATIO_SEGS, 1.3)).toBe(100);
  });

  test('Y2M combina nivel y delta vs MA6M', () => {
    // Nivel: 4.5→70, 5.0→79, 5.5→88; delta 0→50, +1→90, -1→10
    expect(bandScore(Y2M_LVL_SEGS, 4.5)).toBe(70);
    expect(bandScore(Y2M_LVL_SEGS, 5.0)).toBe(79);
    expect(bandScore(Y2M_LVL_SEGS, 5.5)).toBe(88);
    expect(bandScore(Y2M_TRD_SEGS, 0)).toBe(50);
    expect(bandScore(Y2M_TRD_SEGS, 1.0)).toBe(90);
    expect(bandScore(Y2M_TRD_SEGS, -1.0)).toBe(10);
    // Blend 40/60: 0.4*79 + 0.6*50 = 61.6
    expect(y2mScore(5.0, 5.0)).toBeCloseTo(61.6, 10);
    // Y30M mismo esquema: nivel 4.0→70, 5.0→88; blend 0.4*88 + 0.6*50 = 65.2
    expect(bandScore(Y30M_LVL_SEGS, 4.0)).toBe(70);
    expect(bandScore(Y30M_LVL_SEGS, 5.0)).toBe(88);
    expect(y30mScore(6.5, 6.5)).toBeCloseTo(65.2, 6);
  });

  test('CPI momentum: 3.5 acelerando pesa más que 7 cayendo', () => {
    // Nivel: 2.5→55, 3.0→70, 4.0→85; delta 0→50, +1.5→90, -1.5→10
    expect(bandScore(CPI_LVL_SEGS, 2.5)).toBe(55);
    expect(bandScore(CPI_LVL_SEGS, 3.0)).toBe(70);
    expect(bandScore(CPI_LVL_SEGS, 4.0)).toBe(85);
    expect(bandScore(CPI_TRD_SEGS, 0)).toBe(50);
    expect(bandScore(CPI_TRD_SEGS, 1.5)).toBe(90);
    expect(bandScore(CPI_TRD_SEGS, -1.5)).toBe(10);
    // Plano al 3%: 0.4*70 + 0.6*50 = 58
    expect(cpiScore(3.0, 3.0)).toBeCloseTo(58, 8);
    // 3.5 con MA 2.2 (delta +1.3): 0.4*77.5 + 0.6*86 = 82.6
    expect(cpiScore(3.5, 2.2)).toBeCloseTo(82.6, 8);
    // 7.0 con MA 8.5 (delta -1.5): 0.4*85 + 0.6*10 = 40
    expect(cpiScore(7.0, 8.5)).toBeCloseTo(40, 6);
    // MA6M sobre serie mensual plana al 3% anual
    const cpi = new Map<string, number>();
    for (let m = 0; m < 24; m++) {
      const d = new Date(1993, 5 + m, 1);
      cpi.set(d.toISOString().slice(0, 10), m < 12 ? 100 : 103);
    }
    expect(getCpiMa6(cpi, '1995-05-20')).toBeCloseTo(3.0, 8);
    expect(getCpiMa6(new Map(), '1995-05-20')).toBeNull();
  });

  test('PIB score procíclico: alto en picos, bajo en suelos', () => {
    // Suelo GFC 2009 (-3.23% YoY) => ~10: no frena la recompra.
    expect(pibScore(-3.23)).toBeCloseTo(10, 0);
    // Pico 2022 (+3.98%) => ~89.6; pico puntocom (+4.22%) => ~90.
    expect(pibScore(3.98)).toBeCloseTo(89.6, 1);
    expect(pibScore(4.22)).toBeCloseTo(90, 0);
    // Suelo 2022 (+1.23%) => ~29.6; pico GFC (+2.13%) => ~48.2.
    expect(pibScore(1.23)).toBeCloseTo(29.6, 1);
    expect(pibScore(2.13)).toBeCloseTo(48.2, 1);
  });
  test('FG estirado: ≤10 => 0, ≥80 => 100, centro intacto', () => {
    expect(fgScore(2.9)).toBe(0); // abr-25 pánico
    expect(fgScore(15.9)).toBeCloseTo(9.5, 1); // suelo 2022
    expect(fgScore(34)).toBe(34); // centro intacto
    expect(fgScore(65.2)).toBeCloseTo(77.0, 1); // pico 2022
    expect(fgScore(74.5)).toBeCloseTo(91.8, 1); // top nov-21
    expect(fgScore(82.97)).toBe(100); // máx histórico dic-23
  });
  test('VIX sensible: complacencia <20 alta, pánico ≥30 en 0', () => {
    expect(bandScore(VIX_SEGS, 14.38)).toBeCloseTo(87.5, 1); // pico COVID
    expect(bandScore(VIX_SEGS, 16.6)).toBeCloseTo(65.8, 1); // pico 2022
    expect(bandScore(VIX_SEGS, 24)).toBe(55); // corrección
    expect(bandScore(VIX_SEGS, 33.57)).toBeCloseTo(0, 0); // suelo 2022
    expect(bandScore(VIX_SEGS, 61.59)).toBeCloseTo(0, 0); // suelo COVID
  });
  test('MG momentum: nivel + desvío vs MA24M', () => {
    // Regla: ±0.15→50, ±0.5→70/30, ±0.9→90/10
    expect(bandScore(MG_TRD_SEGS, 0)).toBe(50);
    expect(bandScore(MG_TRD_SEGS, 0.5)).toBe(70);
    expect(bandScore(MG_TRD_SEGS, -0.5)).toBe(30);
    expect(bandScore(MG_TRD_SEGS, 0.9)).toBe(90);
    expect(bandScore(MG_TRD_SEGS, -0.9)).toBe(10);
    // Dic-2021 (3.67, MA 3.26): 0.4*63.4 + 0.6*64.9 = 64.3
    expect(mgScore(3.67, 3.26)).toBeCloseTo(64.3, 1);
    // Sep-2022 (2.52, MA 3.33): 0.4*35.6 + 0.6*14.5 = 22.9
    expect(mgScore(2.52, 3.33)).toBeCloseTo(22.9, 1);
    // Hoy (4.48, MA 3.60): 0.4*84.4 + 0.6*89 = 87.2
    expect(mgScore(4.48, 3.6)).toBeCloseTo(87.2, 1);
    // MA24M sobre serie plana: FINRA 900000M, GDP 24000B → ratio 3.75
    const s: Record<string, PriceMap> = { 'FINRA_DEBIT': new Map(), 'GDP': new Map() };
    for (let m = 0; m < 30; m++) {
      const d = new Date(1997, m, 1);
      s['FINRA_DEBIT'].set(d.toISOString().slice(0, 10), 900000);
    }
    for (let q = 0; q < 10; q++) {
      const d = new Date(1997, q * 3, 1);
      s['GDP'].set(d.toISOString().slice(0, 10), 24000);
    }
    expect(getMarginGdpMa24(s, '1999-07-15')).toBeCloseTo(3.75, 8);
  });

  test('HY bonus asimétrico Régimen 3: G2 +20, G1 +10, armado +2', () => {
    // Serie cada 10 días: plana en 3.0 con salto a 6.0 dos meses atrás → G1 (z alta, HY>5, d1≈0)
    const g1 = new Map<string, number>();
    const b1 = new Date(1997, 0, 1);
    for (let k = 0; k <= 80; k++) {
      const d = new Date(b1); d.setDate(d.getDate() + k * 10);
      g1.set(d.toISOString().slice(0, 10), d >= new Date(1999, 0, 1) ? 6.0 : 3.0);
    }
    const r1 = getHyBonus(g1, '1999-03-08');
    expect(r1.bonus).toBe(10);
    expect(r1.label).toMatch(/^G1/);
    // Salto +1.2 en un mes → G2 +20 (serie quincenal para que Δ1M resuelva ambas puntas)
    const g2 = new Map<string, number>();
    const base = new Date(1997, 0, 1);
    for (let k = 0; k <= 55; k++) {
      const d = new Date(base); d.setDate(d.getDate() + k * 15);
      g2.set(d.toISOString().slice(0, 10), k < 54 ? 3.0 : k === 54 ? 5.7 : 6.9);
    }
    const iso2 = new Date(base); iso2.setDate(iso2.getDate() + 55 * 15 + 5);
    const r2 = getHyBonus(g2, iso2.toISOString().slice(0, 10));
    expect(r2.bonus).toBe(20);
    expect(r2.label).toMatch(/^G2/);
    // Serie en declive con historia larga: armado por complacencia reciente → +2
    const g5 = new Map<string, number>();
    const b5 = new Date(1990, 0, 1);
    for (let k = 0; k < 1030; k++) {
      const d = new Date(b5); d.setDate(d.getDate() + k);
      g5.set(d.toISOString().slice(0, 10), k < 700 ? 6.0 : k < 1000 ? 2.0 : 1.9);
    }
    const iso5 = new Date(b5); iso5.setDate(iso5.getDate() + 1029);
    const r5 = getHyBonus(g5, iso5.toISOString().slice(0, 10));
    expect(r5.bonus).toBe(2);
    expect(r5.label).toBe('armado');
    // Sin dato → bonus 0
    const r0 = getHyBonus(new Map(), '1999-03-15');
    expect(r0.bonus).toBe(0);
    expect(r0.hy).toBeNull();
    // Meseta elevada sin aceleración → sostenido +5 (solo semáforo)
    const gs = new Map<string, number>();
    const bs = new Date(2008, 3, 1);
    for (let k = 0; k < 150; k++) {
      const d = new Date(bs); d.setDate(d.getDate() + k);
      gs.set(d.toISOString().slice(0, 10), 6.2);
    }
    const rs = getHyBonus(gs, '2008-08-28');
    expect(rs.bonus).toBe(5);
    expect(rs.label).toMatch(/^sostenido/);
    // Nivel calmo (4.0 plano) → 0 aunque haya historia
    const gc = new Map<string, number>();
    for (let k = 0; k < 150; k++) {
      const d = new Date(bs); d.setDate(d.getDate() + k);
      gc.set(d.toISOString().slice(0, 10), 4.0);
    }
    const rc = getHyBonus(gc, '2008-08-28');
    expect(rc.bonus).toBe(0);
    expect(rc.label).toBe('—');
    // Tramos extremos: nivel + impulso vencen a G2/G1 (solo semáforo)
    const slope = (start: number, perDay: number) => {
      const g = new Map<string, number>();
      const b = new Date(2008, 6, 1);
      for (let k = 0; k < 120; k++) {
        const d = new Date(b); d.setDate(d.getDate() + k);
        g.set(d.toISOString().slice(0, 10), start + k * perDay);
      }
      return { g, iso: '2008-10-28' };
    };
    const t35 = slope(9.0, 0.02); // v≈11.4, d1≈0.6 (<1, sin G2), d3>0
    const r35 = getHyBonus(t35.g, t35.iso);
    expect(r35.bonus).toBe(35);
    expect(r35.label).toMatch(/^crítico/);
    const t30 = slope(8.0, 0.015); // v≈9.8, d3>0
    const r30 = getHyBonus(t30.g, t30.iso);
    expect(r30.bonus).toBe(30);
    expect(r30.label).toMatch(/^severo/);
    const t25 = slope(7.0, 0.015); // v≈8.8, d1>0, sin G2
    const r25 = getHyBonus(t25.g, t25.iso);
    expect(r25.bonus).toBe(25);
    expect(r25.label).toMatch(/^alto/);
    // Nivel extremo pero cediendo (d3<0) → no hay tramo, cae a sostenido
    const falling = slope(12.0, -0.02); // v≈9.6, d3<0
    const rf = getHyBonus(falling.g, falling.iso);
    expect(rf.bonus).toBe(5);
    expect(rf.label).toMatch(/^sostenido/);
    // Tope rescate Fed: spike G2 con Δ3M<0 (suelo en V) y Fed en 0.25 tras recortes → +5 con marca
    const fedZirp = new Map<string, number>();
    const bf = new Date(2008, 0, 1);
    for (let k = 0; k < 430; k++) {
      const d = new Date(bf); d.setDate(d.getDate() + k);
      fedZirp.set(d.toISOString().slice(0, 10), k < 340 ? 2.0 : 0.25);
    }
    const gV = new Map<string, number>(); // 10 plano, cae a 7, rebote +1.2 al final
    const bV = new Date(2008, 9, 1);
    for (let k = 0; k < 120; k++) {
      const d = new Date(bV); d.setDate(d.getDate() + k);
      gV.set(d.toISOString().slice(0, 10), k < 60 ? 10.0 : k < 90 ? 10 - (k - 60) * 0.1 : k < 119 ? 7.0 : 8.2);
    }
    const rCap = getHyBonus(gV, '2009-01-28', fedZirp);
    expect(rCap.bonus).toBe(5);
    expect(rCap.label).toMatch(/tope Fed/);
    expect(rCap.fed).toBeCloseTo(0.25, 8);
    // Mismo suelo sin mapa Fed → sin tope (tier +25)
    const rNoFed = getHyBonus(gV, '2009-01-28');
    expect(rNoFed.bonus).toBe(25);
    // Fed alta (5.0) → sin tope aunque haya spike
    const fedHi = new Map<string, number>();
    for (let k = 0; k < 430; k++) {
      const d = new Date(bf); d.setDate(d.getDate() + k);
      fedHi.set(d.toISOString().slice(0, 10), 5.0);
    }
    expect(getHyBonus(gV, '2009-01-28', fedHi).bonus).toBe(25);
    // Acelerando con rescate (Δ3M≥+0.5) → sin tope, manda la protección
    const gAcc = new Map<string, number>();
    const bA = new Date(2008, 8, 1);
    for (let k = 0; k < 120; k++) {
      const d = new Date(bA); d.setDate(d.getDate() + k);
      gAcc.set(d.toISOString().slice(0, 10), 9.0 + k * 0.02);
    }
    const rAcc = getHyBonus(gAcc, '2008-12-29', fedZirp);
    expect(rAcc.bonus).toBe(35);
    expect(rAcc.label).not.toMatch(/tope Fed/);
    // Historia corta: promedia lo disponible de la época (7 meses válidos → 3.75)
    const s2: Record<string, PriceMap> = {
      'FINRA_DEBIT': new Map(),
      'GDP': new Map([['1996-10-01', 24000], ['1997-01-01', 24000], ['1997-04-01', 24000], ['1997-07-01', 24000]]),
    };
    for (let m = 0; m < 8; m++) {
      const d = new Date(1997, m, 1);
      s2['FINRA_DEBIT'].set(d.toISOString().slice(0, 10), 900000);
    }
    expect(getMarginGdpMa24(s2, '1997-08-15')).toBeCloseTo(3.75, 8);
    expect(getMarginGdpMa24({ 'FINRA_DEBIT': new Map(), 'GDP': new Map() }, '1999-07-15')).toBeNull();
    // MA126: media exacta y null sin observaciones suficientes
    const m = new Map([['1995-06-13', 4], ['1995-06-14', 5], ['1995-06-15', 6]]);
    expect(getMa126(m, '1995-06-15', 3, 3)).toBe(5);
    expect(getMa126(m, '1995-06-15', 3, 4)).toBeNull();
    expect(getMa126(new Map(), '1995-06-15')).toBeNull();
  });

  test('computeThermoDay excluye pesos sin dato y renormaliza', () => {
    // DGS2 plano en 5.0: MA=5.0, delta=0 → Y2M = 61.6 (aporta 616)
    // CPI y CORE planos al 3% anual: 100 jun93–may94, 103 jun94–may95 → YoY 3.0, delta 0, score 58
    const cpiFlat3: [string, number][] = [];
    for (let m = 0; m < 24; m++) {
      const d = new Date(1993, 5 + m, 1);
      cpiFlat3.push([d.toISOString().slice(0, 10), m < 12 ? 100 : 103]);
    }
    const dgs2rows: [string, number][] = [];
    const dgs30rows: [string, number][] = [];
    for (let i = 0; i < 130; i++) {
      const d = new Date('1995-06-15'); d.setDate(d.getDate() - i);
      dgs2rows.push([d.toISOString().slice(0, 10), 5.0]);
      dgs30rows.push([d.toISOString().slice(0, 10), 6.5]);
    }
    const s = {
      '^GSPC': map([['1995-06-15', 500]]),
      'CPIAUCSL': map(cpiFlat3),
      'DGS2': map(dgs2rows),
      'CPILFESL': map(cpiFlat3),
      'DGS30': map(dgs30rows),
      'VIXCLS': map([['1995-06-15', 15]]),
      'MSACSR': map([['1995-05-01', 5.0]]),
      'GDPC1': map([['1995-04-01', 100], ['1994-04-01', 97]]),
    };
    const r = computeThermoDay('1995-06-15', s, { cape: 20, ratio: 1.0 });
    expect(r).not.toBeNull();
    // Sin PE/FWD/FG/MG/HY: 9 partes + bonus 0 (sin serie HY); RATIO 15, resto 10/5.
    // CPI y CORE planos al 3%: nivel 70, delta 0 → 58 cada uno (aportan 580 + 580).
    expect(r!.coverage).toBe(9);
    expect(r!.denominator).toBe(95);
    expect(r!.numerator).toBeCloseTo(4774.8, 0);
    expect(r!.value).toBeCloseTo(50.3, 1);
    expect(r!.bonus).toBe(0);
    expect(r!.parts.map((p) => p.key)).toEqual(['CAPE', 'RATIO', 'CPI', 'CORE', 'Y2M', '30Y', 'VIX', 'MS', 'PIB']);
    expect(r!.parts.find((p) => p.key === 'RATIO')!.weight).toBe(15);
    expect(r!.parts.find((p) => p.key === 'Y2M')!.weight).toBe(10);
    expect(r!.parts.find((p) => p.key === 'Y2M')!.score).toBeCloseTo(61.6, 10);
    expect(r!.parts.find((p) => p.key === 'CORE')!.weight).toBe(10);
    expect(r!.parts.find((p) => p.key === 'CORE')!.score).toBeCloseTo(58, 8);
    expect(r!.parts.find((p) => p.key === 'PIB')!.weight).toBe(5);
    // GDPC1 100/97 => YoY +3.09% => procíclico ~71.9 (antes ~11.4 invertido).
    expect(r!.parts.find((p) => p.key === 'PIB')!.score).toBeCloseTo(71.9, 1);
    // VIX 15 => 60 (curva sensible) con peso 10.
    expect(r!.parts.find((p) => p.key === 'VIX')!.score).toBe(60);
  });
});

describe('computeThermoLive', () => {
  const daily = (start: string, n: number, f: (k: number) => number) => {
    const m = new Map<string, number>();
    const b = new Date(start + 'T12:00:00Z');
    for (let k = 0; k < n; k++) { const d = new Date(b); d.setUTCDate(d.getUTCDate() + k); m.set(d.toISOString().slice(0, 10), f(k)); }
    return m;
  };
  const series = () => ({
    '^GSPC': daily('2024-01-01', 700, () => 5000),
    SPX_FWD_EPS: daily('2024-01-01', 700, () => 250),
    VIXCLS: daily('2024-01-01', 700, () => 15),
    FEAR_GREED: daily('2024-01-01', 700, () => 50),
  });
  const iso = '2025-11-20';
  test('sin datos en vivo = computeThermoDay', () => {
    const s = series();
    const live = computeThermoLive(iso, s, { cape: 30, ratio: 1.1 });
    expect(live.day).toEqual(computeThermoDay(iso, s, { cape: 30, ratio: 1.1 }));
    expect(live.hy.label).toBe('sin dato');
  });
  test('el dato en vivo del día cambia el resultado sin mutar las series', () => {
    const s = series();
    const base = computeThermoLive(iso, s, { cape: 30, ratio: 1.1 });
    const withLive = computeThermoLive(iso, s, { cape: 30, ratio: 1.1 }, { VIXCLS: { date: iso, value: 40 } });
    const vix = (r: typeof base) => r.day!.parts.find((p) => p.key === 'VIX')!;
    expect(vix(withLive).value).toBe(40);
    // VIX es contrario: miedo alto (40) = menor riesgo en el termómetro.
    expect(vix(withLive).score).toBeLessThan(vix(base).score);
    expect(withLive.day!.value).toBeLessThan(base.day!.value);
    expect(s.VIXCLS.get(iso)).toBe(15);
  });
  test('ignora datos en vivo con fecha posterior al día o inválidos', () => {
    const s = series();
    const base = computeThermoLive(iso, s, { cape: 30, ratio: 1.1 });
    const r = computeThermoLive(iso, s, { cape: 30, ratio: 1.1 }, { VIXCLS: { date: '2025-11-21', value: 80 }, FEAR_GREED: { date: 'x', value: 99 } });
    expect(r.day).toEqual(base.day);
  });
});
