'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MarginDebtRecord, MarginDebtRiskSummary } from '@/services/api';
import { AlertTriangle, TrendingUp, TrendingDown, Info, ShieldAlert, Activity, DollarSign, Eye, EyeOff, LineChart as ChartIcon } from 'lucide-react';
import { createChart, ColorType, IChartApi, LineSeries } from 'lightweight-charts';

interface Props {
  summary: MarginDebtRiskSummary | null;
  history: MarginDebtRecord[];
  locale?: string;
}

function RiskScoreTooltip({ row, idx, getRiskBadgeColor, formatDate }: { row: MarginDebtRecord; idx: number; getRiskBadgeColor: (l?: string) => string; formatDate: (d?: string) => string }) {
  const [isOpen, setIsOpen] = useState(false);

  const ratio = row.marginDebtRatio ?? 0;
  const yoy = row.marginDebtYoY ?? 0;
  const div = row.divergence ?? 0;
  const net = row.netCreditBalance ?? 0;
  const debit = row.debitBalances || 1;
  const d = new Date(row.date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  // Helper for continuous linear interpolation
  const interpScore = (val: number, anchors: [number, number][]) => {
    if (val <= anchors[0][0]) return anchors[0][1];
    if (val >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [x1, y1] = anchors[i];
      const [x2, y2] = anchors[i + 1];
      if (val >= x1 && val <= x2) {
        return y1 + (val - x1) * (y2 - y1) / (x2 - x1);
      }
    }
    return 50;
  };

  // Component 1 (30%): Normalized Debt percentile approximation
  const c1Score = interpScore(ratio, [[1.0, 20], [1.8, 50], [2.4, 75], [2.8, 95], [3.2, 100]]);
  
  // Component 2 (25%): YoY Growth continuous
  const c2Score = interpScore(yoy, [[-20, 10], [0, 50], [20, 75], [40, 95], [60, 100]]);

  // Component 3 (20%): Divergence continuous
  const c3Score = interpScore(div, [[-15, 15], [-10, 20], [0, 40], [10, 65], [25, 90], [35, 100]]);

  // Component 4 (15%): Net Credit Deficit ratio
  const deficitRatio = net < 0 ? (Math.abs(net) / debit) * 100 : 0;
  const c4Score = net < 0 ? interpScore(deficitRatio, [[0, 20], [20, 50], [40, 75], [70, 100]]) : 20;

  // Component 5 (10%): Cost of Leverage (Interest Rate + spread)
  let approxFedRate = 3.0;
  if (year < 2004) approxFedRate = 5.5;
  else if (year >= 2004 && year < 2007) approxFedRate = 2.5 + (year - 2004) * 1.2;
  else if (year === 2007) approxFedRate = 5.0;
  else if (year === 2008) approxFedRate = Math.max(0.25, 3.0 - month / 4);
  else if (year >= 2009 && year <= 2015) approxFedRate = 0.25;
  else if (year >= 2016 && year < 2019) approxFedRate = 1.0 + (year - 2016) * 0.75;
  else if (year === 2019) approxFedRate = 2.0;
  else if (year === 2020 || year === 2021) approxFedRate = 0.25;
  else if (year === 2022) approxFedRate = 0.25 + (month / 12) * 4.0;
  else if (year === 2023) approxFedRate = 4.5 + Math.min(1.0, month / 8);
  else if (year === 2024) approxFedRate = 5.25 - (month > 9 ? 0.75 : 0);
  else if (year === 2025) approxFedRate = 4.5;
  else approxFedRate = 4.25;

  const marginRate = approxFedRate + 1.75;
  const c5Score = interpScore(marginRate, [[3, 20], [5, 50], [7, 75], [9, 100]]);

  const p1 = (c1Score * 0.30).toFixed(1);
  const p2 = (c2Score * 0.25).toFixed(1);
  const p3 = (c3Score * 0.20).toFixed(1);
  const p4 = (c4Score * 0.15).toFixed(1);
  const p5 = (c5Score * 0.10).toFixed(1);

  return (
    <div 
      className="inline-block relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen(!isOpen)}
    >
      <span className={`px-2 py-0.5 rounded font-bold text-[10px] cursor-pointer inline-flex items-center gap-1 transition-transform hover:scale-105 ${getRiskBadgeColor(row.riskLevel)}`}>
        {row.riskScore}
        <Info size={10} className="opacity-70" />
      </span>

      {isOpen && (
        <div className={`absolute right-0 ${idx < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} z-50 w-72 p-3 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-xl text-left font-sans animate-in fade-in zoom-in-95 duration-150`}>
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">Desglose v2 ({formatDate(row.date)})</span>
            <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${getRiskBadgeColor(row.riskLevel)}`}>
              {row.riskScore}/100
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-[10px] font-mono">
            <div className="flex justify-between items-center text-slate-300">
              <span>1. Deuda/SP500 (30%):</span>
              <span className="font-bold text-sky-400">{Math.round(c1Score)} pts (+{p1})</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>2. Crecimiento YoY (25%):</span>
              <span className="font-bold text-amber-400">{Math.round(c2Score)} pts (+{p2})</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>3. Divergencia (20%):</span>
              <span className="font-bold text-purple-400">{Math.round(c3Score)} pts (+{p3})</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>4. Saldo Neto (15%):</span>
              <span className="font-bold text-red-400">{Math.round(c4Score)} pts (+{p4})</span>
            </div>
            <div className="flex justify-between items-center text-slate-300" title={`Tasa de margen est. ${marginRate.toFixed(1)}%`}>
              <span>5. Costo Apalancamiento ({marginRate.toFixed(1)}% / 10%):</span>
              <span className="font-bold text-teal-400">{Math.round(c5Score)} pts (+{p5})</span>
            </div>
            <div className="pt-1.5 mt-1 border-t border-slate-800 flex justify-between font-bold text-white text-[11px]">
              <span>Score Ponderado Total:</span>
              <span className="text-amber-400">{row.riskScore} pts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarginDebtPanel({ summary: initialSummary, history: initialHistory, locale = 'es' }: Props) {
  const [selectedRange, setSelectedRange] = useState<number>(60);
  
  // Toggles for chart series
  const [showDebitBalances, setShowDebitBalances] = useState(true);
  const [showSp500Price, setShowSp500Price] = useState(true);
  const [showMarginCurrencyRatio, setShowMarginCurrencyRatio] = useState(true);
  const [showMarginDebtRatio, setShowMarginDebtRatio] = useState(true);
  const [showRiskScore, setShowRiskScore] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Raw history directly from backend database if available, otherwise mock preview
  const history: MarginDebtRecord[] = initialHistory && initialHistory.length > 0 ? initialHistory : [
    { id: '1', date: '2026-06-30', debitBalances: 1502072, freeCreditCash: 217441, freeCreditMargin: 223412, netCreditBalance: -1061219, sp500Price: 746.77, marginCurrencyRatio: 61.06, marginDebtRatio: 2.12, marginDebtYoY: 49.02, sp500YoY: 20.87, divergence: 28.15, riskScore: 87, riskLevel: 'CRITICAL', source: 'FINRA', createdAt: '', updatedAt: '' },
    { id: '2', date: '2026-05-31', debitBalances: 1415557, freeCreditCash: 206600, freeCreditMargin: 217256, netCreditBalance: -991701, sp500Price: 730.12, marginCurrencyRatio: 57.54, marginDebtRatio: 2.04, marginDebtYoY: 40.44, sp500YoY: 18.50, divergence: 21.94, riskScore: 81, riskLevel: 'CRITICAL', source: 'FINRA', createdAt: '', updatedAt: '' },
    { id: '3', date: '2026-04-30', debitBalances: 1304281, freeCreditCash: 217836, freeCreditMargin: 215445, netCreditBalance: -871000, sp500Price: 710.05, marginCurrencyRatio: 53.02, marginDebtRatio: 1.93, marginDebtYoY: 32.10, sp500YoY: 15.20, divergence: 16.90, riskScore: 74, riskLevel: 'HIGH', source: 'FINRA', createdAt: '', updatedAt: '' },
    { id: '4', date: '2026-03-31', debitBalances: 1220922, freeCreditCash: 221860, freeCreditMargin: 205600, netCreditBalance: -793462, sp500Price: 695.40, marginCurrencyRatio: 49.63, marginDebtRatio: 1.85, marginDebtYoY: 25.40, sp500YoY: 12.80, divergence: 12.60, riskScore: 65, riskLevel: 'HIGH', source: 'FINRA', createdAt: '', updatedAt: '' },
    { id: '5', date: '2026-02-28', debitBalances: 1253192, freeCreditCash: 205060, freeCreditMargin: 200047, netCreditBalance: -848085, sp500Price: 680.15, marginCurrencyRatio: 50.94, marginDebtRatio: 1.94, marginDebtYoY: 28.90, sp500YoY: 14.10, divergence: 14.80, riskScore: 68, riskLevel: 'HIGH', source: 'FINRA', createdAt: '', updatedAt: '' },
    { id: '6', date: '2026-01-31', debitBalances: 1279042, freeCreditCash: 203700, freeCreditMargin: 196911, netCreditBalance: -878431, sp500Price: 675.20, marginCurrencyRatio: 51.99, marginDebtRatio: 1.99, marginDebtYoY: 30.15, sp500YoY: 13.90, divergence: 16.25, riskScore: 71, riskLevel: 'HIGH', source: 'FINRA', createdAt: '', updatedAt: '' },
  ];

  const summary: MarginDebtRiskSummary = initialSummary || {
    latestDate: history[history.length - 1]?.date || '2026-06-30',
    debitBalances: history[history.length - 1]?.debitBalances || 1502072,
    freeCreditCash: history[history.length - 1]?.freeCreditCash || 217441,
    freeCreditMargin: history[history.length - 1]?.freeCreditMargin || 223412,
    netCreditBalance: history[history.length - 1]?.netCreditBalance || -1061219,
    sp500Price: history[history.length - 1]?.sp500Price || 746.77,
    marginCurrencyRatio: history[history.length - 1]?.marginCurrencyRatio || 61.06,
    marginDebtRatio: history[history.length - 1]?.marginDebtRatio || 2.23,
    marginDebtYoY: history[history.length - 1]?.marginDebtYoY || 49.02,
    sp500YoY: history[history.length - 1]?.sp500YoY || 20.87,
    divergence: history[history.length - 1]?.divergence || 28.15,
    riskScore: history[history.length - 1]?.riskScore || 100,
    riskLevel: (history[history.length - 1]?.riskLevel as any) || 'CRITICAL',
    debitChangeMoM: 6.1,
    source: 'FINRA',
  };

  const filteredHistory = history.slice(-selectedRange);

  // Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 340,
      rightPriceScale: {
        visible: true,
        borderColor: '#334155',
      },
      leftPriceScale: {
        visible: true,
        borderColor: '#334155',
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    const sortedHistory = [...history]
      .filter(h => h.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const uniqueDataMap = new Map();
    sortedHistory.forEach(h => {
      const timeStr = h.date.substring(0, 10);
      uniqueDataMap.set(timeStr, h);
    });
    const cleanHistory = Array.from(uniqueDataMap.values());

    // Series 1: Margin Debt en Billones USD (Scale Left)
    let debitSeries: any = null;
    if (showDebitBalances) {
      debitSeries = chart.addSeries(LineSeries, {
        color: '#38bdf8', // Sky blue
        lineWidth: 2,
        title: locale === 'es' ? 'Margin Debt ($B)' : 'Margin Debt ($B)',
        priceScaleId: 'left',
      });
      const data = cleanHistory
        .map(h => ({
          time: h.date.substring(0, 10),
          value: Number((h.debitBalances / 1000).toFixed(2)), // Convert to Billions
        }))
        .filter(d => !isNaN(d.value) && d.time);
      debitSeries.setData(data);
    }

    // Series 2: S&P 500 Index (SPY × 10 ≈ S&P 500 level, Scale Left)
    let sp500PriceSeries: any = null;
    if (showSp500Price) {
      sp500PriceSeries = chart.addSeries(LineSeries, {
        color: '#a855f7', // Purple / Violet
        lineWidth: 2,
        title: 'S&P 500 (~pts)',
        priceScaleId: 'left',
      });
      const data = cleanHistory
        .map(h => ({
          time: h.date.substring(0, 10),
          // SPY × 10 approximates the S&P 500 index level (SPY ≈ index/10)
          value: h.sp500Price ? Number((h.sp500Price * 10).toFixed(0)) : 0,
        }))
        .filter(d => d.value > 0 && d.time);
      sp500PriceSeries.setData(data);
    }

    // Series 3: % vs Currency (Scale Right)
    let currencySeries: any = null;
    if (showMarginCurrencyRatio) {
      currencySeries = chart.addSeries(LineSeries, {
        color: '#2dd4bf', // Teal
        lineWidth: 2,
        title: '% vs Dinero',
        priceScaleId: 'right',
      });
      const data = cleanHistory
        .map(h => ({
          time: h.date.substring(0, 10),
          value: (h as any).marginCurrencyRatio || 0,
        }))
        .filter(d => d.value > 0 && d.time);
      currencySeries.setData(data);
    }

    // Series 4: Margin Debt as % of SP500 Market Cap (Scale Right)
    // Values range ~1.5% (low/normal) to ~3%+ (extreme/critical)
    let sp500RatioSeries: any = null;
    if (showMarginDebtRatio) {
      sp500RatioSeries = chart.addSeries(LineSeries, {
        color: '#f43f5e', // Rose / Red
        lineWidth: 2,
        title: '% del SP500 MktCap',
        priceScaleId: 'right',
      });
      const data = cleanHistory
        .map(h => ({
          time: h.date.substring(0, 10),
          value: h.marginDebtRatio != null ? h.marginDebtRatio : 0,
        }))
        .filter(d => d.value > 0 && d.time);
      sp500RatioSeries.setData(data);
    }

    // Series 5: Risk Score (Scale Right)
    let riskSeries: any = null;
    if (showRiskScore) {
      riskSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24', // Amber
        lineWidth: 1,
        title: 'Score de Riesgo',
        priceScaleId: 'right',
      });
      const data = cleanHistory
        .map(h => ({
          time: h.date.substring(0, 10),
          value: h.riskScore || 0,
        }))
        .filter(d => d.time);
      riskSeries.setData(data);
    }

    // Separate effect to handle range zoom without recreating the chart or series
    if (history.length > 0 && chartRef.current) {
      const fromIndex = Math.max(0, history.length - selectedRange);
      const fromDate = history[fromIndex]?.date.substring(0, 10);
      const toDate = history[history.length - 1]?.date.substring(0, 10);
      if (fromDate && toDate) {
        chartRef.current.timeScale().setVisibleRange({
          from: fromDate as any,
          to: toDate as any,
        });
      }
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [history, showDebitBalances, showSp500Price, showMarginCurrencyRatio, showMarginDebtRatio, showRiskScore, locale]);

  // Separate effect to update visible range when selectedRange changes
  useEffect(() => {
    if (chartRef.current && history.length > 0) {
      const fromIndex = Math.max(0, history.length - selectedRange);
      const fromDate = history[fromIndex]?.date.substring(0, 10);
      const toDate = history[history.length - 1]?.date.substring(0, 10);
      if (fromDate && toDate) {
        chartRef.current.timeScale().setVisibleRange({
          from: fromDate as any,
          to: toDate as any,
        });
      }
    }
  }, [selectedRange, history]);

  const getRiskBadgeColor = (level?: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'MODERATE':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
  };

  const formatMoney = (val?: number) => {
    if (val === undefined || val === null) return 'N/A';
    return `$${(val / 1000).toFixed(1)}B`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 backdrop-blur-md shadow-xl">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={20} className="text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              {locale === 'es' ? 'FINRA Margin Debt & Modelo de Riesgo Macro' : 'FINRA Margin Debt & Macro Risk Model'}
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            {locale === 'es' 
              ? 'Nivel de endeudamiento para compra de acciones reportado mensualmente por FINRA. Alta apalancamiento indica exuberancia especulativa.'
              : 'Margin borrowing levels reported monthly by FINRA. High leverage indicates speculative exuberance.'}
          </p>
        </div>

        {/* Risk Score Pill */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {locale === 'es' ? 'Score de Riesgo' : 'Risk Score'}
            </span>
            <span className="text-2xl font-black text-white">{summary.riskScore}/100</span>
          </div>

          <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${getRiskBadgeColor(summary.riskLevel)}`}>
            <AlertTriangle size={14} />
            {summary.riskLevel}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <DollarSign size={12} />
            Margin Debt ({formatDate(summary.latestDate || (summary as any).date)})
          </span>
          <span className="text-xl font-bold text-white">{formatMoney(summary.debitBalances)}</span>
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            {summary.debitChangeMoM && summary.debitChangeMoM >= 0 ? (
              <span className="text-amber-400 flex items-center gap-0.5"><TrendingUp size={12} />+{summary.debitChangeMoM}% MoM</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-0.5"><TrendingDown size={12} />{summary.debitChangeMoM}% MoM</span>
            )}
          </span>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Activity size={12} />
            Crecimiento YoY
          </span>
          <span className={`text-xl font-bold ${summary.marginDebtYoY && summary.marginDebtYoY > 20 ? 'text-amber-400' : 'text-white'}`}>
            {summary.marginDebtYoY !== null && summary.marginDebtYoY !== undefined ? `${summary.marginDebtYoY > 0 ? '+' : ''}${summary.marginDebtYoY}%` : 'N/A'}
          </span>
          <span className="text-[11px] text-slate-400">vs SP500 YoY ({summary.sp500YoY}% )</span>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Info size={12} />
            Net Credit Balance
          </span>
          <span className={`text-xl font-bold ${summary.netCreditBalance && summary.netCreditBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatMoney(summary.netCreditBalance)}
          </span>
          <span className="text-[11px] text-slate-400">Cash + Margin - Debit</span>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <TrendingUp size={12} />
            Divergencia Speculativa
          </span>
          <span className={`text-xl font-bold ${summary.divergence && summary.divergence > 15 ? 'text-red-400' : 'text-teal-400'}`}>
            {summary.divergence !== null && summary.divergence !== undefined ? `${summary.divergence > 0 ? '+' : ''}${summary.divergence}%` : 'N/A'}
          </span>
          <span className="text-[11px] text-slate-400">Apalancamiento excesivo vs mercado</span>
        </div>

      </div>

      {/* Chart Section */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <ChartIcon size={16} className="text-teal-400" />
            <span className="text-sm font-semibold text-white">
              {locale === 'es' ? 'Evolución Histórica de Margin Rate & Apalancamiento' : 'Historical Evolution of Margin Rate & Leverage'}
            </span>
          </div>

          {/* Range Selector & Series Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggles */}
            <button
              onClick={() => setShowDebitBalances(!showDebitBalances)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showDebitBalances ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60'
              }`}
            >
              {showDebitBalances ? <Eye size={12} /> : <EyeOff size={12} />}
              Margin Debt ($B)
            </button>

            <button
              onClick={() => setShowSp500Price(!showSp500Price)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showSp500Price ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60'
              }`}
            >
              {showSp500Price ? <Eye size={12} /> : <EyeOff size={12} />}
              S&P 500 (Pts)
            </button>

            <button
              onClick={() => setShowMarginCurrencyRatio(!showMarginCurrencyRatio)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showMarginCurrencyRatio ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60'
              }`}
            >
              {showMarginCurrencyRatio ? <Eye size={12} /> : <EyeOff size={12} />}
              % vs Dinero
            </button>

            <button
              onClick={() => setShowMarginDebtRatio(!showMarginDebtRatio)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showMarginDebtRatio ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60'
              }`}
            >
              {showMarginDebtRatio ? <Eye size={12} /> : <EyeOff size={12} />}
              % del SP500
            </button>

            <button
              onClick={() => setShowRiskScore(!showRiskScore)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showRiskScore ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60'
              }`}
            >
              {showRiskScore ? <Eye size={12} /> : <EyeOff size={12} />}
              Risk Score
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

            <div className="flex gap-1">
              {[24, 60, 120, 360].map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedRange(m)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                    selectedRange === m
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {m / 12}{locale === 'es' ? 'A' : 'Y'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={chartContainerRef} className="w-full h-[340px] relative" />
      </div>

      {/* Historical Data Table */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-400 font-medium">
          {locale === 'es' ? `Mostrando ${filteredHistory.length} registros históricos` : `Showing ${filteredHistory.length} historical records`}
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 custom-scrollbar">
        <table className="w-full text-xs text-left text-slate-300">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px] z-20">
            <tr>
              <th className="py-2.5 px-3">Fecha</th>
              <th className="py-2.5 px-3">Margin Debt ($M)</th>
              <th className="py-2.5 px-3">Net Credit ($M)</th>
              <th className="py-2.5 px-3 text-teal-400" title="Margin Debt como % del dinero en circulación (Currency in Circulation — FRED MBCURRCIR en billones USD)">
                % del Dinero
              </th>
              <th className="py-2.5 px-3 text-purple-400" title="Nivel del índice S&P 500 (~puntos)">
                S&P 500 Index
              </th>
              <th className="py-2.5 px-3 text-rose-400" title="Margin Debt como % de la capitalización de mercado del S&P 500. Normal: <2% | Elevado: 2-2.5% | Crítico: >2.5%">
                % del SP500
              </th>
              <th className="py-2.5 px-3">Margin YoY</th>
              <th className="py-2.5 px-3">SP500 YoY</th>
              <th className="py-2.5 px-3">Divergencia</th>
              <th className="py-2.5 px-3 text-right">Risk Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            {[...filteredHistory].reverse().map((row, idx) => {
              const ratio = row.marginDebtRatio ?? 0;
              const yoy = row.marginDebtYoY ?? 0;
              const div = row.divergence ?? 0;
              const net = row.netCreditBalance ?? 0;
              const debit = row.debitBalances || 1;

              const c1Score = Math.min(100, Math.max(10, Math.round((ratio / 2.8) * 100)));
              const c2Score = yoy > 40 ? 95 : yoy > 20 ? 75 : yoy > 0 ? 50 : 20;
              const c3Score = div > 25 ? 90 : div > 10 ? 65 : div > 0 ? 40 : 20;
              const c4Score = net < 0 ? Math.min(100, Math.round((Math.abs(net) / debit) * 120)) : 20;
              const c5Score = 65;

              return (
                <tr key={row.id || row.date} className="hover:bg-slate-800/40 transition-colors group relative">
                  <td className="py-2 px-3 font-semibold text-white">{formatDate(row.date)}</td>
                  <td className="py-2 px-3">${row.debitBalances.toLocaleString()}M</td>
                  <td className={`py-2 px-3 ${row.netCreditBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    ${row.netCreditBalance.toLocaleString()}M
                  </td>
                  <td className="py-2 px-3 text-teal-300 font-medium">
                    {(row as any).marginCurrencyRatio != null ? `${(row as any).marginCurrencyRatio}%` : '-'}
                  </td>
                  <td className="py-2 px-3 text-purple-300 font-semibold">
                    {row.sp500Price ? `${Math.round(row.sp500Price * 10).toLocaleString()} pts` : '-'}
                  </td>
                  <td className={`py-2 px-3 font-medium ${
                    row.marginDebtRatio != null && row.marginDebtRatio > 2.5 ? 'text-red-400 font-bold' :
                    row.marginDebtRatio != null && row.marginDebtRatio > 2.0 ? 'text-amber-400' : 'text-sky-300'
                  }`}>
                    {row.marginDebtRatio != null ? `${row.marginDebtRatio}%` : '-'}
                  </td>
                  <td className="py-2 px-3">{row.marginDebtYoY !== null ? `${row.marginDebtYoY > 0 ? '+' : ''}${row.marginDebtYoY}%` : '-'}</td>
                  <td className="py-2 px-3">{row.sp500YoY !== null ? `${row.sp500YoY > 0 ? '+' : ''}${row.sp500YoY}%` : '-'}</td>
                  <td className={`py-2 px-3 ${row.divergence && row.divergence > 15 ? 'text-amber-400 font-bold' : ''}`}>
                    {row.divergence !== null ? `${row.divergence > 0 ? '+' : ''}${row.divergence}%` : '-'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <RiskScoreTooltip row={row} idx={idx} getRiskBadgeColor={getRiskBadgeColor} formatDate={formatDate} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
