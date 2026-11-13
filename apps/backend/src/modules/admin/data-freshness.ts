// Monitor de frescura de datos (fase 1): por fuente, último dato disponible en la BD y estatus
// según su ritmo de publicación. No registra corridas (eso será la tabla data_source_runs, fase 2).
//
// lateDays / staleDays = antigüedad (días naturales desde el último dato hasta hoy) a partir de la
// cual la fuente está atrasada / vencida. Incluyen el retraso normal de publicación: p. ej. el CPI
// de octubre (fechado 2026-10-01) sale a mediados de noviembre, así que tener "octubre" el 13 nov
// es estar al día. Las consultas son fijas (sin entrada del usuario) y devuelven filas (serie, d).

export type SourceType = 'api' | 'file' | 'scraper' | 'computed';
export type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type FreshnessStatus = 'fresh' | 'late' | 'stale' | 'missing';

export interface SourceConfig {
  id: string;
  type: SourceType;
  cadence: Cadence;
  lateDays: number;
  staleDays: number;
  /** SQL que devuelve filas { series: text, d: text 'YYYY-MM-DD' } (una por serie). */
  sql: string;
  /** Series de bt_market_data que pertenecen a la fuente (para registrar corridas por serie). */
  series?: string[];
}

const mdMax = (source: string | null, tickers: string[]) =>
  `SELECT ticker AS series, max(date)::date::text AS d FROM bt_market_data WHERE ticker IN (${tickers.map((t) => `'${t}'`).join(', ')})${source ? ` AND source LIKE '${source}'` : ''} GROUP BY ticker`;

export const DATA_SOURCES: SourceConfig[] = [
  { id: 'stock_prices', type: 'api', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: `SELECT 'historical_prices' AS series, max(date)::date::text AS d FROM historical_prices` },
  { id: 'etf_prices', type: 'api', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: mdMax('yfinance', ['^GSPC', '^IXIC', 'SPY', 'QQQ', 'TQQQ', 'VOO', 'SCHD', 'JEPQ', 'SQQQ']), series: ['^GSPC', '^IXIC', 'SPY', 'QQQ', 'TQQQ', 'VOO', 'SCHD', 'JEPQ', 'SQQQ'] },
  { id: 'fred_daily', type: 'api', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: mdMax('fred', ['DGS2', 'DGS10', 'DGS30', 'DFEDTARU', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'VIXCLS', 'DCOILWTICO']), series: ['DGS2', 'DGS10', 'DGS30', 'DFEDTARU', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'VIXCLS', 'DCOILWTICO'] },
  { id: 'fred_inflation', type: 'api', cadence: 'monthly', lateDays: 50, staleDays: 80,
    sql: mdMax('fred', ['CPIAUCSL', 'CPILFESL']), series: ['CPIAUCSL', 'CPILFESL'] },
  { id: 'fred_money_housing', type: 'api', cadence: 'monthly', lateDays: 80, staleDays: 120,
    sql: mdMax('fred', ['M2SL', 'BOGMBASE', 'MSACSR']), series: ['M2SL', 'BOGMBASE', 'MSACSR'] },
  { id: 'fred_gdp', type: 'api', cadence: 'quarterly', lateDays: 150, staleDays: 200,
    sql: mdMax('fred', ['GDP', 'GDPC1']), series: ['GDP', 'GDPC1'] },
  { id: 'cnn_fear_greed', type: 'scraper', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: mdMax('cnn', ['FEAR_GREED']), series: ['FEAR_GREED'] },
  { id: 'breadth', type: 'scraper', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: mdMax(null, ['NYSE_ADV_VOL', 'NYSE_DEC_VOL', 'NSDQ_ADV_VOL', 'NSDQ_DEC_VOL', 'SPX_ADV_VOL', 'SPX_DEC_VOL']), series: ['NYSE_ADV_VOL', 'NYSE_DEC_VOL', 'NSDQ_ADV_VOL', 'NSDQ_DEC_VOL', 'SPX_ADV_VOL', 'SPX_DEC_VOL'] },
  { id: 'finra_margin', type: 'file', cadence: 'monthly', lateDays: 85, staleDays: 120,
    sql: mdMax('finra', ['FINRA_DEBIT']), series: ['FINRA_DEBIT'] },
  { id: 'shiller_cape', type: 'file', cadence: 'monthly', lateDays: 50, staleDays: 80,
    sql: `SELECT 'E10 (ie_data.xls)' AS series, max(e10_month)::text AS d FROM bt_shiller_daily` },
  { id: 'yardeni_fwd_eps', type: 'file', cadence: 'weekly', lateDays: 10, staleDays: 21,
    sql: mdMax('yardeni%', ['SPX_FWD_EPS']), series: ['SPX_FWD_EPS'] },
  // EPS del S&P 500 a 12 meses: columna E de ie_data.xls (Shiller), cargada por daily_update.py.
  { id: 'spx_eps', type: 'file', cadence: 'quarterly', lateDays: 200, staleDays: 280,
    sql: mdMax(null, ['SPX_EPS']), series: ['SPX_EPS'] },
  { id: 'sec_edgar', type: 'api', cadence: 'quarterly', lateDays: 60, staleDays: 100,
    sql: `SELECT 'filedDate (10-Q/10-K)' AS series, max(e->>'filedDate') AS d FROM tickers, jsonb_array_elements(COALESCE(historical_eps_quarterly::jsonb, '[]'::jsonb)) e WHERE e->>'source' = 'EDGAR'` },
  // GuruFocus Scrapper corre a diario (cron 6 AM en su repo) y rota los tickers.
  { id: 'gurufocus', type: 'scraper', cadence: 'daily', lateDays: 3, staleDays: 7,
    sql: `SELECT 'snapshots' AS series, max("scrapeDate")::date::text AS d FROM snapshots` },
  { id: 'thermo_history', type: 'computed', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: `SELECT 'bt_thermo_history' AS series, max(date)::date::text AS d FROM bt_thermo_history` },
  { id: 'bht_forward', type: 'computed', cadence: 'daily', lateDays: 4, staleDays: 8,
    sql: `SELECT 'bt_bht_forward' AS series, max(date)::date::text AS d FROM bt_bht_forward` },
];

/** Días naturales entre dos fechas 'YYYY-MM-DD' (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function freshnessStatus(lastDate: string | null, today: string, lateDays: number, staleDays: number): FreshnessStatus {
  if (!lastDate) return 'missing';
  const age = daysBetween(lastDate, today);
  return age <= lateDays ? 'fresh' : age <= staleDays ? 'late' : 'stale';
}

export interface SourceFreshness {
  id: string; type: SourceType; cadence: Cadence; lateDays: number; staleDays: number;
  /** Fecha del dato más atrasado entre sus series (la fuente está tan fresca como su peor serie). */
  lastDate: string | null;
  ageDays: number | null;
  status: FreshnessStatus;
  series: { series: string; lastDate: string | null; status: FreshnessStatus }[];
  /** Fecha a partir de la cual la fuente pasa a "atrasada" si no llega un dato nuevo (lastDate + lateDays). */
  expectedBy: string | null;
  /** Última corrida registrada en data_source_runs (fase 2) y la última exitosa. */
  lastRun: LastRun | null;
  lastOkAt: string | null;
  /** La última corrida terminó en error (aunque el dato todavía no esté vencido). */
  runFailing: boolean;
  error?: string;
}

export type LastRun = { status: 'ok' | 'partial' | 'error'; process: string; finishedAt: string; rows: number | null; message: string | null };

/** 'YYYY-MM-DD' + n días. */
export function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}/;

/** Filas de la consulta → resultado de la fuente. */
export function evaluateSource(
  cfg: SourceConfig, rows: { series: string; d: string | null }[], today: string, error?: string,
  run: { lastRun: LastRun | null; lastOkAt: string | null } = { lastRun: null, lastOkAt: null },
): SourceFreshness {
  const series = rows.map((r) => {
    const d = r.d && ISO.test(r.d) ? r.d.slice(0, 10) : null;
    return { series: r.series, lastDate: d, status: freshnessStatus(d, today, cfg.lateDays, cfg.staleDays) };
  });
  const dates = series.map((s) => s.lastDate).filter((d): d is string => d != null).sort();
  const lastDate = series.length && dates.length === series.length ? dates[0] : null;
  return {
    id: cfg.id, type: cfg.type, cadence: cfg.cadence, lateDays: cfg.lateDays, staleDays: cfg.staleDays,
    lastDate, ageDays: lastDate ? daysBetween(lastDate, today) : null,
    status: error ? 'missing' : freshnessStatus(lastDate, today, cfg.lateDays, cfg.staleDays),
    series,
    expectedBy: lastDate ? addDays(lastDate, cfg.lateDays) : null,
    lastRun: run.lastRun, lastOkAt: run.lastOkAt, runFailing: run.lastRun?.status === 'error',
    ...(error ? { error } : {}),
  };
}

export function summarize(items: SourceFreshness[]): Record<FreshnessStatus, number> & { failingRuns: number } {
  const out = { fresh: 0, late: 0, stale: 0, missing: 0, failingRuns: 0 };
  for (const i of items) { out[i.status]++; if (i.runFailing) out.failingRuns++; }
  return out;
}

/** Última corrida por fuente y la última exitosa (consulta fija sobre data_source_runs, 120 días). */
export const LAST_RUNS_SQL = `SELECT source,
  (array_agg(json_build_object('status', status, 'process', process, 'finishedAt', finished_at, 'rows', rows, 'message', message) ORDER BY finished_at DESC))[1] AS last,
  max(finished_at) FILTER (WHERE status = 'ok') AS last_ok
FROM data_source_runs WHERE finished_at > now() - interval '120 days' GROUP BY source`;

export function toRunInfo(row: { last: any; last_ok: Date | string | null } | undefined): { lastRun: LastRun | null; lastOkAt: string | null } {
  if (!row) return { lastRun: null, lastOkAt: null };
  const l = typeof row.last === 'string' ? JSON.parse(row.last) : row.last;
  const iso = (v: any) => (v == null ? null : new Date(v).toISOString());
  return {
    lastRun: l ? { status: l.status, process: l.process, finishedAt: iso(l.finishedAt)!, rows: l.rows ?? null, message: l.message ?? null } : null,
    lastOkAt: iso(row.last_ok),
  };
}

/** Serie de bt_market_data → id de su fuente (null si no pertenece a ninguna). */
export function sourceForSeries(ticker: string): string | null {
  for (const s of DATA_SOURCES) if (s.series?.includes(ticker)) return s.id;
  return null;
}
