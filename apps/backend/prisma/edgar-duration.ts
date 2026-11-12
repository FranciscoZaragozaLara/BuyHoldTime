/**
 * Duración de los hechos XBRL de SEC EDGAR.
 * Un trimestre dura entre 70 y 125 días (COST: Q4 de 16 semanas); los acumulados
 * de 6 y 9 meses y el año fiscal completo (350-375 días) NO son trimestres.
 * Ver docs/eps-quarterly-calculation-rules.md (regla 2).
 */
export const QUARTER_MIN_DAYS = 70;
export const QUARTER_MAX_DAYS = 125;

export interface EdgarFact {
  start?: string;
  end?: string;
}

export function factDays(u: EdgarFact): number | null {
  if (!u.start || !u.end) return null;
  return (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
}

export function isQuarterFact(u: EdgarFact): boolean {
  const days = factDays(u);
  return days !== null && days >= QUARTER_MIN_DAYS && days <= QUARTER_MAX_DAYS;
}

export const FY_MIN_DAYS = 350;
export const FY_MAX_DAYS = 375;

/** Año fiscal completo (10-K): 350-375 días. */
export function isFiscalYearFact(u: EdgarFact): boolean {
  const days = factDays(u);
  return days !== null && days >= FY_MIN_DAYS && days <= FY_MAX_DAYS;
}

/**
 * Importe del Q4 = anual - (Q1 + Q2 + Q3). El 10-K no publica el Q4 por separado.
 * Sin dato anual devuelve 0; respeta pérdidas (anual negativo).
 */
export function deriveQ4Amount(annual: number | undefined, q1q2q3: number[]): number {
  if (annual === undefined || annual === null || Number.isNaN(annual)) return 0;
  const sum = q1q2q3.reduce((a, b) => a + (b || 0), 0);
  return Math.round(annual - sum);
}

/**
 * Conceptos us-gaap de utilidad neta, por prioridad. Cada empresa publica sus
 * trimestres bajo uno distinto (AVGO y MA: ProfitLoss; BKNG: ...AvailableToCommonStockholdersBasic)
 * y NetIncomeLoss a veces solo trae el año completo.
 */
export const NET_INCOME_CONCEPTS = [
  'NetIncomeLoss',
  'ProfitLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
] as const;

/**
 * Une listas de hechos por prioridad: se conservan todos los de la primera lista y,
 * de las siguientes, solo los periodos (start|end) que aún no están cubiertos.
 */
export function mergeFactsByPriority<T extends EdgarFact>(lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    const added: string[] = [];
    for (const u of list) {
      const key = `${u.start ?? ''}|${u.end ?? ''}`;
      if (seen.has(key)) continue;
      out.push(u);
      added.push(key);
    }
    added.forEach((k) => seen.add(k));
  }
  return out;
}

/** Hechos de utilidad neta (USD) de un bloque us-gaap, uniendo los conceptos por prioridad. */
export function netIncomeFacts(usGaap: any): any[] {
  return mergeFactsByPriority(
    NET_INCOME_CONCEPTS.map((tag) => (usGaap?.[tag]?.units?.USD as any[]) || []),
  );
}
