import React from 'react';
import { Layout } from '@/components/Layout';
import { MarketValueIndicatorClient } from '@/components/MarketValueIndicatorClient';
import { getIndicatorDetails, IndicatorDetails } from '@/services/api';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Market Value Indicators & CAPE Ratio',
  description: 'Evaluate macroeconomic valuations including Shiller PE (CAPE) and S&P 500 Price to analyze long-term stock market valuation signals.',
};

export default async function IndicatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let shillerPeData: IndicatorDetails;
  let peRatioData: IndicatorDetails;
  let sp500PriceData: IndicatorDetails;
  let errorState = false;

  try {
    // Fetch data with high limit for comprehensive historical charts (e.g. 1500 months ~ 125 years)
    [shillerPeData, peRatioData, sp500PriceData] = await Promise.all([
      getIndicatorDetails('schiller_pe', 1500),
      getIndicatorDetails('pe_ratio', 1500),
      getIndicatorDetails('sp500_price', 1500),
    ]);
  } catch (err) {
    console.error('Failed to fetch indicators in Server Component, utilizing mock fallback:', err);
    errorState = true;

    // Premium fallback mock data if backend NestJS is not running
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
          value: parseFloat(Math.max(1, current).toFixed(4)),
        });
      }
      return history;
    };

    shillerPeData = {
      indicator: { id: 'mock-shiller', key: 'schiller_pe', name: 'Shiller PE Ratio (CAPE)', currentValue: 41.02, unit: 'x', status: 'High', description: '', createdAt: '', updatedAt: '' },
      history: generateMockHistory(30, 0.05, 1.2, 200),
    };

    peRatioData = {
      indicator: { id: 'mock-pe', key: 'pe_ratio', name: 'S&P 500 PE Ratio', currentValue: 32.59, unit: 'x', status: 'High', description: '', createdAt: '', updatedAt: '' },
      history: generateMockHistory(24, 0.04, 0.9, 200),
    };

    sp500PriceData = {
      indicator: { id: 'mock-sp500', key: 'sp500_price', name: 'S&P 500 Price', currentValue: 7609.78, unit: '', status: 'Normal', description: '', createdAt: '', updatedAt: '' },
      history: generateMockHistory(3500, 15, 80, 200),
    };
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
        />

      </div>
    </Layout>
  );
}
