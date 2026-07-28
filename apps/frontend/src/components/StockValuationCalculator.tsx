'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Calculator, TrendingUp, TrendingDown, RefreshCw, ShieldAlert, Zap, Sliders, ArrowUpRight } from 'lucide-react';
import { Ticker } from '@/services/api';

interface StockValuationCalculatorProps {
  ticker: Ticker;
  snapshot?: any;
}

export const StockValuationCalculator: React.FC<StockValuationCalculatorProps> = ({ ticker, snapshot }) => {
  const locale = useLocale();

  // User interactive state (Sliders -50% to +50%)
  const [epsVariancePct, setEpsVariancePct] = useState<number>(0);
  const [peVariancePct, setPeVariancePct] = useState<number>(0);

  // Extract base financial data with intelligent fallback chain
  const currentPrice = ticker.price || 1;
  const peTtm = snapshot?.pe ? Number(snapshot.pe) : (ticker.pe && ticker.pe > 0 ? ticker.pe : 25);
  const peFwd = snapshot?.forwardPe ? Number(snapshot.forwardPe) : (ticker.forwardPe && ticker.forwardPe > 0 ? ticker.forwardPe : peTtm * 0.9);

  // Paso A: Constantes Base del Modelo
  const peMix = (peTtm + peFwd) / 2;

  // Paso B: Ajuste Dinámico por Varianza de P/E
  const adjPeTtm = peTtm * (1 + peVariancePct / 100);
  const adjPeFwd = peFwd * (1 + peVariancePct / 100);
  const adjPeMix = peMix * (1 + peVariancePct / 100);

  // Extract or build annual projections array
  const rawProjections = useMemo(() => {
    const estimatesObj = snapshot?.analystEstimates;
    if (estimatesObj && estimatesObj.years && estimatesObj.estimates) {
      const years: string[] = estimatesObj.years;
      const epsEstimate = estimatesObj.estimates.find(
        (e: any) => e.metric && (e.metric.includes('EPS') || e.metric.includes('Earnings'))
      );

      if (epsEstimate && epsEstimate.values && epsEstimate.values.length > 0) {
        return years.map((year, idx) => {
          const valStr = epsEstimate.values[idx];
          const epsTtm = valStr && valStr !== '—' ? parseFloat(valStr) : 0;
          // Next year's EPS if available, else projected at +10%
          const nextValStr = epsEstimate.values[idx + 1];
          const epsFwd = nextValStr && nextValStr !== '—' ? parseFloat(nextValStr) : (epsTtm > 0 ? epsTtm * 1.1 : epsTtm);

          return {
            year,
            epsBaseTtm: isNaN(epsTtm) ? 0 : epsTtm,
            epsBaseFwd: isNaN(epsFwd) ? 0 : epsFwd,
          };
        }).filter((item) => item.epsBaseTtm > 0);
      }
    }

    // Fallback if snapshot estimates are not available: Generate 4-year projection based on current EPS
    const baseEps = ticker.eps && ticker.eps > 0 ? ticker.eps : currentPrice / Math.max(10, peTtm);
    const currentYear = new Date().getFullYear();
    const fallbackList = [];

    for (let i = 1; i <= 4; i++) {
      const yearStr = `${locale === 'es' ? 'Año' : 'Year'} ${currentYear + i}`;
      const epsTtm = baseEps * Math.pow(1.12, i);
      const epsFwd = baseEps * Math.pow(1.12, i + 1);
      fallbackList.push({
        year: yearStr,
        epsBaseTtm: parseFloat(epsTtm.toFixed(2)),
        epsBaseFwd: parseFloat(epsFwd.toFixed(2)),
      });
    }

    return fallbackList;
  }, [snapshot, ticker, currentPrice, peTtm, locale]);

  // Paso C: Motor de Cálculo Multi-Escenario (3-Way Model Iteration)
  const scenarios = useMemo(() => {
    return rawProjections.map((item) => {
      // 1. Escenario TTM
      const adjEpsTtm = item.epsBaseTtm * (1 + epsVariancePct / 100);
      const projectedPriceTtm = adjEpsTtm * adjPeTtm;
      const returnTtm = ((projectedPriceTtm - currentPrice) / currentPrice) * 100;

      // 2. Escenario Forward
      const adjEpsFwd = item.epsBaseFwd * (1 + epsVariancePct / 100);
      const projectedPriceFwd = adjEpsFwd * adjPeFwd;
      const returnFwd = ((projectedPriceFwd - currentPrice) / currentPrice) * 100;

      // 3. Escenario Mix (Híbrido Promedio)
      const epsMix = (item.epsBaseTtm + item.epsBaseFwd) / 2;
      const adjEpsMix = epsMix * (1 + epsVariancePct / 100);
      const projectedPriceMix = adjEpsMix * adjPeMix;
      const returnMix = ((projectedPriceMix - currentPrice) / currentPrice) * 100;

      return {
        year: item.year,
        epsBaseTtm: item.epsBaseTtm,
        adjEpsTtm,
        projectedPriceTtm,
        returnTtm,
        projectedPriceFwd,
        returnFwd,
        projectedPriceMix,
        returnMix,
      };
    });
  }, [rawProjections, epsVariancePct, peVariancePct, adjPeTtm, adjPeFwd, adjPeMix, currentPrice]);

  // Quick Preset Actions
  const applyPreset = (epsVar: number, peVar: number) => {
    setEpsVariancePct(epsVar);
    setPeVariancePct(peVar);
  };

  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Calculator size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
              {locale === 'es' ? 'Calculadora Multi-Escenario de Valoración (3-Way Model)' : '3-Way Valuation Multi-Scenario Calculator'}
            </h3>
            <p className="text-xs text-slate-400">
              {locale === 'es' 
                ? 'Simula precios futuros evaluando la contracción de múltiplos P/E y varianza en utilidades (EPS)' 
                : 'Simulate future stock prices stress-testing P/E contraction and EPS variance'}
            </p>
          </div>
        </div>

        {/* Action Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyPreset(-15, -20)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white transition cursor-pointer flex items-center gap-1"
          >
            <ShieldAlert size={12} className="text-amber-400" />
            {locale === 'es' ? 'Estrés Moderado' : 'Moderate Stress'}
          </button>
          <button
            onClick={() => applyPreset(-30, -35)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer flex items-center gap-1"
          >
            <TrendingDown size={12} className="text-rose-400" />
            {locale === 'es' ? 'Crash / Bajista' : 'Bear Crash'}
          </button>
          <button
            onClick={() => applyPreset(15, 15)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition cursor-pointer flex items-center gap-1"
          >
            <TrendingUp size={12} className="text-emerald-400" />
            {locale === 'es' ? 'Bullish' : 'Bullish'}
          </button>
          <button
            onClick={() => applyPreset(0, 0)}
            className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer border border-slate-800"
            title={locale === 'es' ? 'Restablecer a 0%' : 'Reset to 0%'}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Sliders & Base Constants Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-slate-900/30 p-4 rounded-xl border border-slate-900">
        
        {/* Sliders (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* EPS Variance Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Sliders size={13} className="text-teal-400" />
                {locale === 'es' ? 'Varianza en Utlidades / EPS:' : 'EPS Variance:'}
              </span>
              <span className={`font-mono font-black ${epsVariancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {epsVariancePct >= 0 ? `+${epsVariancePct}%` : `${epsVariancePct}%`}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={epsVariancePct}
              onChange={(e) => setEpsVariancePct(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
            />
          </div>

          {/* PE Variance Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Sliders size={13} className="text-teal-400" />
                {locale === 'es' ? 'Varianza en Múltiplo P/E:' : 'P/E Variance:'}
              </span>
              <span className={`font-mono font-black ${peVariancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {peVariancePct >= 0 ? `+${peVariancePct}%` : `${peVariancePct}%`}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={peVariancePct}
              onChange={(e) => setPeVariancePct(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
            />
          </div>

        </div>

        {/* Adjusted Multiples Matrix (5 cols) */}
        <div className="lg:col-span-5 grid grid-cols-3 gap-2 border-t lg:border-t-0 lg:border-l border-slate-900 pt-3 lg:pt-0 lg:pl-4 text-center">
          
          <div className="p-2.5 rounded-lg border border-slate-900 bg-slate-950/40 flex flex-col justify-center">
            <span className="text-[9px] text-slate-500 uppercase font-bold">P/E TTM</span>
            <span className="text-xs font-black text-white font-mono mt-0.5">{peTtm.toFixed(1)}x</span>
            <span className="text-[10px] text-teal-400 font-mono font-semibold">{adjPeTtm.toFixed(1)}x</span>
          </div>

          <div className="p-2.5 rounded-lg border border-slate-900 bg-slate-950/40 flex flex-col justify-center">
            <span className="text-[9px] text-slate-500 uppercase font-bold">P/E FWD</span>
            <span className="text-xs font-black text-white font-mono mt-0.5">{peFwd.toFixed(1)}x</span>
            <span className="text-[10px] text-teal-400 font-mono font-semibold">{adjPeFwd.toFixed(1)}x</span>
          </div>

          <div className="p-2.5 rounded-lg border border-teal-500/20 bg-teal-500/5 flex flex-col justify-center">
            <span className="text-[9px] text-teal-400 uppercase font-extrabold">P/E MIX</span>
            <span className="text-xs font-black text-white font-mono mt-0.5">{peMix.toFixed(1)}x</span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">{adjPeMix.toFixed(1)}x</span>
          </div>

        </div>

      </div>

      {/* Projection Scenarios Table */}
      <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
            <tr>
              <th className="p-3.5 pl-4 min-w-[120px]">{locale === 'es' ? 'Año' : 'Year'}</th>
              <th className="p-3.5 text-right w-28">{locale === 'es' ? 'EPS Ajustado' : 'Adj. EPS'}</th>
              <th className="p-3.5 text-right">{locale === 'es' ? 'Escenario TTM' : 'TTM Scenario'}</th>
              <th className="p-3.5 text-right">{locale === 'es' ? 'Escenario Forward' : 'Forward Scenario'}</th>
              <th className="p-3.5 text-right font-black text-teal-300">{locale === 'es' ? 'Escenario Mix (Recomendado)' : 'Mix Scenario (Recommended)'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 font-mono">
            {scenarios.map((sc, idx) => (
              <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                <td className="p-3.5 pl-4 font-sans font-extrabold text-white flex items-center gap-1">
                  <span>{sc.year}</span>
                </td>
                
                {/* EPS Ajustado */}
                <td className="p-3.5 text-right font-bold text-slate-300">
                  ${sc.adjEpsTtm.toFixed(2)}
                </td>

                {/* Escenario TTM */}
                <td className="p-3.5 text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-white">${sc.projectedPriceTtm.toFixed(2)}</span>
                    <span className={`text-[10px] font-extrabold ${sc.returnTtm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sc.returnTtm >= 0 ? '+' : ''}{sc.returnTtm.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* Escenario Forward */}
                <td className="p-3.5 text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-white">${sc.projectedPriceFwd.toFixed(2)}</span>
                    <span className={`text-[10px] font-extrabold ${sc.returnFwd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sc.returnFwd >= 0 ? '+' : ''}{sc.returnFwd.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* Escenario Mix (Recomendado) */}
                <td className="p-3.5 text-right bg-teal-500/5">
                  <div className="flex flex-col items-end">
                    <span className="font-black text-emerald-400 text-sm">${sc.projectedPriceMix.toFixed(2)}</span>
                    <span className={`text-[11px] font-black px-1.5 py-0.5 rounded border ${
                      sc.returnMix >= 0 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {sc.returnMix >= 0 ? '+' : ''}{sc.returnMix.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
