// Chequeo diario de reportes nuevos en la SEC: compara el último 10-Q/10-K presentado por cada empresa
// (submissions de EDGAR) con el último reporte guardado, para sincronizar solo las que publicaron algo.
// Funciones puras + la consulta a la SEC (mismo User-Agent que el sync semanal).

export const EDGAR_UA = 'BuyHoldTime Finance admin@buyholdtime.com';
const REPORT_FORMS = new Set(['10-Q', '10-K', '10-Q/A', '10-K/A', '20-F', '40-F']);

export type Submissions = { filings?: { recent?: { form?: string[]; filingDate?: string[]; reportDate?: string[] } } };

/** Periodo (fecha de cierre) del último reporte periódico (10-Q/10-K y enmiendas) en las submissions de la SEC, o null.
 *  Se compara por periodo y no por fecha de presentación: el Q4 se deriva del 10-K y se guarda sin filedDate. */
export function latestReportFiling(sub: Submissions): string | null {
  const r = sub.filings?.recent;
  if (!r?.form || !r.reportDate) return null;
  let best: string | null = null;
  r.form.forEach((f, i) => { const d = r.reportDate![i]; if (REPORT_FORMS.has(f) && d && (!best || d > best)) best = d; });
  return best;
}

/** Símbolos cuyo último periodo reportado en la SEC es posterior al último trimestre guardado (o sin datos). */
export function symbolsToSync(stored: Map<string, string | null>, latest: Map<string, string | null>): string[] {
  const out: string[] = [];
  for (const [sym, sec] of latest) {
    if (!sec) continue;
    const mine = stored.get(sym) ?? null;
    if (!mine || sec > mine) out.push(sym);
  }
  return out.sort();
}

/** Consulta las submissions de cada CIK (pausa entre peticiones: la SEC pide ≤ 10 por segundo). */
export async function fetchLatestFilings(ciks: Map<string, string>, pauseMs = 150, fetchFn: typeof fetch = fetch): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const [sym, cik] of ciks) {
    try {
      const res = await fetchFn(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': EDGAR_UA } });
      out.set(sym, res.ok ? latestReportFiling((await res.json()) as Submissions) : null);
    } catch {
      out.set(sym, null);
    }
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return out;
}
