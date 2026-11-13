import React from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Star, Sparkles } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { SubscribeForm } from '@/components/SubscribeForm';
import { IndexSparklineCard } from '@/components/IndexSparklineCard';
import { JsonLd } from '@/components/JsonLd';
import { getTickers, getLatestMarketValue, getMarketSeries, getCapeSeries, Ticker } from '@/services/api';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { TOKENS } from '@/lib/designTokens';
import { changeBadgeType, fearGreedLabel, formatChangePct } from '@/lib/formatChange';
import { capeBadgeType, capeBandLabel } from '@/lib/capeBands';
import { levelLabel } from '@/lib/levelLabels';

// ISR: revalidate home page every 60 seconds
export const revalidate = 60;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://buyholdtime.com';

// Sparkline trends for the home page cards

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Home' });
  // Sin datos inventados: si la API falla, las secciones que dependen de ella no se muestran.
  let tickers: Ticker[] = [];
  try {
    tickers = await getTickers();
  } catch (err) {
    console.error('Home: no se pudieron cargar los tickers', err);
  }

  // Filter top recommended tickers sorted by index desc
  const recommendedTickers = [...tickers]
    .sort((a, b) => b.buyHoldIndex - a.buyHoldIndex)
    .slice(0, 5);

  const spyTicker = tickers.find((t) => t.symbol === 'SPY');
  const spyPrice = spyTicker ? `$${spyTicker.price.toFixed(2)}` : '—';
  const spyChange = formatChangePct(spyTicker?.changePercent);

  const qqqTicker = tickers.find((t) => t.symbol === 'QQQ');
  const qqqPrice = qqqTicker ? `$${qqqTicker.price.toFixed(2)}` : '—';
  const qqqChange = formatChangePct(qqqTicker?.changePercent);

  // Fear & Greed real (serie diaria FEAR_GREED de CNN en bt_market_data, la misma del termómetro).
  // La fila fear_greed de la tabla `indicators` viene del seed y no se actualiza.
  // Mini-gráficas con las series reales de los últimos 30 días hábiles.
  const [spySpark, nasdaqSpark, fearSpark, schillerSpark] = await Promise.all([
    getMarketSeries('SPY').catch(() => []), getMarketSeries('QQQ').catch(() => []),
    getMarketSeries('FEAR_GREED').catch(() => []), getCapeSeries().catch(() => []),
  ]);
  const fg = fearSpark.length ? fearSpark[fearSpark.length - 1] : await getLatestMarketValue('FEAR_GREED').catch(() => null);
  const fgLabel = fg ? fearGreedLabel(fg.value) : null;
  const fearVal = fg ? `${Math.round(fg.value)} / 100` : '—';
  const fearStatus = fgLabel ? t(`fg_${fgLabel}`) : '—';

  // CAPE registrado diario (el mismo del termómetro): valor, etiqueta y mini-gráfica de la misma serie.
  const capeLast = schillerSpark.length ? schillerSpark[schillerSpark.length - 1].value : null;
  const capeVal = capeLast != null ? `${capeLast.toFixed(2)}x` : '—';
  const capeStatus = capeLast != null ? levelLabel(capeBandLabel(capeLast), locale) : '—';

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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent-500/20 bg-accent-500/5 text-accent-400 text-xs font-semibold">
            <Sparkles size={14} className="animate-pulse" />
            <span>{t('badge')}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-white">
            {t('heroLine1')}<br />
            {t('heroLine2a')}<span className="bg-gradient-to-r from-accent-400 to-favorable-400 bg-clip-text text-transparent">{t('heroLine2b')}</span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            {t('heroSubtitle')}
          </p>

          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <Link 
              href={`/${locale}/prices`} 
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-950 bg-accent-400 hover:bg-accent-300 transition"
            >
              {t('ctaTickers')}
              <ArrowRight size={16} />
            </Link>
            <Link 
              href={`/${locale}/indicators`} 
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-slate-200 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white transition"
            >
              {t('ctaIndicators')}
            </Link>
          </div>
        </section>

        {/* Market Gauges Dashboard */}
        {(spyTicker || qqqTicker || fg || capeLast != null) && (
        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-bold tracking-tight text-white text-center sm:text-left">
            {t('indicatorsTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {spyTicker && (
            <IndexSparklineCard
                title="S&P 500 ETF (SPY)"
                valueStr={spyPrice}
                badgeText={spyChange}
                badgeType={changeBadgeType(spyTicker?.changePercent)}
                sparklineData={spySpark}
                color={TOKENS.favorable}
                footerText={t('cardSpyFooter')}
              />
            )}
            {qqqTicker && (
            <IndexSparklineCard
                title="NASDAQ 100 ETF (QQQ)"
                valueStr={qqqPrice}
                badgeText={qqqChange}
                badgeType={changeBadgeType(qqqTicker?.changePercent)}
                sparklineData={nasdaqSpark}
                color="#3b82f6"
                footerText={t('cardQqqFooter')}
              />
            )}
            {fg && (
            <IndexSparklineCard
                title="Fear & Greed Index"
                valueStr={fearVal}
                badgeText={fearStatus}
                badgeType={fgLabel === 'fear' || fgLabel === 'extremeFear' ? 'error' : fgLabel ? 'warning' : 'info'}
                sparklineData={fearSpark}
                dec={0}
                color="#fbbf24"
                footerText={t('cardFgFooter')}
              />
            )}
            {capeLast != null && (
            <IndexSparklineCard
                title="Shiller PE Ratio (CAPE)"
                valueStr={capeVal}
                badgeText={capeStatus}
                badgeType={capeLast != null ? capeBadgeType(capeLast) : 'info'}
                sparklineData={schillerSpark}
                color="#f87171"
                footerText={t('cardCapeFooter')}
              />
            )}
          </div>
        </section>
        )}

        {/* Featured Stocks (oculta si la API no respondió) */}
        {recommendedTickers.length > 0 && (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                {t('topTitle')}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {t('topSubtitle')}
              </p>
            </div>
            <Link 
              href={`/${locale}/prices`} 
              className="text-xs font-semibold text-accent-400 hover:text-accent-300 transition"
            >
              {t('viewAll', { count: tickers.length })}
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendedTickers.map((stock) => {
              const isBuy = stock.buyHoldIndex >= 75;
              const badgeClass = stock.buyHoldIndex >= 85 
                ? 'bg-favorable-500/10 text-favorable-400 border-favorable-500/20' 
                : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

              return (
                <div 
                  key={stock.symbol} 
                  className="flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm shadow-xl relative overflow-hidden transition hover:border-slate-800 hover:bg-slate-900/10"
                >
                  {/* Color strip accent representing index score */}
                  <div className={`absolute top-0 left-0 w-1 h-full ${isBuy ? 'bg-favorable-500' : 'bg-caution-500'}`} />
                  
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
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">{t('price')}</span>
                      <p className="text-lg font-extrabold text-white">${stock.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">{t('dailyChange')}</span>
                      <p className={`text-base font-bold ${stock.changePercent >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>
                        {formatChangePct(stock.changePercent)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-900/30 border border-slate-900/50 p-3 rounded-xl text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Star size={14} className="fill-caution-400 stroke-caution-400" />
                      {t('indexScore')}
                    </span>
                    <span className={`font-extrabold text-sm ${isBuy ? 'text-favorable-400' : 'text-caution-400'}`}>
                      {stock.buyHoldIndex} / 100
                    </span>
                  </div>

                  <div className="flex gap-4 text-[10px] text-slate-500">
                    <span>{t('pe')} <strong>{stock.pe}x</strong></span>
                    <span>•</span>
                    <span>{t('divYield')} <strong>{stock.dy}%</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
          <RiskDisclaimer variant="signal" />
        </section>
        )}

        {/* Newsletter Subscription */}
        <section className="flex justify-center py-6">
          <SubscribeForm />
        </section>

      </div>
    </Layout>
  );
}
