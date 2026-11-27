// Perfil de un ETF a partir del snapshot de GuruFocus (`tables.etfProfile` y `tables.topHoldings`).
type Row = { name?: string; current?: string };
export type EtfHolding = { ticker: string; company: string; weight: number | null };
export type EtfProfile = {
  lastUpdate: string | null; holdings: number | null; newHoldings: number | null;
  value: string | null; turnover: number | null; top: EtfHolding[];
  /** Resto de la cartera fuera de las principales: peso (100 − suma) y número de empresas (si se conoce el total). */
  others: { count: number | null; weight: number } | null;
};

const rows = (tables: unknown, key: string): Row[] => {
  const t = tables && typeof tables === 'object' ? (tables as Record<string, unknown>)[key] : null;
  return Array.isArray(t) ? (t as Row[]) : [];
};
const num = (s: string | undefined) => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? v : null;
};
const UNIT: Record<string, string> = { tril: 'T', bil: 'B', mil: 'M' };

/** null si el snapshot no es de un ETF. "781.03 Bil" → "$781.03 B"; sin unidad (el scraper a veces la pierde: "1.67") →
 *  null, porque un monto sin escala engaña. */
export function parseEtfProfile(tables: unknown): EtfProfile | null {
  const p = rows(tables, 'etfProfile');
  if (!p.length) return null;
  const get = (name: string) => p.find((r) => r.name === name)?.current;
  const value = get('Portfolio Value ($)');
  const unit = UNIT[value?.match(/(Tril|Bil|Mil)/i)?.[1]?.toLowerCase() ?? ''] ?? '';
  const amount = num(value);
  const top = rows(tables, 'topHoldings')
    .map((r) => {
      const [ticker, ...rest] = String(r.name ?? '').split(' — ');
      return { ticker: ticker.trim(), company: rest.join(' — ').trim(), weight: num(r.current) };
    })
    .filter((h) => h.ticker);
  const holdings = num(get('Number of Holdings'));
  const weights = top.map((h) => h.weight).filter((w): w is number => w != null);
  const topSum = weights.reduce((m, w) => m + w, 0);
  return {
    lastUpdate: get('Last Holding Update') ?? null,
    holdings,
    newHoldings: num(get('New Holdings')),
    value: amount != null && unit ? `$${amount.toLocaleString('en-US')} ${unit}` : null,
    turnover: num(get('Turnover %')),
    top,
    others: weights.length && topSum < 100
      ? { count: holdings != null && holdings > top.length ? holdings - top.length : null, weight: 100 - topSum }
      : null,
  };
}
