import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Star, Sparkles } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { SubscribeForm } from '@/components/SubscribeForm';
import { IndexSparklineCard } from '@/components/IndexSparklineCard';
import { JsonLd } from '@/components/JsonLd';
import { getTickers, getIndicators, Ticker, Indicator } from '@/services/api';

// ISR: revalidate home page every 60 seconds
export const revalidate = 60;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

// Sparkline trends for the home page cards
const spySpark = [{ value: 480 }, { value: 485 }, { value: 490 }, { value: 488 }, { value: 495 }, { value: 505 }, { value: 512 }];
const nasdaqSpark = [{ value: 15500 }, { value: 15700 }, { value: 15600 }, { value: 15900 }, { value: 16100 }, { value: 16300 }, { value: 16420 }];
const fearSpark = [{ value: 45 }, { value: 50 }, { value: 52 }, { value: 58 }, { value: 65 }, { value: 60 }, { value: 62 }];
const schillerSpark = [{ value: 31.2 }, { value: 31.8 }, { value: 32.5 }, { value: 33.1 }, { value: 33.5 }, { value: 34.0 }, { value: 34.25 }];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let tickers: Ticker[] = [];
  let indicators: Indicator[] = [];
  let errorState = false;

  try {
    // Fetch live data from backend NestJS microservices
    [tickers, indicators] = await Promise.all([
      getTickers(),
      getIndicators(),
    ]);
  } catch (err) {
    console.error('API Fetch failed in Server Component, falling back to mock data:', err);
    errorState = true;
    
    // Resilient Fallback mock data if NestJS is not running during build
    tickers = [
      { id: '1', symbol: 'AAPL', name: 'Apple Inc.', price: 178.52, changePercent: 1.25, sector: 'Technology', buyHoldIndex: 88, recommendation: 'Strong Buy', pe: 28.4, dy: 0.52, cap: '2.8T', createdAt: '', updatedAt: '' },
      { id: '2', symbol: 'MSFT', name: 'Microsoft Corporation', price: 421.90, changePercent: -0.45, sector: 'Technology', buyHoldIndex: 82, recommendation: 'Buy', pe: 35.1, dy: 0.71, cap: '3.1T', createdAt: '', updatedAt: '' },
      { id: '3', symbol: 'NVDA', name: 'NVIDIA Corporation', price: 914.35, changePercent: 3.82, sector: 'Technology', buyHoldIndex: 94, recommendation: 'Strong Buy', pe: 72.3, dy: 0.02, cap: '2.2T', createdAt: '', updatedAt: '' },
      { id: '4', symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.12, changePercent: 0.90, sector: 'Consumer Cyclical', buyHoldIndex: 78, recommendation: 'Buy', pe: 41.2, dy: 0.00, cap: '1.8T', createdAt: '', updatedAt: '' },
      { id: '5', symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.50, changePercent: 1.15, sector: 'Communication Services', buyHoldIndex: 85, recommendation: 'Buy', pe: 25.8, dy: 0.46, cap: '2.1T', createdAt: '', updatedAt: '' },
    ];
    indicators = [
      { id: '1', key: 'fear_greed', name: 'Fear & Greed Index', currentValue: 62.0, unit: '', status: 'Greed', description: '', createdAt: '', updatedAt: '' },
      { id: '2', key: 'schiller_pe', name: 'Shiller PE Ratio (CAPE)', currentValue: 34.25, unit: 'x', status: 'High', description: '', createdAt: '', updatedAt: '' },
    ];
  }

  // Filter top recommended tickers sorted by index desc
  const recommendedTickers = [...tickers]
    .sort((a, b) => b.buyHoldIndex - a.buyHoldIndex)
    .slice(0, 5);

  const spyTicker = tickers.find((t) => t.symbol === 'SPY');
  const spyPrice = spyTicker ? `$${spyTicker.price.toFixed(2)}` : '5,124.00';
  const spyChange = spyTicker ? `${spyTicker.changePercent >= 0 ? '+' : ''}${spyTicker.changePercent}%` : '+0.52%';

  const qqqTicker = tickers.find((t) => t.symbol === 'QQQ');
  const qqqPrice = qqqTicker ? `$${qqqTicker.price.toFixed(2)}` : '16,420.50';
  const qqqChange = qqqTicker ? `${qqqTicker.changePercent >= 0 ? '+' : ''}${qqqTicker.changePercent}%` : '+0.85%';

  const fearIndex = indicators.find((i) => i.key === 'fear_greed');
  const fearVal = fearIndex ? `${fearIndex.currentValue.toFixed(0)} / 100` : '62 / 100';
  const fearStatus = fearIndex ? fearIndex.status : 'GREED';

  const capeIndex = indicators.find((i) => i.key === 'schiller_pe');
  const capeVal = capeIndex ? `${capeIndex.currentValue.toFixed(2)}x` : '34.25x';
  const capeStatus = capeIndex ? capeIndex.status : 'HIGH';

  return (
    <Layout>
      {/* WebApplication JSON-LD schema for Google Rich Results & LLM indexing */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'BuyHoldTime',
          url: BASE_URL,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Web',
          description:
            'BuyHoldTime is a stock market timing tool that combines macroeconomic indicators, Shiller PE (CAPE), P/E ratios, EPS history, and algorithmic scoring to help investors find the best time to buy or hold stocks.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          featureList: [
            'Stock Buy/Hold Index Score',
            'Historical EPS & P/E ratio charts',
            'Shiller PE (CAPE) and S&P 500 macro indicators',
            'FINRA Margin Debt risk model',
            'Multi-scenario stock valuation calculator',
          ],
          creator: { '@type': 'Organization', name: 'BuyHoldTime', url: BASE_URL },
        }}
      />
      <div className="flex flex-col gap-16 py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center gap-6 max-w-4xl mx-auto py-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-teal-500/20 bg-teal-500/5 text-teal-400 text-xs font-semibold">
            <Sparkles size={14} className="animate-pulse" />
            <span>The intelligent way to navigate the stock market</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-white">
            Invest Smartly.<br />
            Buy at the <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">Exact Time</span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            BuyHoldTime combines global macroeconomic metrics, historical stock models, and technical indicators to help you spot optimum long-term investing windows.
          </p>

          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <Link 
              href={`/${locale}/prices`} 
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 transition"
            >
              Explore Tickers
              <ArrowRight size={16} />
            </Link>
            <Link 
              href={`/${locale}/indicators`} 
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-200 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white transition"
            >
              Market Indicators
            </Link>
          </div>
        </section>

        {/* Market Gauges Dashboard */}
        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-bold tracking-tight text-white text-center sm:text-left">
            Main Market Indicators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <IndexSparklineCard
              title="S&P 500 ETF (SPY)"
              valueStr={spyPrice}
              badgeText={spyChange}
              badgeType="success"
              sparklineData={spySpark}
              color="#10b981"
              footerText="Real-time S&P 500 benchmark"
            />
            <IndexSparklineCard
              title="NASDAQ 100 ETF (QQQ)"
              valueStr={qqqPrice}
              badgeText={qqqChange}
              badgeType="success"
              sparklineData={nasdaqSpark}
              color="#3b82f6"
              footerText="Tech sector barometer"
            />
            <IndexSparklineCard
              title="Fear & Greed Index"
              valueStr={fearVal}
              badgeText={fearStatus}
              badgeType={fearStatus.toUpperCase() === 'FEAR' ? 'error' : 'warning'}
              sparklineData={fearSpark}
              color="#fbbf24"
              footerText="Market sentiment sentiment gauge"
            />
            <IndexSparklineCard
              title="Shiller PE Ratio (CAPE)"
              valueStr={capeVal}
              badgeText={capeStatus}
              badgeType="error"
              sparklineData={schillerSpark}
              color="#f87171"
              footerText="S&P 500 valuation ratio"
            />
          </div>
        </section>

        {/* Featured Stocks */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Featured Recommended Tickers
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Highest scoring stocks based on our custom algorithmic Buy/Hold Index.
              </p>
            </div>
            <Link 
              href={`/${locale}/prices`} 
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 transition"
            >
              View All 50 Tickers →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendedTickers.map((stock) => {
              const isBuy = stock.buyHoldIndex >= 75;
              const badgeClass = stock.buyHoldIndex >= 85 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

              return (
                <div 
                  key={stock.symbol} 
                  className="flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm shadow-xl relative overflow-hidden transition hover:border-slate-800 hover:bg-slate-900/10"
                >
                  {/* Color strip accent representing index score */}
                  <div className={`absolute top-0 left-0 w-1 h-full ${isBuy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-lg font-bold text-white">{stock.symbol}</span>
                      <span className="text-xs text-slate-500 ml-2">{stock.name}</span>
                    </div>
                    <span className={`text-[10px] font-bold border rounded-md px-2 py-0.5 uppercase tracking-wider ${badgeClass}`}>
                      {stock.recommendation}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Price</span>
                      <p className="text-lg font-extrabold text-white">${stock.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Daily Change</span>
                      <p className={`text-base font-bold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-900/30 border border-slate-900/50 p-3 rounded-xl text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Star size={14} className="fill-amber-400 stroke-amber-400" />
                      BuyHold Index Score
                    </span>
                    <span className={`font-extrabold text-sm ${isBuy ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {stock.buyHoldIndex} / 100
                    </span>
                  </div>

                  <div className="flex gap-4 text-[10px] text-slate-500">
                    <span>P/E Ratio: <strong>{stock.pe}x</strong></span>
                    <span>•</span>
                    <span>Div Yield: <strong>{stock.dy}%</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Newsletter Subscription */}
        <section className="flex justify-center py-6">
          <SubscribeForm />
        </section>

      </div>
    </Layout>
  );
}
