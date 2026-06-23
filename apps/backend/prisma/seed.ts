import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

// 5 Main Indices + 50 Recommended Tickers
const TICKER_SEEDS = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 178.52, changePercent: 1.25, sector: 'Technology', buyHoldIndex: 88, recommendation: 'Strong Buy', pe: 28.4, dy: 0.52, cap: '2.8T' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 421.90, changePercent: -0.45, sector: 'Technology', buyHoldIndex: 82, recommendation: 'Buy', pe: 35.1, dy: 0.71, cap: '3.1T' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 914.35, changePercent: 3.82, sector: 'Technology', buyHoldIndex: 94, recommendation: 'Strong Buy', pe: 72.3, dy: 0.02, cap: '2.2T' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.12, changePercent: 0.90, sector: 'Consumer Cyclical', buyHoldIndex: 78, recommendation: 'Buy', pe: 41.2, dy: 0.00, cap: '1.8T' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.50, changePercent: 1.15, sector: 'Communication Services', buyHoldIndex: 85, recommendation: 'Buy', pe: 25.8, dy: 0.46, cap: '2.1T' },
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
  { symbol: 'MA', name: 'Mastercard Incorporated', price: 450.00, changePercent: 0.0, sector: 'Financial', buyHoldIndex: 75, recommendation: 'Buy', pe: 30.0, dy: 0.6, cap: '420B' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', price: 220.00, changePercent: 0.0, sector: 'Index', buyHoldIndex: 75, recommendation: 'Buy', pe: 30.0, dy: 0.8, cap: '15B' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', price: 230.00, changePercent: 0.0, sector: 'Index', buyHoldIndex: 75, recommendation: 'Buy', pe: 30.0, dy: 0.5, cap: '18B' },
  { symbol: 'IBB', name: 'iShares Biotechnology ETF', price: 135.00, changePercent: 0.0, sector: 'Index', buyHoldIndex: 70, recommendation: 'Hold', pe: 25.0, dy: 1.2, cap: '7B' },
  { symbol: 'NLR', name: 'VanEck Uranium+Nuclear Energy ETF', price: 80.00, changePercent: 0.0, sector: 'Index', buyHoldIndex: 70, recommendation: 'Hold', pe: 20.0, dy: 1.8, cap: '2B' },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X Shares', price: 45.00, changePercent: 0.0, sector: 'Index', buyHoldIndex: 60, recommendation: 'Hold', pe: 35.0, dy: 0.07, cap: '8B' },
  { symbol: 'ADI', name: 'Analog Devices, Inc.', price: 190.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 25.0, dy: 1.8, cap: '90B' },
  { symbol: 'AMAT', name: 'Applied Materials, Inc.', price: 210.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 28.0, dy: 0.7, cap: '170B' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', price: 160.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 80, recommendation: 'Buy', pe: 65.0, dy: 0.0, cap: '260B' },
  { symbol: 'AMGN', name: 'Amgen Inc.', price: 280.00, changePercent: 0.0, sector: 'Healthcare', buyHoldIndex: 70, recommendation: 'Hold', pe: 22.0, dy: 3.2, cap: '150B' },
  { symbol: 'APP', name: 'AppLovin Corporation', price: 80.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 35.0, dy: 0.0, cap: '27B' },
  { symbol: 'ARM', name: 'Arm Holdings plc', price: 125.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 80.0, dy: 0.1, cap: '130B' },
  { symbol: 'ASML', name: 'ASML Holding N.V.', price: 950.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 85, recommendation: 'Strong Buy', pe: 45.0, dy: 0.6, cap: '380B' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', price: 3600.00, changePercent: 0.0, sector: 'Consumer Cyclical', buyHoldIndex: 75, recommendation: 'Buy', pe: 30.0, dy: 0.0, cap: '120B' },
  { symbol: 'CDNS', name: 'Cadence Design Systems, Inc.', price: 300.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 50.0, dy: 0.0, cap: '80B' },
  { symbol: 'CEG', name: 'Constellation Energy Corporation', price: 210.00, changePercent: 0.0, sector: 'Energy', buyHoldIndex: 70, recommendation: 'Hold', pe: 25.0, dy: 0.7, cap: '66B' },
  { symbol: 'CME', name: 'CME Group Inc.', price: 215.00, changePercent: 0.0, sector: 'Financial', buyHoldIndex: 75, recommendation: 'Buy', pe: 24.0, dy: 4.5, cap: '77B' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', price: 725.00, changePercent: 0.0, sector: 'Consumer Defensive', buyHoldIndex: 80, recommendation: 'Buy', pe: 48.0, dy: 0.6, cap: '320B' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings, Inc.', price: 320.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 85, recommendation: 'Strong Buy', pe: 80.0, dy: 0.0, cap: '75B' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', price: 48.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 65, recommendation: 'Hold', pe: 15.0, dy: 3.3, cap: '190B' },
  { symbol: 'EQIX', name: 'Equinix, Inc.', price: 800.00, changePercent: 0.0, sector: 'Financial', buyHoldIndex: 70, recommendation: 'Hold', pe: 35.0, dy: 2.1, cap: '75B' },
  { symbol: 'FTNT', name: 'Fortinet, Inc.', price: 65.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 40.0, dy: 0.0, cap: '50B' },
  { symbol: 'GILD', name: 'Gilead Sciences, Inc.', price: 72.00, changePercent: 0.0, sector: 'Healthcare', buyHoldIndex: 65, recommendation: 'Hold', pe: 16.0, dy: 4.3, cap: '90B' },
  { symbol: 'HON', name: 'Honeywell International Inc.', price: 200.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 22.0, dy: 2.2, cap: '130B' },
  { symbol: 'HOOD', name: 'Robinhood Markets, Inc.', price: 18.00, changePercent: 0.0, sector: 'Financial', buyHoldIndex: 60, recommendation: 'Hold', pe: 30.0, dy: 0.0, cap: '15B' },
  { symbol: 'IBM', name: 'International Business Machines Corporation', price: 185.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 21.0, dy: 3.6, cap: '170B' },
  { symbol: 'INTC', name: 'Intel Corporation', price: 35.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 50, recommendation: 'Hold', pe: 30.0, dy: 1.4, cap: '150B' },
  { symbol: 'ISRG', name: 'Intuitive Surgical, Inc.', price: 390.00, changePercent: 0.0, sector: 'Healthcare', buyHoldIndex: 80, recommendation: 'Buy', pe: 60.0, dy: 0.0, cap: '140B' },
  { symbol: 'KLAC', name: 'KLA Corporation', price: 700.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 30.0, dy: 0.8, cap: '95B' },
  { symbol: 'LIN', name: 'Linde plc', price: 440.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 28.0, dy: 1.3, cap: '210B' },
  { symbol: 'LRCX', name: 'Lam Research Corporation', price: 950.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 32.0, dy: 0.8, cap: '120B' },
  { symbol: 'MAR', name: 'Marriott International, Inc.', price: 240.00, changePercent: 0.0, sector: 'Consumer Cyclical', buyHoldIndex: 70, recommendation: 'Hold', pe: 24.0, dy: 0.8, cap: '70B' },
  { symbol: 'MNST', name: 'Monster Beverage Corporation', price: 55.00, changePercent: 0.0, sector: 'Consumer Defensive', buyHoldIndex: 75, recommendation: 'Buy', pe: 32.0, dy: 0.0, cap: '58B' },
  { symbol: 'MRVL', name: 'Marvell Technology, Inc.', price: 70.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 45.0, dy: 0.3, cap: '60B' },
  { symbol: 'MU', name: 'Micron Technology, Inc.', price: 110.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 35.0, dy: 0.4, cap: '120B' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', price: 600.00, changePercent: 0.0, sector: 'Communication Services', buyHoldIndex: 80, recommendation: 'Buy', pe: 36.0, dy: 0.0, cap: '260B' },
  { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', price: 290.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 80, recommendation: 'Buy', pe: 65.0, dy: 0.0, cap: '95B' },
  { symbol: 'PDD', name: 'PDD Holdings Inc.', price: 120.00, changePercent: 0.0, sector: 'Consumer Cyclical', buyHoldIndex: 80, recommendation: 'Buy', pe: 15.0, dy: 0.0, cap: '160B' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', price: 22.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 85, recommendation: 'Strong Buy', pe: 75.0, dy: 0.0, cap: '48B' },
  { symbol: 'QCOM', name: 'Qualcomm Incorporated', price: 170.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 80, recommendation: 'Buy', pe: 22.0, dy: 2.0, cap: '190B' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', price: 90.00, changePercent: 0.0, sector: 'Consumer Cyclical', buyHoldIndex: 65, recommendation: 'Hold', pe: 24.0, dy: 2.5, cap: '100B' },
  { symbol: 'SHOP', name: 'Shopify Inc.', price: 75.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 70.0, dy: 0.0, cap: '96B' },
  { symbol: 'STX', name: 'Seagate Technology Holdings plc', price: 95.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 20.0, dy: 3.0, cap: '20B' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited', price: 140.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 90, recommendation: 'Strong Buy', pe: 25.0, dy: 1.4, cap: '720B' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', price: 175.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 70, recommendation: 'Hold', pe: 26.0, dy: 3.0, cap: '160B' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Incorporated', price: 420.00, changePercent: 0.0, sector: 'Healthcare', buyHoldIndex: 80, recommendation: 'Buy', pe: 28.0, dy: 0.0, cap: '108B' },
  { symbol: 'WDC', name: 'Western Digital Corporation', price: 70.00, changePercent: 0.0, sector: 'Technology', buyHoldIndex: 75, recommendation: 'Buy', pe: 20.0, dy: 0.0, cap: '22B' }
];

const INDICATOR_SEEDS = [
  {
    key: 'fear_greed',
    name: 'Fear & Greed Index',
    currentValue: 62.0,
    unit: '',
    status: 'Greed',
    description: 'Mide la emoción predominante en el mercado accionario estadounidense: Miedo Extremo, Miedo, Neutral, Codicia, o Codicia Extrema.'
  },
  {
    key: 'schiller_pe',
    name: 'Shiller PE Ratio (CAPE)',
    currentValue: 34.25,
    unit: 'x',
    status: 'High',
    description: 'Relación Precio-Ganancia ajustada cíclicamente, basada en ganancias promedio de los últimos 10 años ajustadas por inflación.'
  },
  {
    key: 'pe_ratio',
    name: 'S&P 500 PE Ratio',
    currentValue: 24.82,
    unit: 'x',
    status: 'High',
    description: 'Múltiplo de ganancias tradicional del índice S&P 500 sin promedio de 10 años ni inflación.'
  },
  {
    key: 'vix',
    name: 'VIX (Índice de Volatilidad)',
    currentValue: 13.40,
    unit: '%',
    status: 'Low',
    description: 'Conocido como el "índice del miedo", mide la volatilidad esperada a 30 días implícita en las opciones de S&P 500.'
  },
  {
    key: 'fed_rate',
    name: 'FED Interest Rate (Tasa de Interés)',
    currentValue: 5.25,
    unit: '%',
    status: 'High',
    description: 'Tasa objetivo de fondos federales establecida por la Reserva Federal.'
  },
  {
    key: 'inflation',
    name: 'Inflation (CPI YoY)',
    currentValue: 3.10,
    unit: '%',
    status: 'Normal',
    description: 'Índice de Precios al Consumidor (IPC) interanual en EE. UU.'
  },
  {
    key: 'core_inflation',
    name: 'Core Inflation (Ex-Food & Energy)',
    currentValue: 3.75,
    unit: '%',
    status: 'High',
    description: 'IPC subyacente que excluye los volátiles precios de alimentos y energía.'
  },
  {
    key: 'treasury_30y',
    name: '30-Year Treasury Yield',
    currentValue: 4.38,
    unit: '%',
    status: 'Normal',
    description: 'Rendimiento que paga el bono del Tesoro de EE. UU. a 30 años.'
  }
];

function generateHistoricalPrices(tickerId: string, symbol: string, initialPrice: number) {
  const pricesData = [];
  const rand = seedRandom(symbol);
  
  const today = new Date();
  const startDate = new Date();
  startDate.setFullYear(today.getFullYear() - 2);
  
  const tradingDays = [];
  const curr = new Date(startDate);
  
  while (curr <= today) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // Skip weekends
      tradingDays.push(new Date(curr));
    }
    curr.setDate(curr.getDate() + 1);
  }
  
  let currentPrice = initialPrice;
  let volatility = 0.015;
  if (symbol === 'TQQQ') volatility = 0.045;
  else if (['QQQ', 'NVDA', 'TSLA'].includes(symbol)) volatility = 0.025;
  else if (['VOO', 'SPY', 'SCHD'].includes(symbol)) volatility = 0.010;
  
  const drift = 0.0003; 
  const prices: number[] = [];
  prices.push(currentPrice);
  
  for (let i = 0; i < tradingDays.length - 1; i++) {
    const change = 1 + drift + (rand() - 0.49) * volatility * 2;
    currentPrice = currentPrice / change;
    prices.push(currentPrice);
  }
  prices.reverse();
  
  for (let i = 0; i < tradingDays.length; i++) {
    const price = prices[i];
    const dailyVol = price * volatility;
    
    const open = price + (rand() - 0.5) * dailyVol * 0.5;
    const high = Math.max(price, open) + rand() * dailyVol * 0.5;
    const low = Math.min(price, open) - rand() * dailyVol * 0.5;
    const close = price;
    const volume = Math.round(1000000 + rand() * 9000000);
    
    pricesData.push({
      tickerId,
      date: tradingDays[i],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      adjClose: parseFloat(close.toFixed(2)),
      volume: BigInt(volume)
    });
  }
  
  return pricesData;
}

function generateIndicatorHistory(indicatorId: string, key: string, seedValue: number) {
  const historyData = [];
  const rand = seedRandom(key);
  let currentValue = seedValue;
  const today = new Date();
  
  for (let i = 150; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const change = (rand() - 0.5) * (key === 'vix' ? 0.8 : key === 'fear_greed' ? 3.0 : 0.05);
    currentValue = currentValue + change;
    
    if (key === 'fear_greed') {
      currentValue = Math.max(0, Math.min(100, currentValue));
    } else {
      currentValue = Math.max(0.1, currentValue);
    }
    
    historyData.push({
      indicatorId,
      date: new Date(date),
      value: parseFloat(currentValue.toFixed(2))
    });
  }
  
  return historyData;
}

async function main() {
  console.log('Clearing existing database tables...');
  await prisma.subscription.deleteMany({});
  await prisma.indicatorHistory.deleteMany({});
  await prisma.indicator.deleteMany({});
  await prisma.historicalPrice.deleteMany({});
  await prisma.ticker.deleteMany({});
  
  console.log('Seeding tickers...');
  for (const t of TICKER_SEEDS) {
    const createdTicker = await prisma.ticker.create({
      data: {
        symbol: t.symbol,
        name: t.name,
        price: t.price,
        changePercent: t.changePercent,
        sector: t.sector,
        buyHoldIndex: t.buyHoldIndex,
        recommendation: t.recommendation,
        pe: t.pe,
        dy: t.dy,
        cap: t.cap
      }
    });
    
    console.log(`Generating 2 years of daily price data for ${t.symbol}...`);
    const prices = generateHistoricalPrices(createdTicker.id, t.symbol, t.price);
    
    await prisma.historicalPrice.createMany({
      data: prices
    });
  }

  console.log('Seeding indicators...');
  for (const ind of INDICATOR_SEEDS) {
    const createdIndicator = await prisma.indicator.create({
      data: {
        key: ind.key,
        name: ind.name,
        currentValue: ind.currentValue,
        unit: ind.unit,
        status: ind.status,
        description: ind.description
      }
    });

    console.log(`Generating history data for indicator ${ind.key}...`);
    const history = generateIndicatorHistory(createdIndicator.id, ind.key, ind.currentValue);
    
    await prisma.indicatorHistory.createMany({
      data: history
    });
  }

  console.log('Seeding demo subscriptions...');
  await prisma.subscription.create({
    data: {
      name: 'Francisco Zaragoza',
      email: 'zilph.zaragoza@gmail.com'
    }
  });

  console.log('Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seed execution:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
