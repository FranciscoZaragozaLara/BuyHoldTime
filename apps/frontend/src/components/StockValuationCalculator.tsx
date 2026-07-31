'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Calculator, TrendingUp, TrendingDown, RefreshCw, ShieldAlert, Sliders, AlertTriangle, ArrowRightLeft, Lock, Crown, Sparkles, LogIn } from 'lucide-react';
import { Ticker } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';

interface StockValuationCalculatorProps {
  ticker: Ticker;
  snapshot?: any;
}

export const StockValuationCalculator: React.FC<StockValuationCalculatorProps> = ({ ticker, snapshot }) => {
  const locale = useLocale();
  const { user, role } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Model Mode State: 'convergent' (Glide Path to Sector PE) vs 'standard' (Fixed PE)
  const [modelMode, setModelMode] = useState<'convergent' | 'standard'>('convergent');

  // User interactive state (Sliders -50% to +50%)
  const [epsVariancePct, setEpsVariancePct] = useState<number>(0);
  const [peVariancePct, setPeVariancePct] = useState<number>(0);

  // Terminal PE input (default from ticker.sectorTerminalPe or fallback 22.0)
  const defaultTerminalPe = ticker.sectorTerminalPe && ticker.sectorTerminalPe > 0 ? ticker.sectorTerminalPe : 22.0;
  const [terminalPe, setTerminalPe] = useState<number>(defaultTerminalPe);

  // Access Control: Se requiere rol PRO_USER o ADMIN para interactuar
  const hasAccess = role === 'PRO_USER' || role === 'ADMIN';

  // Extract base financial data with intelligent fallback chain
  const currentPrice = ticker.price || 1;
  const rawSnapshotPe = snapshot?.pe ? Number(snapshot.pe) : null;
  const peTtm = (rawSnapshotPe && rawSnapshotPe >= 3) ? rawSnapshotPe : (ticker.pe && ticker.pe > 0 ? ticker.pe : 25);
  const peFwd = snapshot?.forwardPe ? Number(snapshot.forwardPe) : (ticker.forwardPe && ticker.forwardPe > 0 ? ticker.forwardPe : peTtm * 0.9);

  // Base Multiples
  const peMix = (peTtm + peFwd) / 2;

  // Adjusted base multiples (modified by PE Variance Slider)
  const adjPeTtm = peTtm * (1 + peVariancePct / 100);
  const adjPeFwd = peFwd * (1 + peVariancePct / 100);
  const adjPeMix = peMix * (1 + peVariancePct / 100);

  const currentYearNum = new Date().getFullYear();

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

    // Fallback if snapshot estimates are not available
    const baseEps = ticker.eps && ticker.eps > 0 ? ticker.eps : currentPrice / Math.max(10, peTtm);
    const fallbackList = [];

    for (let i = 1; i <= 4; i++) {
      const yearStr = `${locale === 'es' ? 'Año' : 'Year'} ${currentYearNum + i}`;
      const epsTtm = baseEps * Math.pow(1.12, i);
      const epsFwd = baseEps * Math.pow(1.12, i + 1);
      fallbackList.push({
        year: yearStr,
        epsBaseTtm: parseFloat(epsTtm.toFixed(2)),
        epsBaseFwd: parseFloat(epsFwd.toFixed(2)),
      });
    }

    return fallbackList;
  }, [snapshot, ticker, currentPrice, peTtm, locale, currentYearNum]);

  // Baseline EPS
  const currentEps = ticker.eps && ticker.eps > 0 ? ticker.eps : (currentPrice / Math.max(1, peTtm));

  // Multi-Scenario Engine with Glide Path & CAGR Decomposition
  const scenarios = useMemo(() => {
    const totalHorizonYears = Math.max(4, rawProjections.length);

    const list = rawProjections.map((item) => {
      const yearMatch = item.year.match(/\b(20\d\d)\b/);
      const targetYearNum = yearMatch ? parseInt(yearMatch[1], 10) : currentYearNum + 1;
      const yearsDiff = Math.max(1, targetYearNum - currentYearNum);
      const decayRatio = Math.min(1, yearsDiff / totalHorizonYears);

      const peFutureTtm = modelMode === 'convergent'
        ? adjPeTtm - (adjPeTtm - terminalPe) * decayRatio
        : adjPeTtm;
      const adjEpsTtm = item.epsBaseTtm * (1 + epsVariancePct / 100);
      const projectedPriceTtm = adjEpsTtm * peFutureTtm;
      const usdChangeTtm = projectedPriceTtm - currentPrice;
      const returnTtm = (usdChangeTtm / currentPrice) * 100;
      const cagrTtm = (Math.pow(Math.max(0.001, projectedPriceTtm / currentPrice), 1 / yearsDiff) - 1) * 100;

      const cagrEpsTtm = (Math.pow(Math.max(0.001, adjEpsTtm / Math.max(0.01, currentEps)), 1 / yearsDiff) - 1) * 100;
      const cagrPeTtm = (Math.pow(Math.max(0.001, peFutureTtm / Math.max(0.01, peTtm)), 1 / yearsDiff) - 1) * 100;

      const peFutureFwd = modelMode === 'convergent'
        ? adjPeFwd - (adjPeFwd - terminalPe) * decayRatio
        : adjPeFwd;
      const adjEpsFwd = item.epsBaseFwd * (1 + epsVariancePct / 100);
      const projectedPriceFwd = adjEpsFwd * peFutureFwd;
      const usdChangeFwd = projectedPriceFwd - currentPrice;
      const returnFwd = (usdChangeFwd / currentPrice) * 100;
      const cagrFwd = (Math.pow(Math.max(0.001, projectedPriceFwd / currentPrice), 1 / yearsDiff) - 1) * 100;

      const cagrEpsFwd = (Math.pow(Math.max(0.001, adjEpsFwd / Math.max(0.01, currentEps)), 1 / yearsDiff) - 1) * 100;
      const cagrPeFwd = (Math.pow(Math.max(0.001, peFutureFwd / Math.max(0.01, peFwd)), 1 / yearsDiff) - 1) * 100;

      const peFutureMix = modelMode === 'convergent'
        ? adjPeMix - (adjPeMix - terminalPe) * decayRatio
        : adjPeMix;
      const epsMix = (item.epsBaseTtm + item.epsBaseFwd) / 2;
      const adjEpsMix = epsMix * (1 + epsVariancePct / 100);
      const projectedPriceMix = adjEpsMix * peFutureMix;
      const usdChangeMix = projectedPriceMix - currentPrice;
      const returnMix = (usdChangeMix / currentPrice) * 100;
      const cagrMix = (Math.pow(Math.max(0.001, projectedPriceMix / currentPrice), 1 / yearsDiff) - 1) * 100;

      const cagrEpsMix = (Math.pow(Math.max(0.001, adjEpsMix / Math.max(0.01, currentEps)), 1 / yearsDiff) - 1) * 100;
      const cagrPeMix = (Math.pow(Math.max(0.001, peFutureMix / Math.max(0.01, peMix)), 1 / yearsDiff) - 1) * 100;

      return {
        isBaseline: false,
        year: item.year,
        yearsDiff,
        epsBaseTtm: item.epsBaseTtm,
        adjEpsTtm,
        peFutureTtm,
        projectedPriceTtm,
        usdChangeTtm,
        returnTtm,
        cagrTtm,
        cagrEpsTtm,
        cagrPeTtm,

        adjEpsFwd,
        peFutureFwd,
        projectedPriceFwd,
        usdChangeFwd,
        returnFwd,
        cagrFwd,
        cagrEpsFwd,
        cagrPeFwd,

        adjEpsMix,
        peFutureMix,
        projectedPriceMix,
        usdChangeMix,
        returnMix,
        cagrMix,
        cagrEpsMix,
        cagrPeMix,
      };
    });

    const baselineRow = {
      isBaseline: true,
      year: locale === 'es' ? 'Actual (Hoy)' : 'Current (Today)',
      yearsDiff: 0,
      epsBaseTtm: currentEps,
      adjEpsTtm: currentEps,
      peFutureTtm: peTtm,
      projectedPriceTtm: currentPrice,
      usdChangeTtm: 0,
      returnTtm: 0,
      cagrTtm: 0,
      cagrEpsTtm: 0,
      cagrPeTtm: 0,

      adjEpsFwd: currentEps,
      peFutureFwd: peFwd,
      projectedPriceFwd: currentPrice,
      usdChangeFwd: 0,
      returnFwd: 0,
      cagrFwd: 0,
      cagrEpsFwd: 0,
      cagrPeFwd: 0,

      adjEpsMix: currentEps,
      peFutureMix: peMix,
      projectedPriceMix: currentPrice,
      usdChangeMix: 0,
      returnMix: 0,
      cagrMix: 0,
      cagrEpsMix: 0,
      cagrPeMix: 0,
    };

    return [baselineRow, ...list];
  }, [rawProjections, epsVariancePct, peVariancePct, adjPeTtm, adjPeFwd, adjPeMix, terminalPe, modelMode, currentPrice, currentYearNum, currentEps, peTtm, peFwd, peMix, locale]);

  const applyPreset = (epsVar: number, peVar: number) => {
    setEpsVariancePct(epsVar);
    setPeVariancePct(peVar);
  };

  const renderScenarioCell = (
    price: number,
    usdChange: number,
    returnPct: number,
    cagrTotal: number,
    cagrEps: number,
    cagrPe: number,
    peFuture: number,
    year: string,
    isBaseline: boolean,
    isRecommended: boolean = false
  ) => {
    if (isBaseline) {
      return (
        <td className={`p-3.5 text-right font-mono ${isRecommended ? 'bg-teal-500/5' : ''}`}>
          <div className="flex flex-col items-end">
            <span className="font-extrabold text-slate-300 text-sm">${price.toFixed(2)}</span>
            <span className="text-[10px] font-bold text-slate-500">Base</span>
          </div>
        </td>
      );
    }

    const isHighReturnWarning = cagrTotal > 25;
    const isSpeculativeWarning = cagrPe > 0 && cagrPe > cagrEps * 1.2;

    return (
      <td className={`p-3.5 text-right font-mono relative group cursor-help ${isRecommended ? 'bg-teal-500/5' : ''}`}>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1">
            {(isHighReturnWarning || isSpeculativeWarning) && (
              <AlertTriangle size={12} className="text-amber-400 animate-pulse" />
            )}
            <span className={`font-black ${isRecommended ? 'text-emerald-400 text-sm' : 'text-white font-bold'}`}>
              ${price.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] font-mono text-slate-400">
              ({peFuture.toFixed(1)}x)
            </span>
            <span className={`text-[10px] font-extrabold px-1 py-0.5 rounded border ${
              returnPct >= 0 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="absolute bottom-full right-0 mb-2 w-72 p-4 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-2xl z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-left">
          <div className="text-[10px] font-extrabold text-teal-400 uppercase border-b border-slate-800 pb-1 mb-2.5 flex justify-between items-center">
            <span>{locale === 'es' ? 'Desglose Proyección' : 'Forecast Breakdown'}</span>
            <span className="text-slate-300 font-sans">{year}</span>
          </div>

          <div className="flex flex-col gap-2.5 text-xs font-sans">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[11px]">{locale === 'es' ? 'Cambio Nominal USD:' : 'Nominal USD Change:'}</span>
              <span className={`font-mono font-extrabold ${usdChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {usdChange >= 0 ? `+$${usdChange.toFixed(2)}` : `-$${Math.abs(usdChange).toFixed(2)}`} USD
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[11px]">{locale === 'es' ? 'Rend. Acumulado %:' : 'Cumulative Return %:'}</span>
              <span className={`font-mono font-extrabold ${returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {returnPct >= 0 ? `+${returnPct.toFixed(1)}%` : `${returnPct.toFixed(1)}%`}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-bold text-[11px] flex items-center gap-1">
                  <TrendingUp size={11} className="text-emerald-400" />
                  {locale === 'es' ? 'CAGR por EPS (Fundamentales):' : 'CAGR from EPS (Fundamentals):'}
                </span>
                <span className={`font-mono font-bold ${cagrEps >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {cagrEps >= 0 ? `+${cagrEps.toFixed(2)}%` : `${cagrEps.toFixed(2)}%`}/año
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-bold text-[11px] flex items-center gap-1">
                  <ArrowRightLeft size={11} className="text-purple-400" />
                  {locale === 'es' ? 'CAGR por Múltiplo (Re-Rating):' : 'CAGR from P/E (Re-Rating):'}
                </span>
                <span className={`font-mono font-bold ${cagrPe >= 0 ? 'text-purple-400' : 'text-rose-400'}`}>
                  {cagrPe >= 0 ? `+${cagrPe.toFixed(2)}%` : `${cagrPe.toFixed(2)}%`}/año
                </span>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                <span className="text-teal-300 font-extrabold text-[11px]">{locale === 'es' ? 'CAGR Total Proyectado:' : 'Total Projected CAGR:'}</span>
                <span className={`font-mono font-black text-sm ${cagrTotal >= 0 ? 'text-teal-300' : 'text-rose-400'}`}>
                  {cagrTotal >= 0 ? `+${cagrTotal.toFixed(2)}%` : `${cagrTotal.toFixed(2)}%`}/año
                </span>
              </div>
            </div>

            {(isHighReturnWarning || isSpeculativeWarning) && (
              <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 flex items-start gap-1.5 leading-tight">
                <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold block">
                    {locale === 'es' ? '⚠️ Sanity Warning:' : '⚠️ Sanity Warning:'}
                  </span>
                  {isHighReturnWarning && (
                    <span>
                      {locale === 'es' 
                        ? 'Retorno >25% anual muy elevado. Verifica que el re-rating de múltiplo sea sostenible.' 
                        : 'CAGR >25% is very high. Verify multiple re-rating sustainability.'}
                    </span>
                  )}
                  {isSpeculativeWarning && !isHighReturnWarning && (
                    <span>
                      {locale === 'es' 
                        ? 'El retorno depende mayoritariamente de especulación de múltiplos en lugar de crecimiento fundamental de utilidades.' 
                        : 'Return depends mostly on multiple expansion rather than fundamental EPS growth.'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    );
  };

  // VISTA DE BLOQUEO PARA USUARIOS SIN ACCESO (FREE USER O NO LOGUEADOS)
  if (!hasAccess) {
    return (
      <>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-8 shadow-2xl backdrop-blur-xl">
          {/* Background Glow Effects */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center text-center max-w-xl mx-auto py-6 gap-5">
            {/* Lock Badge */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-lg shadow-amber-500/10">
              <Crown size={32} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                {locale === 'es' ? 'Característica Exclusiva Premium' : 'Exclusive Premium Feature'}
              </span>
              <h3 className="text-2xl font-extrabold text-white tracking-tight">
                {locale === 'es' ? 'Calculadora de Proyección de Valoración' : 'Valuation Projection Calculator'}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {locale === 'es'
                  ? 'Accede a nuestro motor de proyecciones dinámicas de 3 vías (TTM, Forward y Mix). Simula variaciones de EPS, P/E terminal y trayectorias de convergencia en tiempo real.'
                  : 'Unlock our dynamic 3-way projection engine (TTM, Forward & Mix). Stress-test EPS variance, terminal P/E decay, and real-time CAGR sensitivity.'}
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full my-2 text-left">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sliders size={14} className="text-teal-400" />
                  {locale === 'es' ? 'Sliders Interactivos' : 'Interactive Sliders'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Ajusta varianzas de utilidades y múltiplos' : 'Adjust earnings & multiple variances'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <TrendingDown size={14} className="text-amber-400" />
                  {locale === 'es' ? 'Modelo Glide Path' : 'Glide Path Model'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Convergencia hacia el P/E del Sector' : 'Sector P/E convergence model'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ArrowRightLeft size={14} className="text-purple-400" />
                  {locale === 'es' ? 'Desglose CAGR' : 'CAGR Decomposition'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Diferencia retornos fundamentales de especulativos' : 'Separate fundamental vs multiple return'}
                </span>
              </div>
            </div>

            {/* Call to Action Button UPGRADE */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full mt-2">
              {!user ? (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-teal-400 to-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider hover:opacity-90 transition shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn size={16} />
                  <span>{locale === 'es' ? 'Iniciar Sesión para Obtener Premium' : 'Sign In to Access Premium'}</span>
                </button>
              ) : (
                <button
                  onClick={() => alert(locale === 'es' ? 'Ponte en contacto con administración o actualiza a plan Premium para habilitar acceso.' : 'Contact admin or upgrade your account to Premium.')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-widest hover:brightness-110 transition shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Crown size={16} />
                  <span>{locale === 'es' ? 'UPGRADE A PREMIUM USER' : 'UPGRADE TO PREMIUM USER'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // VISTA COMPLETA (ADMIN & PRO_USER)
  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-900">
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

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          <button
            onClick={() => setModelMode('convergent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
              modelMode === 'convergent'
                ? 'bg-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingDown size={13} />
            {locale === 'es' ? 'Modelo Convergente (Glide Path)' : 'Convergent Model (Glide Path)'}
          </button>
          <button
            onClick={() => setModelMode('standard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
              modelMode === 'standard'
                ? 'bg-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders size={13} />
            {locale === 'es' ? 'Modelo Estándar (P/E Fijo)' : 'Standard Model (Fixed P/E)'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-slate-900/30 p-4 rounded-xl border border-slate-900">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-900/80">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              {locale === 'es' ? 'Ajustes Rápidos de Varianza:' : 'Quick Variance Presets:'}
            </span>
            <div className="flex items-center gap-2">
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

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Sliders size={13} className="text-teal-400" />
                {locale === 'es' ? 'Varianza en Múltiplo P/E Base:' : 'Base P/E Variance:'}
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

        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t lg:border-t-0 lg:border-l border-slate-900 pt-3 lg:pt-0 lg:pl-4 text-center">
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

          <div className="p-2 rounded-lg border border-purple-500/30 bg-purple-500/10 flex flex-col justify-center items-center">
            <span className="text-[9px] text-purple-300 uppercase font-black tracking-tighter" title="P/E Terminal al que convergerá la acción">
              {locale === 'es' ? 'P/E TERMINAL' : 'TERMINAL P/E'}
            </span>
            <div className="flex items-center gap-0.5 mt-0.5">
              <input
                type="number"
                step="0.5"
                min="5"
                max="100"
                value={terminalPe}
                onChange={(e) => setTerminalPe(Math.max(5, Number(e.target.value)))}
                className="w-12 text-center text-xs font-black text-white font-mono bg-slate-900 border border-purple-500/40 rounded py-0.5 focus:outline-none focus:border-purple-400"
              />
              <span className="text-xs font-bold text-purple-300 font-mono">x</span>
            </div>
            <span className="text-[9px] text-purple-300/80 font-mono font-semibold truncate max-w-[70px]" title={ticker.sector || ''}>
              {ticker.sector || 'Sector'}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
            <tr>
              <th className="p-3.5 pl-4 min-w-[140px]">{locale === 'es' ? 'Año' : 'Year'}</th>
              <th className="p-3.5 text-right w-28">{locale === 'es' ? 'EPS Ajustado' : 'Adj. EPS'}</th>
              <th className="p-3.5 text-right">{locale === 'es' ? 'Escenario TTM' : 'TTM Scenario'}</th>
              <th className="p-3.5 text-right">{locale === 'es' ? 'Escenario Forward' : 'Forward Scenario'}</th>
              <th className="p-3.5 text-right font-black text-teal-300">{locale === 'es' ? 'Escenario Mix (Recomendado)' : 'Mix Scenario (Recommended)'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 font-mono">
            {scenarios.map((sc, idx) => (
              <tr 
                key={idx} 
                className={`transition-colors ${
                  sc.isBaseline 
                    ? 'bg-slate-900/60 font-extrabold border-b-2 border-slate-800' 
                    : 'hover:bg-slate-900/30'
                }`}
              >
                <td className="p-3.5 pl-4 font-sans font-extrabold text-white flex items-center gap-1.5">
                  <span className={sc.isBaseline ? 'text-teal-400 font-black' : ''}>{sc.year}</span>
                  {sc.isBaseline && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20 font-mono uppercase">
                      {locale === 'es' ? 'Base' : 'Baseline'}
                    </span>
                  )}
                </td>
                
                <td className="p-3.5 text-right font-bold text-slate-300">
                  ${sc.adjEpsTtm.toFixed(2)}
                </td>

                {renderScenarioCell(
                  sc.projectedPriceTtm,
                  sc.usdChangeTtm,
                  sc.returnTtm,
                  sc.cagrTtm,
                  sc.cagrEpsTtm,
                  sc.cagrPeTtm,
                  sc.peFutureTtm,
                  sc.year,
                  sc.isBaseline,
                  false
                )}

                {renderScenarioCell(
                  sc.projectedPriceFwd,
                  sc.usdChangeFwd,
                  sc.returnFwd,
                  sc.cagrFwd,
                  sc.cagrEpsFwd,
                  sc.cagrPeFwd,
                  sc.peFutureFwd,
                  sc.year,
                  sc.isBaseline,
                  false
                )}

                {renderScenarioCell(
                  sc.projectedPriceMix,
                  sc.usdChangeMix,
                  sc.returnMix,
                  sc.cagrMix,
                  sc.cagrEpsMix,
                  sc.cagrPeMix,
                  sc.peFutureMix,
                  sc.year,
                  sc.isBaseline,
                  true
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
