import { getLiqBonus, getLiqBonusSmoothed, PriceMap } from './thermo-history';

// Series mensuales (día 1) desde 2018: M2 acelerando ~6–9% anual; M0 que sube y baja en meses alternos
// para que el viento a favor (−10, exige M0 Δ3M > 0) prenda y apague como en la realidad.
function monthly(f: (i: number) => number, months = 96): PriceMap {
  const m = new Map<string, number>();
  for (let i = 0; i < months; i++) m.set(new Date(Date.UTC(2018, i, 1)).toISOString().slice(0, 10), f(i));
  return m;
}
const M2 = monthly((i) => 1000 * Math.pow(1.005 + i * 0.00004, i));
const M0 = monthly((i) => 1000 * (1 + (Math.floor(i / 2) % 2 === 0 ? 0.03 : -0.03) * (i % 2)));
const back = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); const t = (((d.getMonth() - n) % 12) + 12) % 12; d.setMonth(d.getMonth() - n); if (d.getMonth() !== t) d.setDate(0); return d.toISOString().slice(0, 10); };

describe('getLiqBonusSmoothed (L5)', () => {
  const dates: string[] = [];
  for (let i = 30; i < 96; i++) dates.push(new Date(Date.UTC(2018, i, 15)).toISOString().slice(0, 10));

  test('igual al promedio redondeado de 3 meses del bonus crudo, salvo bazuca y viento en contra inmediatos', () => {
    let toggles = 0;
    for (const d of dates) {
      const raw = [0, 1, 2].map((n) => getLiqBonus(M2, M0, back(d, n)).bonus);
      if (raw[0] !== raw[1]) toggles++;
      const s = getLiqBonusSmoothed(M2, M0, d);
      const expected = raw[0] <= -20 || raw[0] === 10 ? raw[0] : (Math.round((raw[0] + raw[1] + raw[2]) / 3) || 0);
      expect(s.bonus).toBe(expected);
      expect(s.yoy).toBe(getLiqBonus(M2, M0, d).yoy); // los insumos son los del mes actual
    }
    expect(toggles).toBeGreaterThan(5); // el fixture sí reproduce el prende/apaga
  });

  test('suaviza el prende/apaga: menos cambios de mes a mes que el bonus crudo', () => {
    const changes = (f: (d: string) => number) => dates.slice(1).filter((d, i) => f(d) !== f(dates[i])).length;
    const rawCh = changes((d) => getLiqBonus(M2, M0, d).bonus);
    const smCh = changes((d) => getLiqBonusSmoothed(M2, M0, d).bonus);
    expect(Math.max(...dates.map((d) => Math.abs(getLiqBonusSmoothed(M2, M0, d).bonus)))).toBeLessThanOrEqual(10);
    expect(smCh).toBeLessThanOrEqual(rawCh);
  });

  test('bazuca inmediata (no se diluye) y sin dato', () => {
    // M0 +40% en 3 meses y M2 +12% anual → megabazuca −25 desde el primer mes.
    const m2 = monthly((i) => 1000 * Math.pow(1.0095, i));
    const m0 = monthly((i) => (i >= 60 ? 1400 : 1000));
    const d = new Date(Date.UTC(2018, 61, 15)).toISOString().slice(0, 10);
    expect(getLiqBonus(m2, m0, d).bonus).toBe(-25);
    expect(getLiqBonusSmoothed(m2, m0, d).bonus).toBe(-25);
    expect(getLiqBonusSmoothed(new Map(), m0, d)).toMatchObject({ bonus: 0, label: 'sin dato' });
  });
});
