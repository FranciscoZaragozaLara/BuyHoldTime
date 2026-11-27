'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, DollarSign, Award, TrendingUp, BarChart2 } from 'lucide-react';
import { Ticker, type TickerFundamentals } from '@/services/api';
import { ownGrowth } from '@/lib/ownProjections';
import { fairValue, trailingPe, valuationLabel } from '@/lib/ownValuation';

import precalculatedPerformance from '../data/precalculated_performance.json';

// Análisis fundamental de la ficha solo con datos propios: trimestres de EDGAR (fundamentals), la cotización y el P/E
// terminal del sector. Sin GF Score/GF Value de GuruFocus (ver docs/plan/data-licensing-strategy.md).
interface FundamentalAnalysisCardProps {
  ticker: Ticker;
  fundamentals?: TickerFundamentals | null;
}

// Formatting helpers
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

const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const chgCls = (v: number | null | undefined) => (v == null ? 'text-slate-500' : v >= 0 ? 'text-favorable-400' : 'text-risk-400');

export const FundamentalAnalysisCard: React.FC<FundamentalAnalysisCardProps> = ({ ticker, fundamentals }) => {
  const locale = useLocale();
  const es = locale === 'es';
  const tm = useTranslations('Ticker.metrics');
  const currentPrice = ticker.price;
  const f = fundamentals ?? null;

  const epsTtm = f?.eps?.ttm ?? null;
  const growth = ownGrowth(ticker.historicalEpsQuarterly);
  const fv = fairValue(epsTtm, growth.rate, ticker.sectorTerminalPe, currentPrice);
  const label = valuationLabel(fv?.diffPct ?? null);
  const labelText = label === 'overvalued' ? (es ? 'Cara' : 'Overvalued') : label === 'undervalued' ? (es ? 'Barata' : 'Undervalued') : label === 'fair' ? (es ? 'Valor justo' : 'Fairly valued') : null;
  const labelCls = label === 'overvalued' ? 'bg-risk-500/10 text-risk-400 border-risk-500/30' : label === 'undervalued' ? 'bg-favorable-500/10 text-favorable-400 border-favorable-500/30' : 'bg-caution-500/10 text-caution-400 border-caution-500/30';
  const pe = trailingPe(currentPrice, epsTtm, ticker.pe);
  const ebit = f?.ebit?.ttm ?? null;

  // Consolidated non-repeating metrics organized by Broker category
  const valuationMetrics = [
    { label: tm('marketCap'), value: ticker.cap || 'N/A' },
    { label: tm('enterpriseValue'), value: formatFinancialValue(ticker.enterpriseValue) },
    { label: tm('peTrailing'), value: pe ? `${pe.toFixed(1)}x` : 'N/A' },
    { label: tm('forwardPe'), value: ticker.forwardPe ? `${ticker.forwardPe.toFixed(1)}x` : 'N/A' },
    { label: tm('pb'), value: ticker.bookValue ? `${(currentPrice / ticker.bookValue).toFixed(2)}x` : 'N/A' },
    { label: tm('ps'), value: f?.ps ? `${f.ps.toFixed(2)}x` : 'N/A' },
    { label: 'EV/EBIT', value: ticker.enterpriseValue && ebit && ebit > 0 ? `${(ticker.enterpriseValue / ebit).toFixed(1)}x` : 'N/A' },
    { label: tm('peg'), value: ticker.pegRatio ? `${ticker.pegRatio.toFixed(2)}x` : 'N/A' },
    { label: tm('sector'), value: ticker.sector || 'N/A' },
    { 
      label: tm('peTerminalSector'), 
      value: ticker.sectorTerminalPe ? `${ticker.sectorTerminalPe.toFixed(1)}x` : 'N/A' 
    },
  ];

  const earningsYieldVal = f?.earningsYield != null
    ? `${f.earningsYield.toFixed(2)}%`
    : (pe ? `${((1 / pe) * 100).toFixed(2)}%` : 'N/A');

  const earningsMetrics = [
    { label: tm('eps'), value: epsTtm != null ? `$${epsTtm.toFixed(2)}` : (ticker.eps ? `$${ticker.eps.toFixed(2)}` : 'N/A') },
    { label: tm('earningsYield'), value: earningsYieldVal },
    { label: tm('bookValue'), value: ticker.bookValue ? `$${ticker.bookValue.toFixed(2)}` : 'N/A' },
  ];

  const perfData = (precalculatedPerformance as any)[ticker.symbol];
  const fromHighValCard = perfData?.fromHigh ?? (ticker.fiftyTwoWeekHigh ? Math.min(0, ((currentPrice - ticker.fiftyTwoWeekHigh) / ticker.fiftyTwoWeekHigh) * 100) : 0);
  const isAtHighCard = Math.abs(fromHighValCard) < 0.01;
  const fromHighFormattedCard = `${fromHighValCard > 0 ? '+' : ''}${fromHighValCard.toFixed(2)}%`;
  const fromHighColorCard = isAtHighCard ? 'text-accent-400 font-bold' : 'text-risk-400 font-bold';

  const marketMetrics = [
    { label: tm('fromHigh'), value: fromHighFormattedCard, isCustomColor: true, colorClass: fromHighColorCard },
    { label: tm('divRate'), value: ticker.dividendRate ? `$${ticker.dividendRate.toFixed(2)}` : '$0.00' },
    { label: tm('divYield'), value: ticker.dy ? `${ticker.dy.toFixed(2)}%` : '0.00%' },
    { label: tm('avgVolume'), value: formatVolumeValue(ticker.avgVolume) },
  ];

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-xl">
      
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-900/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent-500/10 border border-accent-500/30 text-accent-400">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
              {es ? 'Análisis Fundamental BHT' : 'BHT Fundamental Analysis'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {es ? 'Valor estimado, crecimiento y múltiplos con los reportes de la empresa a la SEC' : 'Estimated value, growth and multiples from the company\'s SEC filings'}
            </p>
          </div>
        </div>

        {labelText && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] uppercase font-bold text-slate-500">{es ? 'Estatus:' : 'Status:'}</span>
            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border ${labelCls}`}>{labelText}</span>
          </div>
        )}
      </div>

      {(fv || f) && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">

          {/* Valor estimado propio (7 cols) */}
          <div className="md:col-span-7 flex flex-col gap-0.5 p-3.5 rounded-xl border border-slate-900 bg-slate-900/30">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
              <DollarSign size={12} className="text-favorable-400" />
              {es ? 'Valor estimado BHT' : 'BHT estimated value'}
            </span>
            <div className="flex items-baseline gap-3 mt-0.5">
              <span className="text-2xl font-black text-favorable-400">{fv ? `$${fv.value.toFixed(2)}` : 'N/A'}</span>
              <span className="text-xs text-slate-400">
                vs {es ? 'Precio Actual:' : 'Current Price:'} <strong className="text-white">${currentPrice.toFixed(2)}</strong>
              </span>
            </div>
            {fv?.diffPct != null && (
              <span className={`text-[10px] font-bold ${fv.diffPct >= 0 ? 'text-risk-400' : 'text-favorable-400'}`}>
                {pct(fv.diffPct)} {fv.diffPct >= 0 ? (es ? 'sobre el valor estimado' : 'above the estimated value') : (es ? 'bajo el valor estimado' : 'below the estimated value')}
              </span>
            )}
            <span className="text-[10px] text-slate-500 mt-1">
              {fv
                ? (es
                  ? `EPS de los próximos 12 meses $${fv.epsNext12m.toFixed(2)} (tendencia propia ${(fv.growth * 100).toFixed(1)}% anual) × P/E de salida del sector ${fv.terminalPe.toFixed(1)}x. Referencia, no precio objetivo.`
                  : `Next-12-month EPS $${fv.epsNext12m.toFixed(2)} (own trend ${(fv.growth * 100).toFixed(1)}% a year) × sector exit P/E ${fv.terminalPe.toFixed(1)}x. A reference, not a price target.`)
                : (es ? 'Sin utilidades positivas en los últimos 12 meses o sin P/E del sector.' : 'No positive earnings over the last 12 months or no sector P/E.')}
            </span>
          </div>

          {/* Crecimiento y margen (5 cols) */}
          <div className="md:col-span-5 flex flex-col gap-1.5 p-3.5 rounded-xl border border-slate-900 bg-slate-900/30">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
              <Award size={12} className="text-accent-400" />
              {es ? 'Últimos 12 meses vs los 12 previos' : 'Last 12 months vs the prior 12'}
            </span>
            {[
              { k: es ? 'Ingresos' : 'Revenue', v: f?.revenue ? formatFinancialValue(f.revenue.ttm) : '—', c: f?.revenue?.yoy ?? null, cTxt: pct(f?.revenue?.yoy) },
              { k: 'EPS', v: f?.eps ? `$${f.eps.ttm.toFixed(2)}` : '—', c: f?.eps?.yoy ?? null, cTxt: pct(f?.eps?.yoy) },
              { k: es ? 'Margen operativo' : 'Operating margin', v: f?.margin ? `${f.margin.now.toFixed(1)}%` : '—', c: f?.margin?.prev != null ? f.margin.now - f.margin.prev : null, cTxt: f?.margin?.prev != null ? `${f.margin.now - f.margin.prev >= 0 ? '+' : ''}${(f.margin.now - f.margin.prev).toFixed(1)} pp` : '—' },
            ].map((r) => (
              <div key={r.k} className="flex items-baseline justify-between text-xs">
                <span className="text-slate-400">{r.k}</span>
                <span className="font-mono text-slate-100">{r.v} <span className={`ml-1 text-[10px] font-bold ${chgCls(r.c)}`}>{r.cTxt}</span></span>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Consolidated Professional Broker Fundamental Metrics Grid (Directly below BHT Value) */}
      <div className="flex flex-col gap-3 pt-2 border-t border-slate-900/80">
        
        {/* Section 1: Valuation & Multiples */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
            <TrendingUp size={11} className="text-accent-400" />
            {locale === 'es' ? 'Valoración & Múltiples' : 'Valuation & Multiples'}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-1.5">
            {valuationMetrics.map((m) => (
              <div key={m.label} className="p-2 rounded-lg border border-slate-900 bg-slate-900/30 text-center flex flex-col justify-center">
                <span className="text-[8.5px] text-slate-500 uppercase font-bold truncate">{m.label}</span>
                <span className="text-xs font-bold font-mono text-slate-100 mt-0.5 truncate">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2 & 3 Combined: Rentabilidad, Dividendos & Rango 52 Semanas */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          
          {/* Rentabilidad & Dividendos (8 cols) */}
          <div className="md:col-span-8 flex flex-col gap-1.5">
            <span className="text-[9.5px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
              <BarChart2 size={11} className="text-accent-400" />
              {locale === 'es' ? 'Rentabilidad, Dividendos & Mercado' : 'Earnings, Dividends & Market'}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
              {[...earningsMetrics, ...marketMetrics].map((m: any) => (
                <div key={m.label} className="p-2 rounded-lg border border-slate-900 bg-slate-900/30 text-center flex flex-col justify-center">
                  <span className="text-[8.5px] text-slate-500 uppercase font-bold truncate">{m.label}</span>
                  <span className={`text-xs font-bold font-mono mt-0.5 truncate ${m.isCustomColor ? m.colorClass : 'text-slate-100'}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 52-Week Range Slider (4 cols) */}
          <div className="md:col-span-4 p-2.5 rounded-lg border border-slate-900 bg-slate-900/30 flex flex-col justify-center gap-1">
            <div className="flex justify-between items-center text-[9px] uppercase font-bold">
              <span className="text-slate-500">52-Week Range</span>
              <span className="text-slate-300 font-mono">
                {ticker.fiftyTwoWeekLow && ticker.fiftyTwoWeekHigh
                  ? `$${ticker.fiftyTwoWeekLow.toFixed(1)} - $${ticker.fiftyTwoWeekHigh.toFixed(1)}`
                  : 'N/A'}
              </span>
            </div>
            {ticker.fiftyTwoWeekLow && ticker.fiftyTwoWeekHigh && (
              <div className="relative w-full h-1.5 bg-slate-900 rounded-full mt-1 overflow-hidden">
                <div 
                  className="absolute h-full bg-accent-400 rounded-full" 
                  style={{
                    left: `${Math.max(0, Math.min(100, ((currentPrice - ticker.fiftyTwoWeekLow) / (ticker.fiftyTwoWeekHigh - ticker.fiftyTwoWeekLow)) * 100))}%`,
                    width: '4px',
                    marginLeft: '-2px'
                  }}
                />
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
