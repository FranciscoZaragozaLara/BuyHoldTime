import { getApiBase } from '@/lib/apiBase';
import { MARKET_DATA_TAG } from '@/lib/revalidation';
import { fetchMatrixCells, MATRIX_INSTRUMENTS, type MatrixCell, type MatrixInstrument } from '@/lib/bhtMatrix';
export interface FundamentalTtm { ttm: number; prev: number | null; yoy: number | null; lastQuarter: string }

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sector: string;
  buyHoldIndex: number;
  recommendation: string;
  pe: number;
  dy: number;
  cap: string;
  createdAt: string;
  updatedAt: string;
  
  // Financial Valuation Fields (Yahoo Finance)
  eps?: number | null;
  forwardPe?: number | null;
  trailingPe?: number | null;
  pegRatio?: number | null;
  enterpriseValue?: number | null;
  avgVolume?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  dividendRate?: number | null;
  bookValue?: number | null;
  /** Lista (/tickers): máximo histórico, último piso (mínimo de la corrección ≥ 10% más reciente) y rendimientos,
   *  con los cierres diarios y el precio en vivo. */
  levels?: {
    ath: number; athDate: string; fromAth: number;
    bottom: number | null; bottomDate: string | null; fromBottom: number | null;
    perf1M: number | null; perfYTD: number | null; perf1Y: number | null; perf5Y: number | null;
  } | null;
  /** Lista (/tickers): fundamentales de los últimos 12 meses (suma de los 4 trimestres más recientes de EDGAR) con su
   *  cambio contra los 12 meses previos; null en ETFs. Cada métrica es null si le faltan trimestres. */
  fundamentals?: {
    revenue: FundamentalTtm | null;
    eps: FundamentalTtm | null;
    ebit: FundamentalTtm | null;
    margin: { now: number; prev: number | null } | null;
    pe: { now: number; prev: number; yoy: number } | null;
  } | null;
  historicalEps?: Record<string, { value: number; source: 'real' | 'estimated' }> | null;
  historicalDividends?: Record<string, number> | null;
  historicalEpsQuarterly?: Array<{
    date: string;
    period: string;
    fiscalYear: string;
    revenue: number;
    netIncome: number;
    eps: number;
    epsDiluted: number;
    sharesOutstanding: number;
    peRatio?: number | null;
    source: 'real' | 'estimated';
  }> | null;
  sectorTerminalPe?: number | null;
}

export interface HistoricalPrice {
  // Opcionales: la página de detalle los quita para aligerar el HTML (ver lib/slimPrices).
  id?: string;
  tickerId?: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

/** Fundamentales propios de la ficha (EDGAR): los de la lista más P/S y rendimiento de utilidades. */
export type TickerFundamentals = NonNullable<Ticker['fundamentals']> & { ps: number | null; earningsYield: number | null };

export interface TickerDetails {
  ticker: Ticker;
  historicalPrices: HistoricalPrice[];
  /** Solo lo público del snapshot de GuruFocus: perfil y posiciones de un ETF (N-PORT). */
  snapshot?: any;
  fundamentals?: TickerFundamentals | null;
  /** EPS proyectado por el backend: modelo propio (EDGAR) mezclado con el consenso de analistas (60 %) si lo hay. */
  projection?: EpsProjection | null;
}

export interface EpsProjection {
  basis: 'blend' | 'model';
  analystWeight: number;
  modelStartGrowth: number;
  epsNext12m: number;
  years: Array<{ calendarYear: number; label: string; eps: number; epsNext: number }>;
}

export interface Indicator {
  id: string;
  key: string;
  name: string;
  currentValue: number;
  unit: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorHistory {
  id: string;
  indicatorId: string;
  date: string;
  value: number;
}

export interface IndicatorDetails {
  indicator: Indicator;
  history: IndicatorHistory[];
}

export interface Subscription {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

function getApiBaseUrl(): string {
  return getApiBase();
}

export async function getTickers(): Promise<Ticker[]> {
  const res = await fetch(`${getApiBaseUrl()}/tickers`, {
    // Revalidate ticker list every 60 seconds (prices update frequently)
    next: { revalidate: 60, tags: [MARKET_DATA_TAG] },
  });
  if (!res.ok) throw new Error('Failed to fetch tickers');
  return res.json();
}

export async function getTickerDetails(symbol: string, limit = 500, noStore = false): Promise<TickerDetails> {
  const res = await fetch(`${getApiBaseUrl()}/tickers/${symbol}?limit=${limit}`, noStore
    // Serie completa (>2MB): no cachear, siempre fresca (el data cache de Next rechaza items >2MB)
    ? { cache: 'no-store' }
    // Revalidate symbol detail pages every 2 minutes
    : { next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`Failed to fetch ticker details for ${symbol}`);
  return res.json();
}

/** Último cierre de una serie diaria de bt_market_data (p. ej. FEAR_GREED), o null. */
export async function getLatestMarketValue(ticker: string, lookbackDays = 14): Promise<{ date: string; value: number } | null> {
  const from = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/market-data?ticker=${encodeURIComponent(ticker)}&from=${from}`, { next: { revalidate: 3600, tags: [MARKET_DATA_TAG] } });
  if (!res.ok) return null;
  const rows = (await res.json()) as { date: string; close: number | null }[];
  const last = [...rows].reverse().find((r) => r.close != null && Number.isFinite(Number(r.close)));
  return last ? { date: String(last.date).slice(0, 10), value: Number(last.close) } : null;
}

/** Últimos `points` cierres diarios de una serie de bt_market_data (para mini-gráficas), del más viejo al más nuevo. */
export async function getMarketSeries(ticker: string, points = 30): Promise<{ date: string; value: number }[]> {
  const from = new Date(Date.now() - Math.ceil(points * 1.6 + 10) * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/market-data?ticker=${encodeURIComponent(ticker)}&from=${from}`, { next: { revalidate: 3600, tags: [MARKET_DATA_TAG] } });
  if (!res.ok) return [];
  const rows = (await res.json()) as { date: string; close: number | null }[];
  return rows.filter((r) => r.close != null && Number.isFinite(Number(r.close))).map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.close) })).slice(-points);
}

/** Últimos `points` valores del CAPE registrado diario (bt_shiller_daily). */
export async function getCapeSeries(points = 30): Promise<{ date: string; value: number }[]> {
  const from = new Date(Date.now() - Math.ceil(points * 1.6 + 10) * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/shiller-daily?from=${from}`, { next: { revalidate: 3600, tags: [MARKET_DATA_TAG] } });
  if (!res.ok) return [];
  const rows = (await res.json()) as { date: string; cape: number | null }[];
  return rows.filter((r) => r.cape != null && Number.isFinite(Number(r.cape))).map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.cape) })).slice(-points);
}

export async function getIndicators(): Promise<Indicator[]> {
  const res = await fetch(`${getApiBaseUrl()}/indicators`, {
    // Macro indicators change slowly — revalidate every hour
    next: { revalidate: 3600, tags: [MARKET_DATA_TAG] },
  });
  if (!res.ok) throw new Error('Failed to fetch indicators');
  return res.json();
}

export async function getIndicatorDetails(key: string, limit = 150): Promise<IndicatorDetails> {
  const res = await fetch(`${getApiBaseUrl()}/indicators/${key}?limit=${limit}`, {
    // Indicator history: revalidate every hour
    next: { revalidate: 3600, tags: [MARKET_DATA_TAG] },
  });
  if (!res.ok) throw new Error(`Failed to fetch indicator details for ${key}`);
  return res.json();
}

export async function createSubscription(name: string, email: string): Promise<Subscription> {
  const res = await fetch(`${getApiBaseUrl()}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create subscription');
  }
  return res.json();
}

export interface MarginDebtRecord {
  id: string;
  date: string;
  debitBalances: number;
  freeCreditCash: number;
  freeCreditMargin: number;
  netCreditBalance: number;
  sp500Price: number | null;
  currencyInCirculation?: number | null;
  marginCurrencyRatio?: number | null;
  marginDebtRatio: number | null;
  marginDebtYoY: number | null;
  sp500YoY: number | null;
  divergence: number | null;
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarginDebtRiskSummary extends Partial<MarginDebtRecord> {
  latestDate?: string;
  debitChangeMoM?: number;
}

export async function getMarginDebtHistory(months = 120): Promise<MarginDebtRecord[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/margin-debt/history?months=${months}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch margin debt history');
  return res.json();
}

export async function getMarginDebtRiskSummary(): Promise<MarginDebtRiskSummary> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/margin-debt/risk-summary`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch margin debt risk summary');
  return res.json();
}


/** Termómetro BHT de hoy (mismo cálculo que guarda la historia), para la home. null si el API falla. */
export interface ThermoToday {
  date: string;
  value: number;
  parts: { key: string; score: number; weight: number; value: number }[];
  hy: { bonus: number; label: string };
  liq: { bonus: number; label: string };
  oil: { bonus: number; label: string };
  /** Régimen tendencial del S&P 500 de hoy (cierre en vivo vs SMA 50/200). */
  trend?: { regime: string; close: number | null; sma50: number | null; sma200: number | null } | null;
}
export async function getThermoLive(): Promise<ThermoToday | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/backtesting/thermo-live`, { next: { revalidate: 300, tags: [MARKET_DATA_TAG] } });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j.value === 'number' && Array.isArray(j.parts) ? (j as ThermoToday) : null;
  } catch {
    return null;
  }
}

/** Matriz BHT × tendencia (últimos 5 años) de S&P 500, Nasdaq-100 y TQQQ para la tabla de rendimientos de la home. */
export async function getBhtMatrices5y(date: string): Promise<Record<MatrixInstrument, MatrixCell[] | null>> {
  const init = { next: { revalidate: 3600, tags: [MARKET_DATA_TAG] } } as RequestInit;
  const rs = await Promise.all(MATRIX_INSTRUMENTS.map((i) => fetchMatrixCells(getApiBaseUrl(), date, i, '5y', init)));
  return Object.fromEntries(MATRIX_INSTRUMENTS.map((i, k) => [i, rs[k]])) as Record<MatrixInstrument, MatrixCell[] | null>;
}
