import { getApiBase } from '@/lib/apiBase';
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

export interface TickerDetails {
  ticker: Ticker;
  historicalPrices: HistoricalPrice[];
  snapshot?: any;
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
    next: { revalidate: 60 },
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
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/market-data?ticker=${encodeURIComponent(ticker)}&from=${from}`, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const rows = (await res.json()) as { date: string; close: number | null }[];
  const last = [...rows].reverse().find((r) => r.close != null && Number.isFinite(Number(r.close)));
  return last ? { date: String(last.date).slice(0, 10), value: Number(last.close) } : null;
}

/** Últimos `points` cierres diarios de una serie de bt_market_data (para mini-gráficas), del más viejo al más nuevo. */
export async function getMarketSeries(ticker: string, points = 30): Promise<{ date: string; value: number }[]> {
  const from = new Date(Date.now() - Math.ceil(points * 1.6 + 10) * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/market-data?ticker=${encodeURIComponent(ticker)}&from=${from}`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const rows = (await res.json()) as { date: string; close: number | null }[];
  return rows.filter((r) => r.close != null && Number.isFinite(Number(r.close))).map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.close) })).slice(-points);
}

/** Últimos `points` valores del CAPE registrado diario (bt_shiller_daily). */
export async function getCapeSeries(points = 30): Promise<{ date: string; value: number }[]> {
  const from = new Date(Date.now() - Math.ceil(points * 1.6 + 10) * 86400000).toISOString().slice(0, 10);
  const res = await fetch(`${getApiBaseUrl()}/api/backtesting/shiller-daily?from=${from}`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const rows = (await res.json()) as { date: string; cape: number | null }[];
  return rows.filter((r) => r.cape != null && Number.isFinite(Number(r.cape))).map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.cape) })).slice(-points);
}

export async function getIndicators(): Promise<Indicator[]> {
  const res = await fetch(`${getApiBaseUrl()}/indicators`, {
    // Macro indicators change slowly — revalidate every hour
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error('Failed to fetch indicators');
  return res.json();
}

export async function getIndicatorDetails(key: string, limit = 150): Promise<IndicatorDetails> {
  const res = await fetch(`${getApiBaseUrl()}/indicators/${key}?limit=${limit}`, {
    // Indicator history: revalidate every hour
    next: { revalidate: 3600 },
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

