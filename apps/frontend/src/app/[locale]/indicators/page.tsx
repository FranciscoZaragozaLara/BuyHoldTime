import React from 'react';
import { Layout } from '@/components/Layout';
import { MarketValueIndicatorClient } from '@/components/MarketValueIndicatorClient';
import { getIndicatorDetails, IndicatorDetails } from '@/services/api';
import { getApiBase } from '@/lib/apiBase';
import { BhtTodaySummary } from '@/components/indicators/BhtTodaySummary';
import { BhtComponents } from '@/components/indicators/BhtComponents';
import type { ThermoLive } from '@/components/backtesting/useThermoLive';
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
    // Termómetro BHT de hoy (fuente única del BHT); el cliente lo refresca cada 5 min.
    fetch(`${getApiBase()}/api/backtesting/thermo-live`, { next: { revalidate: 300 } }).then((r) => (r.ok ? r.json() : null)),
  ]);
  const shillerPeData = results[0].status === 'fulfilled' ? results[0].value : empty('schiller_pe', 'Shiller PE Ratio (CAPE)', 'x');
  const peRatioData = results[1].status === 'fulfilled' ? results[1].value : empty('pe_ratio', 'S&P 500 PE Ratio', 'x');
  const sp500PriceData = results[2].status === 'fulfilled' ? results[2].value : empty('sp500_price', 'S&P 500 Price');
  const thermo = results[4].status === 'fulfilled' && Array.isArray((results[4].value as ThermoLive | null)?.parts) ? (results[4].value as ThermoLive) : null;
  const missing = results.slice(0, 3).some((r) => r.status === 'rejected');
  if (missing) console.error('Indicators page: some series failed', results.map((r) => r.status));

  return (
    <Layout>
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-10">
        
        {/* Title Section */}
        <div className="flex flex-col gap-4 text-center sm:text-left max-w-3xl">
          <div className="inline-flex items-center gap-1.5 self-center sm:self-start px-3 py-1 rounded-full border border-accent-500/25 bg-accent-500/5 text-accent-400 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles size={12} className="animate-pulse" />
            {locale === 'es' ? 'BHT Index y valuación del mercado' : 'BHT Index and market valuation'}
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {locale === 'es' ? 'Indicadores del mercado' : 'Market indicators'}
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {locale === 'es'
              ? 'El BHT Index resume en un número de 0 a 100 la valuación (CAPE de Shiller, P/E), la inflación, las tasas, el apalancamiento, el sentimiento y la economía. Abajo: su lectura de hoy, la gráfica histórica del S&P 500, el Nasdaq-100 y TQQQ con sus señales, y cada componente con su dato.'
              : 'The BHT Index sums up valuation (Shiller CAPE, P/E), inflation, rates, leverage, sentiment and the economy in a single 0–100 number. Below: today’s reading, the historical chart of the S&P 500, Nasdaq-100 and TQQQ with its signals, and every component with its data.'}
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

        {/* 1) BHT de hoy: termómetro, tendencia, KPIs y rendimientos históricos de la combinación de hoy */}
        <BhtTodaySummary initial={thermo} pe={peRatioData.indicator.currentValue} />

        {/* 2) Gráfica del valor de mercado (BHT, señales y detalle por fecha) */}
        <MarketValueIndicatorClient
          shillerPeData={shillerPeData}
          peRatioData={peRatioData}
          sp500PriceData={sp500PriceData}
        />

        {/* 3) Componentes del BHT con su dato, puntaje, peso y aporte */}
        <BhtComponents initial={thermo} />

      </div>
    </Layout>
  );
}
