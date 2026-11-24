import React from 'react';
import { Layout } from '@/components/Layout';
import { MarketValueIndicatorClient } from '@/components/MarketValueIndicatorClient';
import { getIndicatorDetails, IndicatorDetails } from '@/services/api';
import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

// ISR: macro indicators change slowly — revalidate every hour
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const url = `${BASE_URL}/${locale}/indicators`;
  return {
    title: t('indicatorsTitle'),
    description: t('indicatorsDescription'),
    keywords: [
      'Shiller PE ratio', 'CAPE ratio', 'S&P 500 PE ratio', 'market valuation',
      '10 year treasury yield', 'excess CAPE yield', 'margin debt', 'market timing indicators', 'CPI inflation',
    ],
    openGraph: { title: `${t('indicatorsOgTitle')} | BuyHoldTime`, description: t('indicatorsDescription'), url, type: 'website' },
    twitter: { card: 'summary', title: `${t('indicatorsOgTitle')} | BuyHoldTime`, description: t('indicatorsDescription') },
    alternates: {
      canonical: url,
      languages: { en: `${BASE_URL}/en/indicators`, es: `${BASE_URL}/es/indicators` },
    },
  };
}

export default async function IndicatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Sin datos de respaldo inventados: si una serie no carga, la página muestra "—" y un aviso (antes dibujaba una
  // serie aleatoria como si fuera real).
  const empty = (key: string, name: string, unit = ''): IndicatorDetails => ({
    indicator: { id: key, key, name, currentValue: Number.NaN, unit, status: 'Normal', description: '', createdAt: '', updatedAt: '' },
    history: [],
  });
  const results = await Promise.allSettled([
    getIndicatorDetails('schiller_pe', 1500),
    getIndicatorDetails('pe_ratio', 1500),
    getIndicatorDetails('sp500_price', 1500),
    getIndicatorDetails('fwd_pe_ratio', 1),
  ]);
  const shillerPeData = results[0].status === 'fulfilled' ? results[0].value : empty('schiller_pe', 'Shiller PE Ratio (CAPE)', 'x');
  const peRatioData = results[1].status === 'fulfilled' ? results[1].value : empty('pe_ratio', 'S&P 500 PE Ratio', 'x');
  const sp500PriceData = results[2].status === 'fulfilled' ? results[2].value : empty('sp500_price', 'S&P 500 Price');
  const fwdPe = results[3].status === 'fulfilled' ? results[3].value.indicator.currentValue : null;
  const missing = results.slice(0, 3).some((r) => r.status === 'rejected');
  if (missing) console.error('Indicators page: some series failed', results.map((r) => r.status));

  return (
    <Layout>
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-10">
        
        {/* Title Section */}
        <div className="flex flex-col gap-4 text-center sm:text-left max-w-3xl">
          <div className="inline-flex items-center gap-1.5 self-center sm:self-start px-3 py-1 rounded-full border border-accent-500/25 bg-accent-500/5 text-accent-400 text-[10px] font-bold uppercase tracking-wider">
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
        {missing && (
          <div className="p-4 rounded-xl border border-caution-500/20 bg-caution-500/5 text-caution-400 text-xs text-center">
            {locale === 'es'
              ? '⚠️ Algunos datos no están disponibles en este momento; se muestran como «—». Intenta de nuevo en unos minutos.'
              : '⚠️ Some data is unavailable right now and is shown as “—”. Please try again in a few minutes.'}
          </div>
        )}

        {/* Client Interactive Area */}
        <MarketValueIndicatorClient
          shillerPeData={shillerPeData}
          peRatioData={peRatioData}
          sp500PriceData={sp500PriceData}
          fwdPe={fwdPe}
        />

      </div>
    </Layout>
  );
}
