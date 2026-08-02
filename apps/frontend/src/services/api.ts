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
  id: string;
  tickerId: string;
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
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

export async function getTickers(): Promise<Ticker[]> {
  const res = await fetch(`${getApiBaseUrl()}/tickers`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch tickers');
  return res.json();
}

export async function getTickerDetails(symbol: string, limit = 500): Promise<TickerDetails> {
  const res = await fetch(`${getApiBaseUrl()}/tickers/${symbol}?limit=${limit}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch ticker details for ${symbol}`);
  return res.json();
}

export async function getIndicators(): Promise<Indicator[]> {
  const res = await fetch(`${getApiBaseUrl()}/indicators`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch indicators');
  return res.json();
}

export async function getIndicatorDetails(key: string, limit = 150): Promise<IndicatorDetails> {
  const res = await fetch(`${getApiBaseUrl()}/indicators/${key}?limit=${limit}`, {
    cache: 'no-store',
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

