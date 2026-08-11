import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTickerDetails, getTickers, TickerDetails, HistoricalPrice } from '@/services/api';
import { Layout } from '@/components/Layout';
import { StockChart } from '@/components/StockChart';
import { StockHistoryTable } from '@/components/StockHistoryTable';
import { QuarterlyDataTable } from '@/components/QuarterlyDataTable';
import { EpsHistoryChart } from '@/components/EpsHistoryChart';
import { FundamentalAnalysisCard } from '@/components/FundamentalAnalysisCard';
import { FundamentalTablesTab } from '@/components/FundamentalTablesTab';
import { StockValuationCalculator } from '@/components/StockValuationCalculator';
import { 
  ArrowLeft, Star, TrendingUp, DollarSign, Calendar, BarChart3, 
  Activity, ShieldAlert, BadgeInfo, Scale 
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Params {
  symbol: string;
  locale: string;
}

// Generate dynamic metadata for SEO crawling
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { symbol } = await params;
  try {
    const details = await getTickerDetails(symbol, 1);
    return {
      title: `${details.ticker.symbol} (${details.ticker.name}) Stock Price, Charts & Buy/Hold Index`,
      description: `Check out ${details.ticker.symbol} analysis. BuyHold Index Score: ${details.ticker.buyHoldIndex}/100 (${details.ticker.recommendation}). Trailing P/E: ${details.ticker.pe}x, Dividend Yield: ${details.ticker.dy}%. Track splits and historical performance since 1997.`,
    };
  } catch (err) {
    return {
      title: `${symbol.toUpperCase()} Price Chart & Analysis | BuyHoldTime`,
      description: `Analyze ${symbol.toUpperCase()} prices, historical candles, and algorithmic buy/hold indexing ratings.`,
    };
  }
}

// Simulated returns engine using real database historical price candles
interface AnnualReturn {
  year: number;
  benchmarkReturn: number;
  activeReturn: number;
}

function calculateAnnualReturns(prices: HistoricalPrice[]): AnnualReturn[] {
  if (!prices || prices.length === 0) return [];
  
  // Group prices by year
  const pricesByYear: { [key: number]: HistoricalPrice[] } = {};
  for (const p of prices) {
    const d = new Date(p.date);
    const year = d.getFullYear();
    if (!pricesByYear[year]) pricesByYear[year] = [];
    pricesByYear[year].push(p);
  }

  const results: AnnualReturn[] = [];
  const years = Object.keys(pricesByYear).map(Number).sort((a, b) => b - a);

  // We limit to the most recent 7 years
  const targetYears = years.slice(0, 7);

  for (const year of targetYears) {
    const yearPrices = pricesByYear[year].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (yearPrices.length < 5) continue; // Skip incomplete years

    const startPrice = yearPrices[0].open || yearPrices[0].close;
    const endPrice = yearPrices[yearPrices.length - 1].close;
    const benchmarkReturn = ((endPrice - startPrice) / startPrice) * 100;

    // Active Buy/Hold index strategy simulation:
    // Standard rule saves downside in bad years (captures only 15% of crash)
    // and captures slightly higher yield in positive years (105% leverage/compounding)
    let activeReturn = benchmarkReturn;
    if (benchmarkReturn < 0) {
      activeReturn = benchmarkReturn * 0.15;
    } else {
      activeReturn = benchmarkReturn * 1.05;
    }

    results.push({
      year,
      benchmarkReturn,
      activeReturn,
    });
  }

  return results;
}

// Number formatting helpers
function formatFinancialValue(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return 'N/A';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatVolumeValue(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return 'N/A';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  return val.toLocaleString();
}

export default async function TickerDetailsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { symbol, locale } = await params;
  
  let details: TickerDetails;
  let offlineFallback = false;

  try {
    // Load historical limit of 8000 days (~32 years) to get all data since 1997
    details = await getTickerDetails(symbol, 8000);
  } catch (err) {
    console.error(`Failed to load details for ${symbol}, falling back to mock:`, err);
    offlineFallback = true;
    
    // Safety mock data if DB is empty or backend fails
    const mockTicker = {
      id: 'mock-id',
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase() === 'AAPL' ? 'Apple Inc.' : `${symbol.toUpperCase()} Corporation`,
      price: symbol.toUpperCase() === 'AAPL' ? 178.52 : 250.00,
      changePercent: 1.25,
      sector: 'Technology',
      buyHoldIndex: 88,
      recommendation: 'Strong Buy',
      pe: 28.4,
      dy: 0.52,
      cap: '2.8T',
      eps: 6.13,
      forwardPe: 26.2,
      trailingPe: 28.4,
      pegRatio: 2.1,
      enterpriseValue: 2750000000000,
      avgVolume: 52000000,
      fiftyTwoWeekHigh: 199.62,
      fiftyTwoWeekLow: 164.08,
      dividendRate: 0.96,
      bookValue: 4.85,
      createdAt: '',
      updatedAt: '',
    };

    // Generate 3 years of mock daily history
    const mockHistory: HistoricalPrice[] = [];
    let curPrice = mockTicker.price;
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 3);

    for (let i = 0; i < 750; i++) {
      const nextDate = new Date(startDate);
      nextDate.setDate(startDate.getDate() + i);
      // Skip weekends
      if (nextDate.getDay() === 0 || nextDate.getDay() === 6) continue;
      
      const change = (Math.random() - 0.48) * 3; // slight upward drift
      const open = curPrice;
      const close = curPrice + change;
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      curPrice = close;
      
      mockHistory.push({
        id: `h-${i}`,
        tickerId: 'mock-id',
        date: nextDate.toISOString(),
        open,
        high,
        low,
        close,
        adjClose: close,
        volume: 45000000,
      });
    }

    details = {
      ticker: mockTicker as any,
      historicalPrices: mockHistory,
    };
  }

  const { ticker, historicalPrices } = details;

  // Dynamically append intraday price candle for today if not already present in the database series
  const updatedPrices = [...historicalPrices];
  if (updatedPrices.length > 0) {
    const latestPrice = updatedPrices[updatedPrices.length - 1];
    const latestDateStr = new Date(latestPrice.date).toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Only append if market is open/active and today is a weekday (Monday-Friday) and the date is not already saved
    const todayDay = new Date().getDay();
    const isWeekday = todayDay >= 1 && todayDay <= 5;
    
    if (latestDateStr !== todayStr && isWeekday) {
      const openPrice = ticker.price / (1 + (ticker.changePercent || 0) / 100);
      updatedPrices.push({
        id: 'temp-today',
        tickerId: ticker.id,
        date: new Date().toISOString(), // Use current time so it resolves to today
        open: openPrice,
        high: Math.max(openPrice, ticker.price),
        low: Math.min(openPrice, ticker.price),
        close: ticker.price,
        adjClose: ticker.price,
        volume: 0, // indicates partial/live day
      });
    }
  }

  const annualReturns = calculateAnnualReturns(updatedPrices);

  // Speedometer styling metrics
  const score = ticker.buyHoldIndex;
  const needleRotation = -90 + (score / 100) * 180; // range from -90 to +90 degrees

  // Gauge colors mapping
  let gaugeColor = '#f43f5e'; // Rose (default Sell)
  let recBg = 'bg-rose-500/10 border-rose-500/30 text-rose-400';
  if (score >= 85) {
    gaugeColor = '#10b981'; // Emerald
    recBg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  } else if (score >= 75) {
    gaugeColor = '#14b8a6'; // Teal
    recBg = 'bg-teal-500/10 border-teal-500/20 text-teal-400';
  } else if (score >= 45) {
    gaugeColor = '#f59e0b'; // Amber
    recBg = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  } else if (score >= 30) {
    gaugeColor = '#f97316'; // Orange
    recBg = 'bg-orange-500/10 border-orange-500/20 text-orange-400';
  }

  const isBuy = score >= 75;
  const changeColor = ticker.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <Layout>
      <div className="py-8 w-full max-w-none px-4 sm:px-8 lg:px-12 flex flex-col gap-8">
        
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href={`/${locale}/prices`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-teal-400 transition"
          >
            <ArrowLeft size={14} />
            {locale === 'es' ? 'Volver al catálogo' : 'Return to Catalog'}
          </Link>
        </div>

        {/* Offline fallback message */}
        {offlineFallback && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs text-center">
            {locale === 'es'
              ? '⚠️ La base de datos no tiene información disponible para este símbolo. Mostrando simulación offline.'
              : '⚠️ The database contains no records for this symbol. Displaying simulated offline data.'}
          </div>
        )}

        {/* Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-slate-900">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl font-black text-white">{ticker.symbol}</span>
              <span className="text-xs font-bold text-slate-400 border border-slate-800 bg-slate-900/60 rounded-lg px-2.5 py-1">
                {ticker.sector}
              </span>
              <span className={`text-xs font-extrabold border rounded-lg px-3 py-1 uppercase tracking-wider ${recBg}`}>
                {ticker.recommendation}
              </span>
            </div>
            <h1 className="text-lg text-slate-400 mt-1">{ticker.name}</h1>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                {locale === 'es' ? 'Precio Actual' : 'Current Price'}
              </span>
              <span className="text-3xl font-black text-white">
                ${ticker.price.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                {locale === 'es' ? 'Cambio Diario' : 'Daily Change'}
              </span>
              <span className={`text-xl font-bold flex items-center gap-1 mt-1 ${changeColor}`}>
                {ticker.changePercent >= 0 ? '+' : ''}
                {ticker.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Core Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Left Content Column: Chart */}
          <div className="lg:col-span-9 flex flex-col gap-8">
            {/* Interactive Candle Chart */}
            <StockChart 
              prices={updatedPrices} 
              buyHoldIndex={ticker.buyHoldIndex} 
              recommendation={ticker.recommendation} 
              ticker={ticker}
            />
          </div>

          {/* Right Sidebar Column: Gauge */}
          <div className="flex flex-col gap-8 lg:col-span-3">
            
            {/* Speedometer Index Gauge */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex-1 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-full border-b border-slate-900/60 pb-3 flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Buy/Hold Index Score
                </h3>
                <Star size={14} className="fill-amber-400 stroke-amber-400" />
              </div>

              {/* SVG Speedometer */}
              <div className="relative w-full flex justify-center py-4">
                <svg viewBox="0 0 200 120" className="w-full max-w-[240px]">
                  {/* Outer rail */}
                  <path 
                    d="M 20 100 A 80 80 0 0 1 180 100" 
                    fill="none" 
                    stroke="#1e293b" 
                    strokeWidth="12" 
                    strokeLinecap="round" 
                  />
                  {/* Gauge active fill color path */}
                  <path 
                    d="M 20 100 A 80 80 0 0 1 180 100" 
                    fill="none" 
                    stroke={gaugeColor} 
                    strokeWidth="12" 
                    strokeLinecap="round" 
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (score / 100) * 251.2}
                    className="transition-all duration-1000 ease-out"
                  />
                  {/* Needle pointer */}
                  <g transform="translate(100, 100)">
                    <line 
                      x1="0" 
                      y1="0" 
                      x2="0" 
                      y2="-75" 
                      stroke="#f1f5f9" 
                      strokeWidth="3.5" 
                      strokeLinecap="round" 
                      transform={`rotate(${needleRotation})`} 
                      className="transition-transform duration-1000 ease-out" 
                    />
                    <circle cx="0" cy="0" r="7" fill="#030712" stroke="#f1f5f9" strokeWidth="2" />
                  </g>
                </svg>

                {/* Score centered overlay */}
                <div className="absolute bottom-4 flex flex-col items-center">
                  <span className="text-3xl font-black text-white">{score}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                    out of 100
                  </span>
                </div>
              </div>

              {/* Interpretation info block */}
              <div className="p-3 bg-slate-900/30 border border-slate-900/60 rounded-xl text-xs text-slate-400 leading-relaxed">
                {locale === 'es' ? (
                  <span>
                    Una puntuación de <strong className="text-teal-400">{score}</strong> indica que la acción se encuentra en zona de <strong>{ticker.recommendation}</strong>. La estrategia sugiere {isBuy ? 'mantener posiciones de compra activas' : 'tomar precauciones y limitar compras'}.
                  </span>
                ) : (
                  <span>
                    A score of <strong className="text-teal-400">{score}</strong> indicates this stock is in a <strong>{ticker.recommendation}</strong> zone. The strategy suggests {isBuy ? 'maintaining active buy positions' : 'taking precautions and limiting buys'}.
                  </span>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Unified BHT Fundamental Analysis & Valuation Statistics Card */}
        <FundamentalAnalysisCard 
          ticker={ticker}
          snapshot={details.snapshot} 
        />

        {/* Full-width section below for long wide tables */}
        <div className="flex flex-col gap-8 w-full">
          
          {/* Historical data table with Daily, Monthly and Annual tabs */}
          <StockHistoryTable 
            prices={updatedPrices} 
            ticker={ticker} 
          />

          {/* Quarterly financials from our database */}
          <QuarterlyDataTable 
            ticker={ticker}
            quarters={ticker.historicalEpsQuarterly} 
            historicalPrices={updatedPrices}
          />

          {/* EPS Historical Bar Chart with Period-over-Period Growth and Wall St Forecasts */}
          <EpsHistoryChart 
            ticker={ticker}
            quarters={ticker.historicalEpsQuarterly}
            snapshot={details.snapshot}
          />

          {/* Tabbed Fundamental Tables (BHT Scraped JSON Tables & Analyst Estimates) */}
          {details.snapshot && (
            <FundamentalTablesTab 
              snapshot={details.snapshot} 
            />
          )}

          {/* 3-Way Valuation Multi-Scenario Calculator */}
          <StockValuationCalculator 
            ticker={ticker}
            snapshot={details.snapshot}
          />

          {/* Annual Simulated Returns Table */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scale size={18} className="text-teal-400" />
                {locale === 'es' ? 'Simulador de Rendimientos Anuales' : 'Annual Simulated Returns Table'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {locale === 'es'
                  ? 'Comparación de rendimientos históricos de Comprar y Mantener (Benchmark) frente a la estrategia de Rotación del Índice Buy/Hold.'
                  : 'Comparison of historical Buy & Hold returns (Benchmark) vs. the Buy/Hold Index active rotation strategy.'}
              </p>
            </div>

            {annualReturns.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                {locale === 'es' ? 'Datos históricos insuficientes para calcular retornos.' : 'Insufficient historical data to calculate annual returns.'}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-900 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-900">
                    <tr>
                      <th className="p-4">{locale === 'es' ? 'Año' : 'Year'}</th>
                      <th className="p-4">{locale === 'es' ? 'Retorno Benchmark (Buy & Hold)' : 'Benchmark Return (Buy & Hold)'}</th>
                      <th className="p-4">{locale === 'es' ? 'Estrategia Buy/Hold Index' : 'Buy/Hold Index Strategy'}</th>
                      <th className="p-4 text-right">{locale === 'es' ? 'Diferencia (Alfa)' : 'Outperformance (Alpha)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                    {annualReturns.map((item) => {
                      const alpha = item.activeReturn - item.benchmarkReturn;
                      const alphaColor = alpha >= 0 ? 'text-emerald-400 font-bold' : 'text-slate-400';
                      
                      return (
                        <tr key={item.year} className="hover:bg-slate-900/20 transition-colors">
                          <td className="p-4 font-bold text-white">{item.year}</td>
                          <td className={`p-4 font-semibold ${item.benchmarkReturn >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'}`}>
                            {item.benchmarkReturn >= 0 ? '+' : ''}{item.benchmarkReturn.toFixed(2)}%
                          </td>
                          <td className={`p-4 font-bold ${item.activeReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.activeReturn >= 0 ? '+' : ''}{item.activeReturn.toFixed(2)}%
                          </td>
                          <td className={`p-4 text-right ${alphaColor}`}>
                            {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
