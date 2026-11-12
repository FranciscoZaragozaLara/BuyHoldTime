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
