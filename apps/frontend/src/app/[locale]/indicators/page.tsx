import React from 'react';
import { Layout } from '@/components/Layout';
import { MarketValueIndicatorClient } from '@/components/MarketValueIndicatorClient';
import { MarginDebtPanel } from '@/components/MarginDebtPanel';
import { getIndicatorDetails, IndicatorDetails, getMarginDebtHistory, getMarginDebtRiskSummary, MarginDebtRecord, MarginDebtRiskSummary } from '@/services/api';
import { Sparkles } from 'lucide-react';

// ISR: macro indicators change slowly — revalidate every hour
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

export const metadata = {
  title: 'Market Indicators: Shiller PE (CAPE), S&P 500 PE Ratio & Treasury Yields',
  description:
    'Track macroeconomic market valuation indicators: Shiller PE Ratio (CAPE), S&P 500 P/E ratio, 10-Year Treasury Yield (GS10), Excess CAPE Yield, CPI, and FINRA Margin Debt. Identify market bubbles and buying opportunities.',
  keywords: [
    'Shiller PE ratio', 'CAPE ratio', 'S&P 500 PE ratio', 'market valuation', 'is market overvalued',
    '10 year treasury yield', 'excess CAPE yield', 'FINRA margin debt', 'stock market bubble',
    'market timing indicators', 'CPI inflation', 'macro indicators',
  ],
  openGraph: {
    title: 'Market Indicators: Shiller PE (CAPE) & S&P 500 Valuation | BuyHoldTime',
    description: 'Is the stock market overvalued? Track CAPE, PE ratio, Treasury yields, and margin debt in one dashboard.',
    url: `${BASE_URL}/en/indicators`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Shiller PE (CAPE) & S&P 500 Valuation Indicators | BuyHoldTime',
    description: 'Track CAPE, PE ratio, Treasury yields, and margin debt to spot market tops and buying windows.',
  },
  alternates: {
    canonical: `${BASE_URL}/en/indicators`,
    languages: {
      'en': `${BASE_URL}/en/indicators`,
      'es': `${BASE_URL}/es/indicators`,
    },
  },
};

export default async function IndicatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const generateMockHistory = (startVal: number, drift: number, volatility: number, len = 120) => {
    const history = [];
    let current = startVal;
    const today = new Date();
    for (let i = len; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      current = current + drift + (Math.random() - 0.5) * volatility;
      history.push({
        id: `mock-${i}`,
        indicatorId: 'mock-id',
        date: dateStr,
        value: parseFloat(Math.max(0.1, current).toFixed(4)),
      });
    }
    return history;
  };

  let shillerPeData: IndicatorDetails = {
    indicator: { id: 'mock-shiller', key: 'schiller_pe', name: 'Shiller PE Ratio (CAPE)', currentValue: 41.02, unit: 'x', status: 'High', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(30, 0.05, 1.2, 200),
  };
  let peRatioData: IndicatorDetails = {
    indicator: { id: 'mock-pe', key: 'pe_ratio', name: 'S&P 500 PE Ratio', currentValue: 32.59, unit: 'x', status: 'High', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(24, 0.04, 0.9, 200),
  };
  let sp500PriceData: IndicatorDetails = {
    indicator: { id: 'mock-sp500', key: 'sp500_price', name: 'S&P 500 Price', currentValue: 7609.78, unit: '', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(3500, 15, 80, 200),
  };
  let sp500DividendData: IndicatorDetails = {
    indicator: { id: 'mock-dividend', key: 'sp500_dividend', name: 'S&P 500 Dividend', currentValue: 80.37, unit: '', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(65, 0.1, 1.5, 200),
  };
  let sp500EarningsData: IndicatorDetails = {
    indicator: { id: 'mock-earnings', key: 'sp500_earnings', name: 'S&P 500 Earnings', currentValue: 293.58, unit: '', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(200, 0.5, 5.0, 200),
  };
  let cpiData: IndicatorDetails = {
    indicator: { id: 'mock-cpi', key: 'cpi', name: 'Consumer Price Index (CPI)', currentValue: 335.13, unit: '', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(250, 0.3, 2.0, 200),
  };
  let rateGs10Data: IndicatorDetails = {
    indicator: { id: 'mock-gs10', key: 'rate_gs10', name: '10-Year Treasury Yield (GS10)', currentValue: 4.47, unit: '%', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(3.5, 0.005, 0.15, 200),
  };
  let excessCapeYieldData: IndicatorDetails = {
    indicator: { id: 'mock-excess', key: 'excess_cape_yield', name: 'Excess CAPE Yield', currentValue: 1.32, unit: '%', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: generateMockHistory(2.0, -0.005, 0.1, 200),
  };
  let marginDebtSummary: MarginDebtRiskSummary | null = null;
  let marginDebtHistory: MarginDebtRecord[] = [];
  let errorState = false;

  try {
    const results = await Promise.allSettled([
      getIndicatorDetails('schiller_pe', 1500),
      getIndicatorDetails('pe_ratio', 1500),
      getIndicatorDetails('sp500_price', 1500),
      getIndicatorDetails('sp500_dividend', 1500),
      getIndicatorDetails('sp500_earnings', 1500),
      getIndicatorDetails('cpi', 1500),
      getIndicatorDetails('rate_gs10', 1500),
      getIndicatorDetails('excess_cape_yield', 1500),
      getMarginDebtRiskSummary(),
      getMarginDebtHistory(360),
    ]);

    if (results[0].status === 'fulfilled') shillerPeData = results[0].value;
    if (results[1].status === 'fulfilled') peRatioData = results[1].value;
    if (results[2].status === 'fulfilled') sp500PriceData = results[2].value;
    if (results[3].status === 'fulfilled') sp500DividendData = results[3].value;
    if (results[4].status === 'fulfilled') sp500EarningsData = results[4].value;
    if (results[5].status === 'fulfilled') cpiData = results[5].value;
    if (results[6].status === 'fulfilled') rateGs10Data = results[6].value;
    if (results[7].status === 'fulfilled') excessCapeYieldData = results[7].value;
    if (results[8].status === 'fulfilled') marginDebtSummary = results[8].value;
    if (results[9].status === 'fulfilled') marginDebtHistory = results[9].value;
  } catch (err) {
    console.error('Failed to fetch indicators in Server Component:', err);
    errorState = true;
  }

  return (
    <Layout>
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-10">
        
        {/* Title Section */}
        <div className="flex flex-col gap-4 text-center sm:text-left max-w-3xl">
          <div className="inline-flex items-center gap-1.5 self-center sm:self-start px-3 py-1 rounded-full border border-teal-500/25 bg-teal-500/5 text-teal-400 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles size={12} className="animate-pulse" />
            {locale === 'es' ? 'Indicador de Valoración Macro' : 'Macro Valuation Indicator'}
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {locale === 'es' ? 'Indicadores de Valuación de Mercado (CAPE)' : 'Market Value Indicators (CAPE)'}
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {locale === 'es'
              ? 'Analiza el nivel de valuación histórica del S&P 500. Compara el índice de precios con el P/E ratio tradicional y el Shiller PE (CAPE) ajustado cíclicamente por inflación para identificar sobrevaloraciones o gangas de mercado.'
              : 'Analyze the S&P 500 historical valuation level. Compare the price index with the traditional P/E ratio and the inflation-adjusted Shiller PE (CAPE) to spot market bubbles or buying opportunities.'}
          </p>
        </div>

        {/* Offline Warning banner */}
        {errorState && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs text-center">
            {locale === 'es'
              ? '⚠️ Cargando datos de simulación local. Conecta el servidor NestJS para ver datos reales.'
              : '⚠️ Loading local simulation values. Connect the NestJS server to retrieve real market data.'}
          </div>
        )}

        {/* Client Interactive Area */}
        <MarketValueIndicatorClient
          shillerPeData={shillerPeData}
          peRatioData={peRatioData}
          sp500PriceData={sp500PriceData}
          sp500DividendData={sp500DividendData}
          sp500EarningsData={sp500EarningsData}
          cpiData={cpiData}
          rateGs10Data={rateGs10Data}
          excessCapeYieldData={excessCapeYieldData}
        />

        {/* FINRA Margin Debt Risk Model Panel */}
        <MarginDebtPanel
          summary={marginDebtSummary}
          history={marginDebtHistory}
          locale={locale}
        />

      </div>
    </Layout>
  );
}
