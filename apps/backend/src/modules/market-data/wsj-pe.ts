// Tabla "P/Es & Yields on Major Indexes" de WSJ (P/E estimado a 12 meses de Birinyi Associates,
// actualizado cada viernes). Se usa para SPX_FWD_EPS = cierre del S&P 500 / P/E estimado.
export const WSJ_PE_URL = 'https://www.wsj.com/market-data/stocks/peyields';

export type WsjPeRow = { index: string; asOf: string; trailing: number | null; yearAgo: number | null; estimate: number | null };

const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
const num = (s: string | undefined) => {
  const v = s != null ? parseFloat(s.replace(/,/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Fila de un índice ("S&P 500 Index") con su fecha de corte (encabezado "11/06/26†" de su tabla). */
export function parseWsjPeYields(html: string, index = 'S&P 500 Index'): WsjPeRow | null {
  for (const table of html.split(/<table\b/i).slice(1)) {
    const heads = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => text(m[1]));
    const dateHead = heads.find((h) => /^\d{2}\/\d{2}\/\d{2}/.test(h));
    for (const row of table.split(/<tr\b/i).slice(1)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
      if (cells[0] !== index) continue;
      if (!dateHead) return null;
      const [mm, dd, yy] = dateHead.slice(0, 8).split('/');
      return { index, asOf: `20${yy}-${mm}-${dd}`, trailing: num(cells[1]), yearAgo: num(cells[2]), estimate: num(cells[3]) };
    }
  }
  return null;
}

/** EPS estimado implícito = precio / P/E estimado (redondeado a 4 decimales). */
export function impliedForwardEps(price: number, forwardPe: number): number {
  return Math.round((price / forwardPe) * 1e4) / 1e4;
}

export const WSJ_NDX = 'NASDAQ 100 Index';

/** Descarga el HTML de la tabla (User-Agent de navegador: WSJ rechaza clientes sin él). */
export async function fetchWsjPeHtml(): Promise<string> {
  const res = await fetch(WSJ_PE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } });
  if (!res.ok) throw new Error(`WSJ HTTP ${res.status}`);
  return res.text();
}

/** Entrada mensual de P/E de fondos (QQQ/TQQQ) en historical_eps_quarterly. */
export type MonthlyPeEntry = {
  date: string; period: string; fiscalYear: string; revenue: number; netIncome: number;
  eps: number; epsDiluted: number; sharesOutstanding: number; peRatio?: number | null; source: string;
};

/**
 * Pone `pe` en la entrada del fin de mes de `asOf` (convención de la serie: una entrada por mes,
 * fecha = último día; los fondos la buscan por mes calendario). Reemplaza la del mismo mes, así que
 * al cerrar el mes queda el último dato semanal. No toca los demás meses. Orden: más reciente primero.
 */
export function setMonthlyPe(entries: MonthlyPeEntry[], asOf: string, pe: number): MonthlyPeEntry[] {
  const [y, m] = asOf.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  const date = `${y}-${mm}-${String(last).padStart(2, '0')}`;
  const entry: MonthlyPeEntry = { date, period: `M${mm}`, fiscalYear: String(y), revenue: 0, netIncome: 0, eps: 0, epsDiluted: 0, sharesOutstanding: 0, peRatio: Math.round(pe * 1e4) / 1e4, source: 'real' };
  return [...entries.filter((e) => e.date.slice(0, 7) !== date.slice(0, 7)), entry].sort((a, b) => b.date.localeCompare(a.date));
}

/** ¿Entró un dato nuevo? (otra fecha de corte, o en la misma fecha otro valor). */
export function wsjPointChanged(before: { date: string; value: number } | null, after: { date: string; value: number } | null): boolean {
  if (!after) return false;
  if (!before) return true;
  return after.date !== before.date || Math.abs(after.value - before.value) > 1e-9;
}
