import {
  deriveQ4Amount,
  factDays,
  isFiscalYearFact,
  isQuarterFact,
  mergeFactsByPriority,
  netIncomeFacts,
} from '../../prisma/edgar-duration';

describe('edgar-duration', () => {
  it('acepta trimestres de 12-13 semanas y el Q4 de 16 semanas de COST', () => {
    expect(isQuarterFact({ start: '2026-06-28', end: '2026-09-26' })).toBe(true); // AAPL ~90 d
    expect(isQuarterFact({ start: '2025-05-12', end: '2025-08-31' })).toBe(true); // COST Q4 ~111 d
    expect(isQuarterFact({ start: '2026-01-01', end: '2026-03-12' })).toBe(true); // 70 d: límite inferior incluido
    expect(isQuarterFact({ start: '2026-01-01', end: '2026-03-11' })).toBe(false); // 69 d
    expect(isQuarterFact({ start: '2026-01-01', end: '2026-05-06' })).toBe(true); // 125 d: límite superior incluido
    expect(isQuarterFact({ start: '2026-01-01', end: '2026-05-07' })).toBe(false); // 126 d
  });

  it('rechaza acumulados de 6/9 meses y el año fiscal completo', () => {
    expect(isQuarterFact({ start: '2025-09-28', end: '2026-03-28' })).toBe(false); // 6M
    expect(isQuarterFact({ start: '2025-09-28', end: '2026-06-27' })).toBe(false); // 9M
    expect(isQuarterFact({ start: '2025-09-28', end: '2026-09-26' })).toBe(false); // FY
  });

  it('rechaza hechos sin fechas', () => {
    expect(factDays({ end: '2026-09-26' })).toBeNull();
    expect(isQuarterFact({})).toBe(false);
  });
  it('reconoce el año fiscal completo (350-375 días)', () => {
    expect(isFiscalYearFact({ start: '2025-09-28', end: '2026-09-26' })).toBe(true);
    expect(isFiscalYearFact({ start: '2025-09-28', end: '2026-06-27' })).toBe(false);
    expect(isFiscalYearFact({ start: '2026-06-28', end: '2026-09-26' })).toBe(false);
  });

  describe('deriveQ4Amount', () => {
    it('Q4 = anual - (Q1+Q2+Q3): caso AAPL FY2026 en millones de USD', () => {
      expect(deriveQ4Amount(132_180, [42_100, 29_580, 29_790])).toBe(30_710);
    });
    it('sin dato anual devuelve 0, no el total de los otros trimestres', () => {
      expect(deriveQ4Amount(undefined, [42_100, 29_580, 29_790])).toBe(0);
    });
    it('respeta empresas con pérdida anual (no lo fuerza a 0)', () => {
      expect(deriveQ4Amount(-500, [-100, -150, -120])).toBe(-130);
    });
    it('trata importes ausentes como 0', () => {
      expect(deriveQ4Amount(100, [40, undefined as any, 30])).toBe(30);
    });
  });
  describe('utilidad neta: mezcla de conceptos', () => {
    const f = (start: string, end: string, val: number) => ({ start, end, val });

    it('conserva el concepto prioritario y completa solo los periodos que le faltan', () => {
      const merged = mergeFactsByPriority([
        [f('2025-01-01', '2025-12-31', 100)],
        [f('2025-01-01', '2025-12-31', 999), f('2026-07-01', '2026-09-30', 30)],
      ]);
      expect(merged).toHaveLength(2);
      expect(merged.find((x) => x.end === '2025-12-31')!.val).toBe(100);
      expect(merged.find((x) => x.end === '2026-09-30')!.val).toBe(30);
    });

    it('BKNG: NetIncomeLoss solo anual + trimestre reciente bajo AvailableToCommon', () => {
      const facts = netIncomeFacts({
        NetIncomeLoss: { units: { USD: [f('2025-01-01', '2025-12-31', 5000)] } },
        NetIncomeLossAvailableToCommonStockholdersBasic: {
          units: { USD: [f('2026-07-01', '2026-09-30', 1700)] },
        },
      });
      expect(facts.filter(isQuarterFact).map((x) => x.val)).toEqual([1700]);
      expect(facts.filter(isFiscalYearFact).map((x) => x.val)).toEqual([5000]);
    });

    it('tolera bloques sin ningún concepto', () => {
      expect(netIncomeFacts(undefined)).toEqual([]);
      expect(netIncomeFacts({})).toEqual([]);
    });
  });
});
