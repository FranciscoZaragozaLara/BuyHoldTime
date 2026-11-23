// Respaldo de EDGAR: cuando la SEC ya recibió un 10-Q/10-K (submissions) pero su API companyfacts todavía no lo
// incorpora (CEG nov-2026: dos semanas de retraso), se leen los hechos directamente del XBRL del reporte y se entregan
// con la misma forma que companyfacts ({ Concepto: { units: { USD | 'USD/shares' | shares: hechos[] } } }), para que el
// resto del sync (trimestres, Q4 derivado, splits) no cambie. Solo contextos sin dimensiones (consolidados).

export const SEC_UA = 'BuyHoldTime Finance admin@buyholdtime.com';
export type UsGaapLike = Record<string, { units: Record<string, any[]> }>;

/** Parsea un XBRL de instancia (o el extraído de un inline XBRL) a hechos us-gaap tipo companyfacts. */
export function parseXbrlInstance(xml: string, meta: { form: string; filed: string; accn: string }): UsGaapLike {
  const ctx = new Map<string, { start?: string; end?: string }>();
  for (const m of xml.matchAll(/<(?:\w+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?context>/g)) {
    const body = m[2];
    if (/<(?:\w+:)?segment\b/.test(body) || /<(?:\w+:)?scenario\b/.test(body)) continue; // dimensiones: no consolidado
    const start = body.match(/<(?:\w+:)?startDate>\s*([\d-]+)\s*</)?.[1];
    const end = body.match(/<(?:\w+:)?endDate>\s*([\d-]+)\s*</)?.[1] ?? body.match(/<(?:\w+:)?instant>\s*([\d-]+)\s*</)?.[1];
    if (end) ctx.set(m[1], { start, end });
  }
  const units = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:\w+:)?unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?unit>/g)) {
    const b = m[2];
    if (/divide/.test(b)) units.set(m[1], /iso4217:USD/.test(b) && /shares/.test(b) ? 'USD/shares' : 'other');
    else units.set(m[1], /iso4217:USD/.test(b) ? 'USD' : /xbrli:shares|>shares</.test(b) ? 'shares' : 'other');
  }
  const out: UsGaapLike = {};
  for (const m of xml.matchAll(/<us-gaap:(\w+)\b([^>]*?)>([^<]*)<\/us-gaap:\1>/g)) {
    const [, concept, attrs, text] = m;
    const c = ctx.get(attrs.match(/contextRef="([^"]+)"/)?.[1] ?? '');
    const unit = units.get(attrs.match(/unitRef="([^"]+)"/)?.[1] ?? '');
    const val = Number(text.trim());
    if (!c || !unit || unit === 'other' || !Number.isFinite(val)) continue;
    const list = ((out[concept] ??= { units: {} }).units[unit] ??= []);
    if (!list.some((u) => u.start === c.start && u.end === c.end)) list.push({ start: c.start, end: c.end, val, form: meta.form, filed: meta.filed, accn: meta.accn });
  }
  return out;
}

/** Nombre del archivo de instancia XBRL dentro del índice del reporte (prefiere el extraído del inline XBRL). */
export function pickInstanceFile(names: string[]): string | null {
  const xml = names.filter((n) => n.toLowerCase().endsWith('.xml') && !/filingsummary|_(cal|def|lab|pre)\.xml$/i.test(n));
  return xml.find((n) => /_htm\.xml$/i.test(n)) ?? xml[0] ?? null;
}

/** Reportes (10-Q/10-K con XBRL) de las submissions cuyo periodo es posterior a `afterEnd`. */
export function filingsAfter(sub: any, afterEnd: string | null): Array<{ form: string; filed: string; report: string; accn: string }> {
  const r = sub?.filings?.recent;
  if (!r?.form) return [];
  const out: Array<{ form: string; filed: string; report: string; accn: string }> = [];
  r.form.forEach((form: string, i: number) => {
    const report = r.reportDate?.[i], xbrl = r.isXBRL?.[i] ?? 1;
    if (['10-Q', '10-K'].includes(form) && report && xbrl && (!afterEnd || report > afterEnd)) out.push({ form, filed: r.filingDate[i], report, accn: r.accessionNumber[i] });
  });
  return out;
}

/** Hechos us-gaap de los reportes que companyfacts aún no incorpora (periodo posterior a `afterEnd`). */
export async function missingFilingFacts(cik: string, afterEnd: string | null, fetchFn: typeof fetch = fetch): Promise<UsGaapLike[]> {
  const get = (url: string) => fetchFn(url, { headers: { 'User-Agent': SEC_UA } });
  const sub = await (await get(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
  const out: UsGaapLike[] = [];
  for (const f of filingsAfter(sub, afterEnd).slice(0, 4)) {
    const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accn.replace(/-/g, '')}`;
    const idx = (await (await get(`${base}/index.json`)).json()) as any;
    const name = pickInstanceFile((idx?.directory?.item ?? []).map((x: any) => String(x.name)));
    if (!name) continue;
    const xml = await (await get(`${base}/${name}`)).text();
    out.push(parseXbrlInstance(xml, { form: f.form, filed: f.filed, accn: f.accn }));
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}
