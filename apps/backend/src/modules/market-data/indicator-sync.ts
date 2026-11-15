// Tabla `indicators` y sus historias mensuales, mantenidas desde los datos diarios de la BD al terminar
// cada sincronización de mercado (antes: valores del seed y de daily_update.py, cada uno con su fuente).
// - Macro (fed_rate, treasury_30y, vix, fear_greed, inflation, core_inflation): último dato de su serie.
// - Valuación, con las mismas reglas que el termómetro y la pestaña Indicadores:
//     sp500_price = cierre ^GSPC · pe_ratio = SPX ÷ EPS registrado (spx-eps.ts) ·
//     fwd_pe_ratio = SPX ÷ EPS estimado WSJ/Birinyi · schiller_pe = CAPE registrado (bt_shiller_daily).
// - Historias (página /indicators): no se guardan; GET /indicators/:key las deriva al leer con
//   monthlyLast / peMonthlyHistory (ver indicator.repository.impl.ts), así la serie de Shiller no se mezcla.
// Las filas mensuales de Shiller (cpi, sp500_dividend, sp500_earnings, rate_gs10) no se tocan.
import { getClosestPrice, getCpiYoY, getRecentPrice, PriceMap } from '../backtesting/thermo-history';
import { buildEpsSchedule, epsAt } from './spx-eps';

export type IndicatorUpdate = { key: string; value: number; status: string; asOf: string };
export type HistoryPoint = { date: string; value: number };

/** Ticker de origen y cómo se lee: último valor o inflación interanual (series mensuales). */
export const INDICATOR_SOURCES: Record<string, { ticker: string; kind: 'last' | 'yoy' }> = {
  fed_rate: { ticker: 'DFEDTARU', kind: 'last' },
  treasury_30y: { ticker: 'DGS30', kind: 'last' },
  vix: { ticker: 'VIXCLS', kind: 'last' },
  fear_greed: { ticker: 'FEAR_GREED', kind: 'last' },
  inflation: { ticker: 'CPIAUCSL', kind: 'yoy' },
  core_inflation: { ticker: 'CPILFESL', kind: 'yoy' },
};

/** Etiqueta (mismo vocabulario que el seed: Low / Normal / High; Fear & Greed con las de CNN). */
export function indicatorStatus(key: string, v: number): string {
  switch (key) {
    case 'vix': return v < 15 ? 'Low' : v < 25 ? 'Normal' : 'High';
    case 'fear_greed': return v < 25 ? 'Extreme Fear' : v < 45 ? 'Fear' : v < 55 ? 'Neutral' : v < 75 ? 'Greed' : 'Extreme Greed';
    case 'fed_rate': return v <= 2 ? 'Low' : v <= 4 ? 'Normal' : 'High';
    case 'treasury_30y': return v < 3.5 ? 'Low' : v < 4.5 ? 'Normal' : 'High';
    case 'inflation': case 'core_inflation': return v < 2 ? 'Low' : v <= 3 ? 'Normal' : 'High';
    case 'schiller_pe': return v >= 30 ? 'High' : v >= 20 ? 'Normal' : 'Low';
    case 'pe_ratio': return v >= 24 ? 'High' : v >= 20 ? 'Normal' : 'Low';
    case 'fwd_pe_ratio': return v >= 20.5 ? 'High' : v >= 16 ? 'Normal' : 'Low'; // bandas Birinyi del termómetro
    default: return 'Normal';
  }
}

const lastOnOrBefore = (m: PriceMap | undefined, today: string): string | undefined =>
  m && m.size ? [...m.keys()].filter((d) => d <= today).sort().pop() : undefined;

/** Valores macro a la fecha `today` (sin dato → la fila no se toca). */
export function indicatorUpdates(series: Record<string, PriceMap>, today: string): IndicatorUpdate[] {
  const out: IndicatorUpdate[] = [];
  for (const [key, src] of Object.entries(INDICATOR_SOURCES)) {
    const m = series[src.ticker];
    const asOf = lastOnOrBefore(m, today);
    if (!m || !asOf) continue;
    const value = src.kind === 'yoy' ? getCpiYoY(m, asOf) : getClosestPrice(m, asOf, 1);
    if (value == null || !Number.isFinite(value)) continue;
    out.push({ key, value, status: indicatorStatus(key, value), asOf });
  }
  return out;
}

export type { PriceMap };
export type ValuationInput = { spx: PriceMap; spxEps: PriceMap; fwdEps: PriceMap; cape: PriceMap };

/** Valuación actual con las reglas del termómetro / Indicadores. */
export function valuationUpdates(s: ValuationInput, today: string): IndicatorUpdate[] {
  const out: IndicatorUpdate[] = [];
  const push = (key: string, value: number | null, asOf: string) => {
    if (value != null && Number.isFinite(value) && value > 0) out.push({ key, value, status: indicatorStatus(key, value), asOf });
  };
  const d = lastOnOrBefore(s.spx, today);
  if (d) {
    const px = s.spx.get(d)!;
    push('sp500_price', px, d);
    const eps = epsAt(buildEpsSchedule(s.spxEps), d)?.eps;
    push('pe_ratio', eps ? px / eps : null, d);
    const fwd = getRecentPrice(s.fwdEps, d, 130);
    push('fwd_pe_ratio', fwd ? px / fwd : null, d);
  }
  const dc = lastOnOrBefore(s.cape, today);
  if (dc) push('schiller_pe', s.cape.get(dc)!, dc);
  return out;
}

/** Último día del mes de una fecha 'YYYY-MM-DD'. */
export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Un punto por mes (último valor del mes, fecha = fin de mes) para los meses posteriores a `afterMonth` ('YYYY-MM'). */
export function monthlyLast(m: PriceMap, afterMonth: string, today: string): HistoryPoint[] {
  const byMonth = new Map<string, { d: string; v: number }>();
  for (const [d, v] of m) {
    if (d > today || d.slice(0, 7) <= afterMonth || !Number.isFinite(v)) continue;
    const k = d.slice(0, 7);
    const cur = byMonth.get(k);
    if (!cur || d > cur.d) byMonth.set(k, { d, v });
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, { v }]) => ({ date: monthEnd(`${k}-01`), value: v }));
}

/** P/E mensual: antes de 1990, precio ÷ E de Shiller (E con arrastre); desde 1990, cierre de fin de mes ÷ EPS registrado. */
export function peMonthlyHistory(s: { shillerPrice: PriceMap; shillerEarnings: PriceMap; spx: PriceMap; spxEps: PriceMap }, today: string): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  const earn = [...s.shillerEarnings.entries()].filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b));
  let k = -1;
  for (const [d, px] of [...s.shillerPrice.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (d >= '1990-01-01') break;
    while (k + 1 < earn.length && earn[k + 1][0] <= d) k++;
    if (k >= 0 && px > 0) out.push({ date: monthEnd(d), value: px / earn[k][1] });
  }
  const sched = buildEpsSchedule(s.spxEps);
  const lastClose = new Map<string, string>(); // mes → fecha del último cierre
  for (const d of s.spx.keys()) if (d >= '1990-01-01' && d <= today && (!lastClose.has(d.slice(0, 7)) || d > lastClose.get(d.slice(0, 7))!)) lastClose.set(d.slice(0, 7), d);
  for (const [, d] of [...lastClose.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const eps = epsAt(sched, d)?.eps;
    const px = s.spx.get(d)!;
    if (eps && px > 0) out.push({ date: monthEnd(d), value: px / eps });
  }
  return out;
}

type Db = {
  btMarketData: { findMany(args: any): Promise<Array<{ ticker: string; date: Date; close: any }>> };
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe(sql: string, ...values: unknown[]): Promise<unknown>;
};

export const toMap = (rows: Array<{ d: string; v: unknown }>): PriceMap => {
  const m: PriceMap = new Map();
  for (const r of rows) { const v = Number(r.v); if (Number.isFinite(v)) m.set(String(r.d).slice(0, 10), v); }
  return m;
};

/** Lee las series y actualiza los valores actuales (macro + valuación). Devuelve lo escrito. */
export async function syncIndicatorsTable(db: Db, now = new Date()): Promise<IndicatorUpdate[]> {
  const today = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 500 * 86400000); // CPI: último dato con ~1.5 meses de rezago + su mismo mes un año antes
  const rows = await db.btMarketData.findMany({
    where: { OR: [
      { ticker: { in: [...new Set(Object.values(INDICATOR_SOURCES).map((s) => s.ticker))] }, date: { gte: from } },
      { ticker: { in: ['^GSPC', 'SPX_FWD_EPS'] }, date: { gte: from } },
      { ticker: 'SPX_EPS' },
    ] },
    select: { ticker: true, date: true, close: true },
  });
  const series: Record<string, PriceMap> = {};
  for (const r of rows) {
    const v = Number(r.close);
    if (Number.isFinite(v)) (series[r.ticker] ??= new Map()).set(r.date.toISOString().slice(0, 10), v);
  }
  const cape = toMap(await db.$queryRawUnsafe(`SELECT date::text AS d, cape AS v FROM bt_shiller_daily WHERE cape IS NOT NULL ORDER BY date DESC LIMIT 10`) as Array<{ d: string; v: unknown }>);
  const ups = [
    ...indicatorUpdates(series, today),
    ...valuationUpdates({ spx: series['^GSPC'] ?? new Map(), spxEps: series['SPX_EPS'] ?? new Map(), fwdEps: series['SPX_FWD_EPS'] ?? new Map(), cape }, today),
  ];
  for (const u of ups) {
    await db.$executeRawUnsafe('UPDATE indicators SET current_value = $1, status = $2, updated_at = now() WHERE key = $3', u.value, u.status, u.key);
  }
  return ups;
}
