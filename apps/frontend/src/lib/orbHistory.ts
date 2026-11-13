// Historia mensual de cada componente del termómetro (popover de los orbes de las cards).
// Fuente: GET /api/backtesting/thermo-parts-monthly (último día hábil de cada mes, bt_bht_forward.parts).

export type PartPoint = { value: number | null; score: number | null; weight: number | null };
export type IndexPerf = { spx: number | null; ndx: number | null; tqqq: number | null };
export type PeakPoint = { pct: number; date: string };
export type IndexPeak = { spx: PeakPoint | null; ndx: PeakPoint | null; tqqq: PeakPoint | null };
export type MonthlyParts = { month: string; date: string; parts: Record<string, PartPoint>; bht?: number | null; perf?: IndexPerf; peak?: IndexPeak; yearsAgo?: number | null };
export type OrbHistoryRow = { month: string; date: string; value: number | null; score: number | null; perf: IndexPerf; peak: IndexPeak; yearsAgo: number | null };

/** Nombre del orbe en la card → clave del componente en `parts`. WTI no es componente (es bonus). */
export const ORB_PART_KEY: Record<string, string> = {
  CAPE: 'CAPE', 'Fwd PE': 'FWD', 'CAPE Ratio': 'RATIO', CPI: 'CPI', Core: 'CORE',
  '2Y Mom': 'Y2M', '30Y': '30Y', '30Y Mom': '30Y', 'Margin/GDP': 'MG', 'Margen/PIB': 'MG', VIX: 'VIX', 'F&G': 'FG',
  MSACSR: 'MS', 'PIB real': 'PIB',
};

/** Componente del termómetro → nombre de su orbe (el mismo que en las cards, para compartir popover e historia). */
export const PART_ORB_NAME: Record<string, string> = {
  CAPE: 'CAPE', FWD: 'Fwd PE', RATIO: 'CAPE Ratio', CPI: 'CPI', CORE: 'Core', Y2M: '2Y Mom', '30Y': '30Y',
  MG: 'Margen/PIB', VIX: 'VIX', FG: 'F&G', MS: 'MSACSR', PIB: 'PIB real',
};

export function orbHistoryRows(data: MonthlyParts[] | undefined, orbName: string): OrbHistoryRow[] {
  const key = ORB_PART_KEY[orbName];
  if (!key || !Array.isArray(data)) return [];
  return data
    .filter((m) => m.parts?.[key])
    .map((m) => ({
      month: m.month, date: m.date, value: m.parts[key].value, score: m.parts[key].score,
      perf: m.perf ?? { spx: null, ndx: null, tqqq: null }, peak: m.peak ?? { spx: null, ndx: null, tqqq: null }, yearsAgo: m.yearsAgo ?? null,
    }));
}

/** Historia del BHT Index (valor = puntaje 0–100) con el mismo formato de filas que los orbes. */
export function bhtHistoryRows(data: MonthlyParts[] | undefined): OrbHistoryRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => m.bht != null)
    .map((m) => ({
      month: m.month, date: m.date, value: m.bht ?? null, score: m.bht ?? null,
      perf: m.perf ?? { spx: null, ndx: null, tqqq: null }, peak: m.peak ?? { spx: null, ndx: null, tqqq: null }, yearsAgo: m.yearsAgo ?? null,
    }));
}

/** 'YYYY-MM' → 'nov 2026' / 'Nov 2026'. */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** 'YYYY-MM-DD' → '06 oct 26' / 'Oct 06, 26'. */
export function shortDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
}
