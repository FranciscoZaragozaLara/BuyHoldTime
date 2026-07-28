'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Sparkles, TrendingUp, DollarSign, ShieldAlert, Award, Layers } from 'lucide-react';

interface FundamentalAnalysisCardProps {
  snapshot: any;
  currentPrice: number;
}

export const FundamentalAnalysisCard: React.FC<FundamentalAnalysisCardProps> = ({ snapshot, currentPrice }) => {
  const locale = useLocale();
  if (!snapshot) return null;

  const gfScore = snapshot.gfScore ?? null;
  const gfValue = snapshot.gfValue ? Number(snapshot.gfValue) : null;
  const recommendation = snapshot.recommendation || null;

  // Valuation comparison %
  let diffPercent: number | null = null;
  if (gfValue && gfValue > 0) {
    diffPercent = ((currentPrice - gfValue) / gfValue) * 100;
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
    { label: locale === 'es' ? 'Fuerza Financiera' : 'Financial Strength', value: scoresObj.financialStrength },
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
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
              {locale === 'es' ? 'Análisis Fundamental GuruFocus' : 'GuruFocus Fundamental Analysis'}
            </h3>
            <p className="text-xs text-slate-400">
              {locale === 'es' ? 'Valoración intrínseca, scores de salud financiera y múltiplos avanzados' : 'Intrinsic valuation, financial health scores, and valuation multiples'}
            </p>
          </div>
        </div>
        
        {/* Recommendation Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500">{locale === 'es' ? 'Estatus:' : 'Status:'}</span>
          <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${getStatusBadgeStyle(recommendation, diffPercent)}`}>
            {valuationStatus}
          </span>
        </div>
      </div>

      {/* Main Grid: Score Gauge + GF Value Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* GF Score Box */}
        <div className="flex items-center justify-between p-5 rounded-xl border border-slate-900 bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
              <Award size={13} className="text-teal-400" />
              GuruFocus Score
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-black text-white">{gfScore ?? 'N/A'}</span>
              <span className="text-xs text-slate-500 font-bold">/ 100</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {gfScore && gfScore >= 80 ? (locale === 'es' ? 'Excelente Desempeño' : 'Outstanding Performance') : (locale === 'es' ? 'Desempeño Moderado' : 'Moderate Performance')}
            </span>
          </div>

          {/* Circular score visual */}
          {gfScore !== null && (
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="26" fill="transparent" stroke="#1e293b" strokeWidth="4" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="transparent"
                  stroke={gfScore >= 80 ? '#14b8a6' : gfScore >= 60 ? '#f59e0b' : '#f43f5e'}
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 - (gfScore / 100) * (2 * Math.PI * 26)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-black text-white">{gfScore}</span>
            </div>
          )}
        </div>

        {/* GF Value Box */}
        <div className="flex items-center justify-between p-5 rounded-xl border border-slate-900 bg-slate-900/40 relative overflow-hidden md:col-span-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
              <DollarSign size={13} className="text-emerald-400" />
              GF Value (Valor Intrínseco)
            </span>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-black text-emerald-400">
                {gfValue ? `$${gfValue.toFixed(2)}` : 'N/A'}
              </span>
              <span className="text-xs text-slate-400">
                {locale === 'es' ? 'vs Precio Actual:' : 'vs Current Price:'} <strong className="text-white">${currentPrice.toFixed(2)}</strong>
              </span>
            </div>
            {diffPercent !== null && (
              <span className={`text-[11px] font-bold ${diffPercent >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {diffPercent >= 0 ? `+${diffPercent.toFixed(1)}%` : `${diffPercent.toFixed(1)}%`} {diffPercent >= 0 ? (locale === 'es' ? 'sobre GF Value' : 'above GF Value') : (locale === 'es' ? 'bajo GF Value (Oportunidad)' : 'below GF Value')}
              </span>
            )}
          </div>

          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500">{locale === 'es' ? 'Modelo' : 'Model'}</span>
            <span className="text-xs font-bold text-slate-300">GuruFocus Valuation</span>
          </div>
        </div>

      </div>

      {/* Sub-Scores Breakdown */}
      {scoreItems.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-2">
          <span className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers size={13} className="text-teal-400" />
            {locale === 'es' ? 'Desglose de Factores Clave (Sub-Scores)' : 'Key Factor Breakdown'}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {scoreItems.map((item) => (
              <div key={item.label} className="flex flex-col gap-1 p-3 rounded-lg border border-slate-900 bg-slate-900/30">
                <span className="text-[10px] font-semibold text-slate-400 truncate">{item.label}</span>
                <span className="text-sm font-black text-teal-300">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proposed Valuation Multiples Grid */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-900/80">
        <span className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1.5">
          <TrendingUp size={13} className="text-teal-400" />
          {locale === 'es' ? 'Múltiples de Valuación Avanzados (Scraped)' : 'Advanced Valuation Multiples'}
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {multiples.map((m) => (
            <div key={m.label} className="flex flex-col gap-0.5 p-3 rounded-lg border border-slate-900 bg-slate-900/30">
              <span className="text-[10px] text-slate-500 font-semibold">{m.label}</span>
              <span className="text-sm font-bold font-mono text-slate-100">{m.value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
