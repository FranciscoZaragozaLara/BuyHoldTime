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
