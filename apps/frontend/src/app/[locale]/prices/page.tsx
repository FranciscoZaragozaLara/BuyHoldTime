import React from 'react';
import { useTranslations } from 'next-intl';
import { Layout } from '@/components/Layout';
import { PricesListClient } from '@/components/PricesListClient';
import { getTickers, Ticker } from '@/services/api';
import { Sparkles } from 'lucide-react';

// ISR: revalidate prices list every 60 seconds
export const revalidate = 60;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

export const metadata = {
  title: 'Stock Prices & Valuation Catalog — Buy/Hold Index Scores',
  description:
    'Browse 50+ stocks and ETFs with live prices, trailing P/E, forward P/E, EPS, dividend yield, and our algorithmic Buy/Hold Index score. Find which stocks are worth buying right now.',
  keywords: [
    'stock prices', 'P/E ratio list', 'buy hold index', 'best stocks to buy', 'EPS history',
    'AAPL stock price', 'NVDA valuation', 'dividend yield stocks', 'stock market catalog',
  ],
  openGraph: {
    title: 'Stock Prices & Valuation Catalog | BuyHoldTime',
    description: 'Browse 50+ stocks and ETFs with live prices, P/E ratios, EPS, and Buy/Hold Index scores.',
    url: `${BASE_URL}/en/prices`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Stock Prices & Valuation Catalog | BuyHoldTime',
    description: 'Browse 50+ stocks with P/E ratios, EPS, and Buy/Hold Index scores.',
  },
  alternates: {
    canonical: `${BASE_URL}/en/prices`,
    languages: {
      'en': `${BASE_URL}/en/prices`,
      'es': `${BASE_URL}/es/prices`,
    },
  },
};

export default async function PricesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let tickers: Ticker[] = [];
  let errorState = false;

  try {
    tickers = await getTickers();
  } catch (err) {
    console.error('Failed to fetch tickers in Server Component, using mock values:', err);
    errorState = true;
    
    // Mock values matching standard tickers if NestJS server is offline or building
    tickers = [
      { id: '1', symbol: 'AAPL', name: 'Apple Inc.', price: 178.52, changePercent: 1.25, sector: 'Technology', buyHoldIndex: 88, recommendation: 'Strong Buy', pe: 28.4, dy: 0.52, cap: '2.8T', createdAt: '', updatedAt: '' },
      { id: '2', symbol: 'MSFT', name: 'Microsoft Corporation', price: 421.90, changePercent: -0.45, sector: 'Technology', buyHoldIndex: 82, recommendation: 'Buy', pe: 35.1, dy: 0.71, cap: '3.1T', createdAt: '', updatedAt: '' },
      { id: '3', symbol: 'NVDA', name: 'NVIDIA Corporation', price: 914.35, changePercent: 3.82, sector: 'Technology', buyHoldIndex: 94, recommendation: 'Strong Buy', pe: 72.3, dy: 0.02, cap: '2.2T', createdAt: '', updatedAt: '' },
      { id: '4', symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.12, changePercent: 0.90, sector: 'Consumer Cyclical', buyHoldIndex: 78, recommendation: 'Buy', pe: 41.2, dy: 0.00, cap: '1.8T', createdAt: '', updatedAt: '' },
      { id: '5', symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.50, changePercent: 1.15, sector: 'Communication Services', buyHoldIndex: 85, recommendation: 'Buy', pe: 25.8, dy: 0.46, cap: '2.1T', createdAt: '', updatedAt: '' },
      { id: '6', symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', price: 512.40, changePercent: 0.52, sector: 'Index', buyHoldIndex: 75, recommendation: 'Buy', pe: 24.2, dy: 1.32, cap: '500B', createdAt: '', updatedAt: '' },
      { id: '7', symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 438.90, changePercent: 0.85, sector: 'Index', buyHoldIndex: 70, recommendation: 'Hold', pe: 34.5, dy: 0.55, cap: '220B', createdAt: '', updatedAt: '' },
      { id: '8', symbol: 'TSLA', name: 'Tesla, Inc.', price: 175.40, changePercent: -1.80, sector: 'Consumer Cyclical', buyHoldIndex: 45, recommendation: 'Hold', pe: 58.4, dy: 0.00, cap: '550B', createdAt: '', updatedAt: '' },
    ];
  }

  return (
    <Layout>
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-10">
        
        {/* Header Title Section */}
        <div className="flex flex-col gap-4 text-center sm:text-left max-w-3xl">
          <div className="inline-flex items-center gap-1.5 self-center sm:self-start px-3 py-1 rounded-full border border-teal-500/25 bg-teal-500/5 text-teal-400 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles size={12} className="animate-pulse" />
            {locale === 'es' ? 'Catalogo de Inversiones' : 'Investment Catalog'}
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {locale === 'es' ? 'Precios Históricos y Valuaciones' : 'Historical Prices & Valuation Catalog'}
          </h1>
          
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {locale === 'es' 
              ? 'Explora las principales acciones y fondos indexados del mercado. Revisa su índice de compra/venta calculado algoritmicamente junto con sus dividendos y valuaciones en tiempo real.'
              : 'Explore the market\'s leading tickers and index funds. Check their algorithmically calculated buy/hold index along with dividends and real-time valuation metrics.'}
          </p>
        </div>

        {/* Live status alert if database fallback is active */}
        {errorState && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs text-center">
            {locale === 'es'
              ? '⚠️ Modo offline activo. Mostrando datos de simulación local.'
              : '⚠️ Offline mode active. Displaying local simulated stock details.'}
          </div>
        )}

        {/* Interactive catalog lists */}
        <PricesListClient initialTickers={tickers} />
        
      </div>
    </Layout>
  );
}
