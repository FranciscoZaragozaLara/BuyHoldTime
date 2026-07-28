'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Sparkles, DollarSign, Award, Layers, TrendingUp } from 'lucide-react';

interface FundamentalAnalysisCardProps {
  snapshot: any;
  currentPrice: number;
}

export const FundamentalAnalysisCard: React.FC<FundamentalAnalysisCardProps> = ({ snapshot, currentPrice }) => {
  const locale = useLocale();
  if (!snapshot) return null;

  const bhtScore = snapshot.gfScore ?? null;
  const bhtValue = snapshot.gfValue ? Number(snapshot.gfValue) : null;
  const recommendation = snapshot.recommendation || null;

  // Valuation comparison %
  let diffPercent: number | null = null;
  if (bhtValue && bhtValue > 0) {
    diffPercent = ((currentPrice - bhtValue) / bhtValue) * 100;
  }

  // Localize valuation recommendation status
  const getLocalizedValuationStatus = (rec: string | null, diff: number | null) => {
    if (rec) {
      const lower = rec.toLowerCase();
      if (lower.includes('significantly overvalued')) return locale === 'es' ? 'Muy Sobrevalorada' : 'Significantly Overvalued';
      if (lower.includes('modestly overvalued')) return locale === 'es' ? 'Ligeramente Sobrevalorada' : 'Modestly Overvalued';
      if (lower.includes('fairly valued')) return locale === 'es' ? 'Valor Justo' : 'Fairly Valued';
      if (lower.includes('modestly undervalued')) return locale === 'es' ? 'Ligeramente Infravalorada' : 'Modestly Undervalued';
      if (lower.includes('significantly undervalued')) return locale === 'es' ? 'Muy Infravalorada' : 'Significantly Undervalued';
      return rec;
    }
    if (diff !== null) {
      if (diff > 20) return locale === 'es' ? 'Sobrevalorada' : 'Overvalued';
      if (diff < -15) return locale === 'es' ? 'Infravalorada' : 'Undervalued';
      return locale === 'es' ? 'Valor Justo' : 'Fairly Valued';
    }
    return 'N/A';
  };

  const valuationStatus = getLocalizedValuationStatus(recommendation, diffPercent);

  const getStatusBadgeStyle = (rec: string | null, diff: number | null) => {
    const text = (rec || '').toLowerCase();
    if (text.includes('undervalued') || (diff !== null && diff < -10)) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
    if (text.includes('overvalued') || (diff !== null && diff > 15)) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  };

  // Scores breakdown from snapshot.scores
  const scoresObj = snapshot.scores && typeof snapshot.scores === 'object' ? snapshot.scores : {};

  const scoreItems = [
    { label: locale === 'es' ? 'Crecimiento' : 'Growth', value: scoresObj.growth },
    { label: locale === 'es' ? 'Rentabilidad' : 'Profitability', value: scoresObj.profitability },
    { label: locale === 'es' ? 'Fuerza Fin.' : 'Fin. Strength', value: scoresObj.financialStrength },
    { label: locale === 'es' ? 'Momento' : 'Momentum', value: scoresObj.momentum },
    { label: locale === 'es' ? 'Valuación' : 'Valuation', value: scoresObj.valuation },
  ].filter((item) => item.value);

  // Valuation multiples proposal
  const multiples = [
    { label: 'P/B Ratio', value: snapshot.pb ? `${Number(snapshot.pb).toFixed(2)}x` : 'N/A' },
    { label: 'P/S Ratio', value: snapshot.psRatio ? `${Number(snapshot.psRatio).toFixed(2)}x` : 'N/A' },
    { label: 'EV / EBITDA', value: snapshot.evToEbitda ? `${Number(snapshot.evToEbitda).toFixed(2)}x` : 'N/A' },
    { label: 'PEG Ratio', value: snapshot.pegRatio ? `${Number(snapshot.pegRatio).toFixed(2)}x` : 'N/A' },
    { label: 'Earnings Yield', value: snapshot.earningsYield ? `${(Number(snapshot.earningsYield) * 100).toFixed(2)}%` : 'N/A' },
    { label: 'Shiller P/E', value: snapshot.shillerPe ? `${Number(snapshot.shillerPe).toFixed(2)}x` : 'N/A' },
  ];

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-900/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
              {locale === 'es' ? 'Análisis Fundamental BHT' : 'BHT Fundamental Analysis'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {locale === 'es' ? 'Valoración intrínseca, BHT Score y múltiplos financieros avanzados' : 'Intrinsic valuation, BHT Score, and advanced financial multiples'}
            </p>
          </div>
        </div>
        
        {/* Recommendation Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] uppercase font-bold text-slate-500">{locale === 'es' ? 'Estatus:' : 'Status:'}</span>
          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border ${getStatusBadgeStyle(recommendation, diffPercent)}`}>
            {valuationStatus}
          </span>
        </div>
      </div>

      {/* Unified Core Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        
        {/* BHT Score (4 cols) */}
        <div className="md:col-span-4 flex items-center justify-between p-3.5 rounded-xl border border-slate-900 bg-slate-900/30">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
              <Award size={12} className="text-teal-400" />
              BHT Score
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black text-white">{bhtScore ?? 'N/A'}</span>
              <span className="text-[10px] text-slate-500 font-bold">/ 100</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {bhtScore && bhtScore >= 80 ? (locale === 'es' ? 'Excelente Desempeño' : 'Outstanding') : (locale === 'es' ? 'Desempeño Moderado' : 'Moderate')}
            </span>
          </div>

          {/* Mini gauge SVG */}
          {bhtScore !== null && (
            <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="19" fill="transparent" stroke="#1e293b" strokeWidth="3.5" />
                <circle
                  cx="24"
                  cy="24"
                  r="19"
                  fill="transparent"
                  stroke={bhtScore >= 80 ? '#14b8a6' : bhtScore >= 60 ? '#f59e0b' : '#f43f5e'}
                  strokeWidth="3.5"
                  strokeDasharray={2 * Math.PI * 19}
                  strokeDashoffset={2 * Math.PI * 19 - (bhtScore / 100) * (2 * Math.PI * 19)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[10px] font-black text-white">{bhtScore}</span>
            </div>
          )}
        </div>

        {/* BHT Value (8 cols) */}
        <div className="md:col-span-8 flex items-center justify-between p-3.5 rounded-xl border border-slate-900 bg-slate-900/30">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
              <DollarSign size={12} className="text-emerald-400" />
              BHT Value ({locale === 'es' ? 'Valor Intrínseco' : 'Intrinsic Value'})
            </span>
            <div className="flex items-baseline gap-3 mt-0.5">
              <span className="text-2xl font-black text-emerald-400">
                {bhtValue ? `$${bhtValue.toFixed(2)}` : 'N/A'}
              </span>
              <span className="text-xs text-slate-400">
                vs {locale === 'es' ? 'Precio Actual:' : 'Current Price:'} <strong className="text-white">${currentPrice.toFixed(2)}</strong>
              </span>
            </div>
            {diffPercent !== null && (
              <span className={`text-[10px] font-bold ${diffPercent >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {diffPercent >= 0 ? `+${diffPercent.toFixed(1)}%` : `${diffPercent.toFixed(1)}%`} {diffPercent >= 0 ? (locale === 'es' ? 'sobre BHT Value' : 'above BHT Value') : (locale === 'es' ? 'bajo BHT Value' : 'below BHT Value')}
              </span>
            )}
          </div>

          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[9px] uppercase font-bold text-slate-500">{locale === 'es' ? 'Modelo' : 'Model'}</span>
            <span className="text-xs font-bold text-slate-300">BHT Valuation</span>
          </div>
        </div>

      </div>

      {/* Sub-Scores & Valuation Multiples Inline Footer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1 border-t border-slate-900/80">
        
        {/* Sub-scores (5 cols) */}
        {scoreItems.length > 0 && (
          <div className="lg:col-span-5 flex flex-col gap-1.5">
            <span className="text-[9.5px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
              <Layers size={11} className="text-teal-400" />
              {locale === 'es' ? 'Sub-Scores BHT' : 'BHT Sub-Scores'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {scoreItems.map((item) => (
                <div key={item.label} className="px-2 py-1 rounded-md border border-slate-900 bg-slate-900/40 text-[10px] flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">{item.label}:</span>
                  <strong className="text-teal-300 font-black">{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multiples (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-1.5">
          <span className="text-[9.5px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
            <TrendingUp size={11} className="text-teal-400" />
            {locale === 'es' ? 'Múltiples Financieros BHT' : 'BHT Financial Multiples'}
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {multiples.map((m) => (
              <div key={m.label} className="p-1.5 rounded-md border border-slate-900 bg-slate-900/40 text-center flex flex-col">
                <span className="text-[8.5px] text-slate-500 uppercase font-bold truncate">{m.label}</span>
                <span className="text-xs font-bold font-mono text-slate-200 mt-0.5">{m.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
