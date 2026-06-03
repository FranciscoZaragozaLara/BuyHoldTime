export interface BarData {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sector: string;
  buyHoldIndex: number; // 1-100
  recommendation: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
  pe: number;
  dy: number; // Dividend Yield
  cap: string; // Market Cap
}

// 5 Main Indices + 50 Recommended Tickers
export const INDEX_TICKERS = ['SPY', 'VOO', 'QQQ', 'SCHD', 'TQQQ'];

export const TOP_RECOMMENDED: TickerInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 178.52, changePercent: 1.25, sector: 'Technology', buyHoldIndex: 88, recommendation: 'Strong Buy', pe: 28.4, dy: 0.52, cap: '2.8T' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 421.90, changePercent: -0.45, sector: 'Technology', buyHoldIndex: 82, recommendation: 'Buy', pe: 35.1, dy: 0.71, cap: '3.1T' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 914.35, changePercent: 3.82, sector: 'Technology', buyHoldIndex: 94, recommendation: 'Strong Buy', pe: 72.3, dy: 0.02, cap: '2.2T' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.12, changePercent: 0.90, sector: 'Consumer Cyclical', buyHoldIndex: 78, recommendation: 'Buy', pe: 41.2, dy: 0.00, cap: '1.8T' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.50, changePercent: 1.15, sector: 'Communication Services', buyHoldIndex: 85, recommendation: 'Buy', pe: 25.8, dy: 0.46, cap: '2.1T' },
];

export const ALL_TICKERS: TickerInfo[] = [
  ...TOP_RECOMMENDED,
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', price: 512.40, changePercent: 0.52, sector: 'Index', buyHoldIndex: 75, recommendation: 'Buy', pe: 24.2, dy: 1.32, cap: '500B' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', price: 470.15, changePercent: 0.51, sector: 'Index', buyHoldIndex: 76, recommendation: 'Buy', pe: 24.1, dy: 1.33, cap: '410B' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 438.90, changePercent: 0.85, sector: 'Index', buyHoldIndex: 70, recommendation: 'Hold', pe: 34.5, dy: 0.55, cap: '220B' },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', price: 80.25, changePercent: -0.12, sector: 'Index', buyHoldIndex: 81, recommendation: 'Buy', pe: 15.4, dy: 3.45, cap: '52B' },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', price: 58.12, changePercent: 2.50, sector: 'Index', buyHoldIndex: 55, recommendation: 'Hold', pe: 102.0, dy: 0.12, cap: '21B' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', price: 175.40, changePercent: -1.80, sector: 'Consumer Cyclical', buyHoldIndex: 45, recommendation: 'Sell', pe: 58.4, dy: 0.00, cap: '550B' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', price: 475.20, changePercent: 2.10, sector: 'Communication Services', buyHoldIndex: 86, recommendation: 'Strong Buy', pe: 24.8, dy: 0.42, cap: '1.2T' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', price: 405.60, changePercent: -0.20, sector: 'Financial', buyHoldIndex: 79, recommendation: 'Buy', pe: 18.2, dy: 0.00, cap: '880B' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', price: 780.10, changePercent: 1.95, sector: 'Healthcare', buyHoldIndex: 89, recommendation: 'Strong Buy', pe: 115.0, dy: 0.67, cap: '740B' },
  { symbol: 'V', name: 'Visa Inc.', price: 275.30, changePercent: 0.35, sector: 'Financial', buyHoldIndex: 80, recommendation: 'Buy', pe: 32.1, dy: 0.76, cap: '560B' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 195.40, changePercent: 0.60, sector: 'Financial', buyHoldIndex: 83, recommendation: 'Strong Buy', pe: 12.1, dy: 2.35, cap: '565B' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', price: 510.20, changePercent: -0.85, sector: 'Healthcare', buyHoldIndex: 72, recommendation: 'Hold', pe: 19.5, dy: 1.48, cap: '470B' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', price: 1350.50, changePercent: 2.80, sector: 'Technology', buyHoldIndex: 87, recommendation: 'Strong Buy', pe: 45.3, dy: 1.56, cap: '630B' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', price: 118.20, changePercent: 0.45, sector: 'Energy', buyHoldIndex: 74, recommendation: 'Buy', pe: 13.1, dy: 3.21, cap: '470B' },
  { symbol: 'WMT', name: 'Walmart Inc.', price: 60.15, changePercent: -0.10, sector: 'Consumer Defensive', buyHoldIndex: 76, recommendation: 'Buy', pe: 27.5, dy: 1.39, cap: '480B' },
  { symbol: 'MA', name: 'Mastercard Incorporated', price: 465.10, changePercent: 0.20, sector: 'Financial', buyHoldIndex: 78, recommendation: 'Buy', pe: 35.8, dy: 0.56, cap: '430B' },
  { symbol: 'PG', name: 'The Procter & Gamble Company', price: 162.30, changePercent: -0.30, sector: 'Consumer Defensive', buyHoldIndex: 73, recommendation: 'Hold', pe: 26.1, dy: 2.47, cap: '380B' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', price: 345.20, changePercent: -0.50, sector: 'Consumer Cyclical', buyHoldIndex: 70, recommendation: 'Hold', pe: 22.4, dy: 2.61, cap: '340B' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 152.10, changePercent: -0.40, sector: 'Healthcare', buyHoldIndex: 68, recommendation: 'Hold', pe: 15.6, dy: 3.26, cap: '360B' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', price: 125.40, changePercent: 0.15, sector: 'Healthcare', buyHoldIndex: 77, recommendation: 'Buy', pe: 16.5, dy: 2.46, cap: '318B' },
  { symbol: 'COST', name: 'Costco Wholesale Corp.', price: 725.30, changePercent: 0.70, sector: 'Consumer Defensive', buyHoldIndex: 81, recommendation: 'Buy', pe: 48.2, dy: 0.64, cap: '320B' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', price: 178.20, changePercent: 0.40, sector: 'Healthcare', buyHoldIndex: 75, recommendation: 'Buy', pe: 14.8, dy: 3.48, cap: '315B' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', price: 160.40, changePercent: 1.85, sector: 'Technology', buyHoldIndex: 65, recommendation: 'Hold', pe: 65.0, dy: 0.00, cap: '260B' },
  { symbol: 'ADBE', name: 'Adobe Inc.', price: 485.50, changePercent: -1.20, sector: 'Technology', buyHoldIndex: 71, recommendation: 'Hold', pe: 32.5, dy: 0.00, cap: '218B' },
  { symbol: 'PEP', name: 'PepsiCo, Inc.', price: 168.40, changePercent: -0.15, sector: 'Consumer Defensive', buyHoldIndex: 74, recommendation: 'Buy', pe: 24.8, dy: 3.01, cap: '230B' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', price: 285.20, changePercent: 0.95, sector: 'Technology', buyHoldIndex: 79, recommendation: 'Buy', pe: 30.1, dy: 0.56, cap: '275B' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', price: 610.30, changePercent: 1.45, sector: 'Communication Services', buyHoldIndex: 82, recommendation: 'Buy', pe: 42.4, dy: 0.00, cap: '265B' },
  { symbol: 'KO', name: 'The Coca-Cola Company', price: 60.50, changePercent: -0.20, sector: 'Consumer Defensive', buyHoldIndex: 75, recommendation: 'Buy', pe: 23.5, dy: 3.17, cap: '260B' },
  { symbol: 'BAC', name: 'Bank of America Corp.', price: 37.80, changePercent: 0.30, sector: 'Financial', buyHoldIndex: 72, recommendation: 'Hold', pe: 11.2, dy: 2.54, cap: '295B' },
  { symbol: 'CVX', name: 'Chevron Corporation', price: 155.60, changePercent: -0.10, sector: 'Energy', buyHoldIndex: 69, recommendation: 'Hold', pe: 12.4, dy: 4.19, cap: '290B' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific', price: 565.40, changePercent: -0.60, sector: 'Healthcare', buyHoldIndex: 76, recommendation: 'Buy', pe: 33.2, dy: 0.28, cap: '218B' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', price: 48.90, changePercent: -0.05, sector: 'Technology', buyHoldIndex: 68, recommendation: 'Hold', pe: 13.5, dy: 3.27, cap: '198B' },
  { symbol: 'ACN', name: 'Accenture plc', price: 338.50, changePercent: 0.10, sector: 'Technology', buyHoldIndex: 74, recommendation: 'Buy', pe: 28.1, dy: 1.52, cap: '210B' },
  { symbol: 'DIS', name: 'The Walt Disney Company', price: 112.40, changePercent: -0.80, sector: 'Communication Services', buyHoldIndex: 60, recommendation: 'Hold', pe: 64.0, dy: 0.40, cap: '205B' },
  { symbol: 'LIN', name: 'Linde plc', price: 445.60, changePercent: 0.35, sector: 'Basic Materials', buyHoldIndex: 78, recommendation: 'Buy', pe: 31.2, dy: 1.25, cap: '215B' },
  { symbol: 'ABT', name: 'Abbott Laboratories', price: 108.40, changePercent: -0.45, sector: 'Healthcare', buyHoldIndex: 73, recommendation: 'Hold', pe: 24.5, dy: 2.03, cap: '188B' },
  { symbol: 'INTC', name: 'Intel Corporation', price: 30.15, changePercent: -2.40, sector: 'Technology', buyHoldIndex: 35, recommendation: 'Strong Sell', pe: 85.0, dy: 1.66, cap: '128B' },
  { symbol: 'PFE', name: 'Pfizer Inc.', price: 28.40, changePercent: -0.90, sector: 'Healthcare', buyHoldIndex: 48, recommendation: 'Sell', pe: 14.5, dy: 5.92, cap: '160B' },
  { symbol: 'VZ', name: 'Verizon Communications', price: 39.80, changePercent: -0.15, sector: 'Communication Services', buyHoldIndex: 64, recommendation: 'Hold', pe: 8.5, dy: 6.68, cap: '167B' },
  { symbol: 'QCOM', name: 'Qualcomm Incorporated', price: 168.90, changePercent: 1.50, sector: 'Technology', buyHoldIndex: 80, recommendation: 'Buy', pe: 21.4, dy: 2.01, cap: '189B' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', price: 355.20, changePercent: 0.40, sector: 'Industrials', buyHoldIndex: 82, recommendation: 'Buy', pe: 16.2, dy: 1.46, cap: '178B' },
  { symbol: 'TXN', name: 'Texas Instruments Inc.', price: 165.40, changePercent: 0.20, sector: 'Technology', buyHoldIndex: 71, recommendation: 'Hold', pe: 26.5, dy: 3.14, cap: '150B' },
  { symbol: 'UNP', name: 'Union Pacific Corporation', price: 238.10, changePercent: -0.30, sector: 'Industrials', buyHoldIndex: 73, recommendation: 'Hold', pe: 21.2, dy: 2.18, cap: '145B' },
  { symbol: 'HON', name: 'Honeywell International Inc.', price: 198.50, changePercent: -0.10, sector: 'Industrials', buyHoldIndex: 70, recommendation: 'Hold', pe: 22.4, dy: 2.18, cap: '130B' },
  { symbol: 'NKE', name: 'NIKE, Inc.', price: 92.40, changePercent: -1.10, sector: 'Consumer Cyclical', buyHoldIndex: 58, recommendation: 'Hold', pe: 25.1, dy: 1.60, cap: '140B' },
  { symbol: 'GE', name: 'General Electric Company', price: 156.20, changePercent: 1.30, sector: 'Industrials', buyHoldIndex: 84, recommendation: 'Buy', pe: 22.8, dy: 0.72, cap: '170B' },
  { symbol: 'IBM', name: 'International Business Machines', price: 185.40, changePercent: 0.85, sector: 'Technology', buyHoldIndex: 76, recommendation: 'Buy', pe: 19.4, dy: 3.58, cap: '170B' },
  { symbol: 'GS', name: 'The Goldman Sachs Group', price: 410.20, changePercent: 0.50, sector: 'Financial', buyHoldIndex: 78, recommendation: 'Buy', pe: 15.2, dy: 2.68, cap: '135B' },
  { symbol: 'MS', name: 'Morgan Stanley', price: 92.50, changePercent: 0.30, sector: 'Financial', buyHoldIndex: 74, recommendation: 'Buy', pe: 16.1, dy: 3.68, cap: '152B' },
  { symbol: 'AXP', name: 'American Express Company', price: 220.40, changePercent: 0.90, sector: 'Financial', buyHoldIndex: 81, recommendation: 'Buy', pe: 18.5, dy: 1.27, cap: '158B' }
];

// Helper to seed random numbers based on a string (for deterministic data)
function seedRandom(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Generate 2 years of daily data (approx. 500 trading days)
export function generateHistoricalData(symbol: string): BarData[] {
  const data: BarData[] = [];
  const rand = seedRandom(symbol);
  
  // Find seed price
  const tickerInfo = ALL_TICKERS.find(t => t.symbol === symbol);
  let currentPrice = tickerInfo ? tickerInfo.price : 100;
  
  // 2 years back is ~730 days calendar, ~504 trading days
  const today = new Date();
  const startDate = new Date();
  startDate.setFullYear(today.getFullYear() - 2);
  
  const tradingDays: Date[] = [];
  const curr = new Date(startDate);
  
  while (curr <= today) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // Skip weekends
      tradingDays.push(new Date(curr));
    }
    curr.setDate(curr.getDate() + 1);
  }
  
  // Generate prices going backward, then reverse so it's chronologically ordered
  const prices: number[] = [];
  prices.push(currentPrice);
  
  // High volatility for TQQQ, medium for tech, low for index/SCHD
  let volatility = 0.015;
  if (symbol === 'TQQQ') volatility = 0.045;
  else if (symbol === 'QQQ' || symbol === 'NVDA' || symbol === 'TSLA' || symbol === 'AMD') volatility = 0.025;
  else if (symbol === 'VOO' || symbol === 'SPY' || symbol === 'SCHD') volatility = 0.010;
  
  // Drift: average positive returns (stocks go up on average over 2 years)
  const drift = 0.0003; 
  
  for (let i = 0; i < tradingDays.length - 1; i++) {
    const change = 1 + drift + (rand() - 0.49) * volatility * 2;
    currentPrice = currentPrice / change; // Go backwards
    prices.push(currentPrice);
  }
  
  prices.reverse();
  
  // Construct the BarData array
  for (let i = 0; i < tradingDays.length; i++) {
    const dateStr = tradingDays[i].toISOString().split('T')[0];
    const price = prices[i];
    const dailyVol = price * volatility;
    
    const open = price + (rand() - 0.5) * dailyVol * 0.5;
    const high = Math.max(price, open) + rand() * dailyVol * 0.5;
    const low = Math.min(price, open) - rand() * dailyVol * 0.5;
    const close = price;
    const volume = Math.round(1000000 + rand() * 9000000);
    
    data.push({
      time: dateStr,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
  }
  
  return data;
}

// Calculate simulation metrics
export interface YearlyPerformance {
  year: number;
  initialValue: number;
  finalValue: number;
  lowValue: number;
  highValue: number;
  changePercent: number;
  invStartCurrentValue: number;
  invStartChangePercent: number;
  invLowCurrentValue: number;
  invLowChangePercent: number;
}

export function getYearlyPerformance(symbol: string): YearlyPerformance[] {
  const data = generateHistoricalData(symbol);
  if (data.length === 0) return [];
  
  const currentPrice = data[data.length - 1].close;
  
  // Group by year
  const byYear: { [key: number]: BarData[] } = {};
  data.forEach(bar => {
    const year = new Date(bar.time).getFullYear();
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(bar);
  });
  
  const perf: YearlyPerformance[] = [];
  
  Object.keys(byYear).forEach(yearStr => {
    const year = parseInt(yearStr);
    const bars = byYear[year];
    
    const initialValue = bars[0].open;
    const finalValue = bars[bars.length - 1].close;
    
    let lowValue = bars[0].low;
    let highValue = bars[0].high;
    
    bars.forEach(bar => {
      if (bar.low < lowValue) lowValue = bar.low;
      if (bar.high > highValue) highValue = bar.high;
    });
    
    const changePercent = ((finalValue - initialValue) / initialValue) * 100;
    
    // If you invested $1000 at the start of the year
    const qtyStart = 1000 / initialValue;
    const invStartCurrentValue = qtyStart * currentPrice;
    const invStartChangePercent = ((currentPrice - initialValue) / initialValue) * 100;
    
    // If you invested $1000 at the Low of the year
    const qtyLow = 1000 / lowValue;
    const invLowCurrentValue = qtyLow * currentPrice;
    const invLowChangePercent = ((currentPrice - lowValue) / lowValue) * 100;
    
    perf.push({
      year,
      initialValue: parseFloat(initialValue.toFixed(2)),
      finalValue: parseFloat(finalValue.toFixed(2)),
      lowValue: parseFloat(lowValue.toFixed(2)),
      highValue: parseFloat(highValue.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      invStartCurrentValue: parseFloat(invStartCurrentValue.toFixed(2)),
      invStartChangePercent: parseFloat(invStartChangePercent.toFixed(2)),
      invLowCurrentValue: parseFloat(invLowCurrentValue.toFixed(2)),
      invLowChangePercent: parseFloat(invLowChangePercent.toFixed(2))
    });
  });
  
  return perf.sort((a, b) => b.year - a.year); // Latest years first
}
