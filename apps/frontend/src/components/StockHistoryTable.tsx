'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Layers, Clock, ArrowLeftRight, Database, TrendingUp } from 'lucide-react';
import { HistoricalPrice, Ticker } from '@/services/api';
import { useLocale } from 'next-intl';

interface StockHistoryTableProps {
  prices: HistoricalPrice[];
  ticker: Ticker;
}

type PeriodTab = 'daily' | 'monthly' | 'annual';

export const StockHistoryTable: React.FC<StockHistoryTableProps> = ({ prices, ticker }) => {
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<PeriodTab>('annual');
  
  // Infinite scroll limit state
  const [visibleCount, setVisibleCount] = useState(15);
  const observerRef = useRef<HTMLTableRowElement | null>(null);

  const baseIndex = ticker.buyHoldIndex;

  const isFund = useMemo(() => {
    const s = String(ticker.sector || '').toLowerCase();
    return s === 'index' || s === 'etf' || s.includes('etf');
  }, [ticker.sector]);

  // Helper to parse market cap string (e.g. 3.2T -> 3.2e12)
  const parsedCurrentCap = useMemo(() => {
    const capStr = ticker.cap || '0';
    const num = parseFloat(capStr);
    if (capStr.toUpperCase().includes('T')) return num * 1e12;
    if (capStr.toUpperCase().includes('B')) return num * 1e9;
    if (capStr.toUpperCase().includes('M')) return num * 1e6;
    return num;
  }, [ticker.cap]);

  // Helper to format market cap values back to strings (e.g. 3.20T)
  const formatMarketCap = (num: number) => {
    if (num === 0) return 'N/A';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  };

  // Calculate average price of the series to use for deviation index calculation
  const averagePrice = useMemo(() => {
    if (prices.length === 0) return 1;
    const sum = prices.reduce((acc, p) => acc + p.close, 0);
    return sum / prices.length;
  }, [prices]);

  // Dynamic rating calculator based on price deviation from series average
  const calculateHistoricalRating = (close: number) => {
    const ratio = close / averagePrice;
    let deviation = 0;
    if (ratio > 1) {
      deviation = Math.min(12, (ratio - 1) * 25);
    } else {
      deviation = Math.max(-12, (ratio - 1) * 25);
    }
    const score = Math.max(15, Math.min(98, Math.round(baseIndex + deviation)));
    
    let recommendation = 'Hold';
    let badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (score >= 85) {
      recommendation = locale === 'es' ? 'Compra Fuerte' : 'Strong Buy';
      badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (score >= 75) {
      recommendation = locale === 'es' ? 'Comprar' : 'Buy';
      badgeClass = 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    } else if (score >= 45) {
      recommendation = locale === 'es' ? 'Mantener' : 'Hold';
      badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    } else if (score >= 30) {
      recommendation = locale === 'es' ? 'Vender' : 'Sell';
      badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else {
      recommendation = locale === 'es' ? 'Venta Fuerte' : 'Strong Sell';
      badgeClass = 'bg-red-500/10 text-red-400 border-red-500/30';
    }

    return { score, recommendation, badgeClass };
  };

  // Group data by Month
  const monthlyData = useMemo(() => {
    const groups: { [key: string]: HistoricalPrice[] } = {};
    
    prices.forEach((p) => {
      const d = new Date(p.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) // Newest month first
      .map((key) => {
        const list = groups[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const open = list[0].open;
        const close = list[list.length - 1].close;
        const adjClose = list[list.length - 1].adjClose;
        const high = Math.max(...list.map((l) => l.high));
        const low = Math.min(...list.map((l) => l.low));
        const volume = list.reduce((acc, l) => acc + l.volume, 0);

        return {
          dateLabel: key,
          open,
          high,
          low,
          close,
          adjClose,
          volume,
        };
      });
  }, [prices]);

  // Group data by Year
  const annualData = useMemo(() => {
    const groups: { [key: string]: HistoricalPrice[] } = {};
    
    prices.forEach((p) => {
      const d = new Date(p.date);
      const yearKey = `${d.getFullYear()}`;
      if (!groups[yearKey]) groups[yearKey] = [];
      groups[yearKey].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) // Newest year first
      .map((key) => {
        const list = groups[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const open = list[0].open;
        const close = list[list.length - 1].close;
        const adjClose = list[list.length - 1].adjClose;
        const high = Math.max(...list.map((l) => l.high));
        const low = Math.min(...list.map((l) => l.low));
        const volume = list.reduce((acc, l) => acc + l.volume, 0);

        return {
          dateLabel: key,
          open,
          high,
          low,
          close,
          adjClose,
          volume,
        };
      });
  }, [prices]);

  // Reverse daily prices to newest first for table listings
  const dailyData = useMemo(() => {
    return [...prices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [prices]);

  // Pre-calculate overall All-Time High (ATH) price and date across the entire dataset
  const overallATHInfo = useMemo(() => {
    let maxPrice = 0;
    let maxDate = '';
    for (const p of prices) {
      const priceVal = p.high || p.close;
      if (priceVal >= maxPrice) {
        maxPrice = priceVal;
        maxDate = p.date.split('T')[0];
      }
    }
    return { maxPrice, maxDate };
  }, [prices]);

  // Select active list
  const activeList = useMemo(() => {
    if (activeTab === 'monthly') return monthlyData;
    if (activeTab === 'annual') return annualData;
    return dailyData;
  }, [activeTab, dailyData, monthlyData, annualData]);

  // List to display under dynamic loading
  const paginatedList = useMemo(() => {
    if (activeTab === 'annual') return activeList;
    return activeList.slice(0, visibleCount);
  }, [activeList, activeTab, visibleCount]);

  // Intersection observer to load more when reaching the bottom of the table
  useEffect(() => {
    if (activeTab === 'annual') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < activeList.length) {
          setVisibleCount((prev) => Math.min(activeList.length, prev + 15));
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [activeTab, visibleCount, activeList.length]);

  const handleTabChange = (tab: PeriodTab) => {
    setActiveTab(tab);
    setVisibleCount(15);
  };

  const formatDate = (dateStr: string) => {
    if (activeTab === 'monthly') {
      const [year, month] = dateStr.split('-');
      const monthNames = locale === 'es' 
        ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
    }
    if (activeTab === 'annual') return dateStr;
    
    // Daily date format
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const [epsMode, setEpsMode] = useState<'reported' | 'buybackNormalized'>('reported');

  return (
    <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
      
      {/* Header and period selectors */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers size={18} className="text-teal-400" />
            {locale === 'es' ? 'Historial y Ratios de Valuación' : 'Historical Data & Valuation Ratios'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {locale === 'es'
              ? 'Evolución detallada de cotizaciones y métricas financieras clave'
              : 'Detailed breakdown of historical pricing and key financial metrics'}
          </p>
        </div>

        {/* Controls: EPS Mode Toggle + Tab switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* EPS Mode Switcher */}
          {!isFund && (
            <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setEpsMode('reported')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  epsMode === 'reported'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={locale === 'es' ? 'EPS Diluido Reportado Oficial SEC' : 'SEC Reported Diluted EPS'}
              >
                {locale === 'es' ? 'EPS SEC' : 'SEC EPS'}
              </button>
              <button
                onClick={() => setEpsMode('buybackNormalized')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  epsMode === 'buybackNormalized'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={locale === 'es' ? 'EPS Ajustado por Recompra/Dilución de Acciones' : 'Shares Buyback Normalized EPS'}
              >
                {locale === 'es' ? 'Ajustado por Buybacks' : 'Buybacks Adj.'}
              </button>
            </div>
          )}

          {/* Period Tab switcher */}
          <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5">

          <button
            onClick={() => handleTabChange('annual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeTab === 'annual'
                ? 'bg-slate-800 text-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar size={14} />
            {locale === 'es' ? 'Anual' : 'Annual'}
          </button>
          <button
            onClick={() => handleTabChange('monthly')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeTab === 'monthly'
                ? 'bg-slate-800 text-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock size={14} />
            {locale === 'es' ? 'Mensual' : 'Monthly'}
          </button>
          <button
            onClick={() => handleTabChange('daily')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-slate-800 text-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight size={14} />
            {locale === 'es' ? 'Diario' : 'Daily'}
          </button>
        </div>
      </div>
    </div>

      {/* Aggregated Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">


        <table className="w-full text-left text-xs relative">
          <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
            <tr>
              <th className="p-4">{locale === 'es' ? 'Fecha' : 'Date'}</th>
              <th className="p-4">{locale === 'es' ? 'Cierre' : 'Close'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Var. ($)' : 'Var. ($)'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Var. (%)' : 'Var. (%)'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Rend. / ATH' : 'Return / ATH'}</th>
              <th className="p-4">Market Cap</th>
              <th className="p-4">
                <div className="flex items-center gap-2">
                  EPS (TTM Cal.)
                  <div className="flex items-center gap-1 ml-1">
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded px-1 py-0.5">
                      <Database size={8} /> R
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1 py-0.5">
                      <TrendingUp size={8} /> E
                    </span>
                  </div>
                </div>
              </th>
              <th className="p-4">P/E (TTM Cal.)</th>
              <th className="p-4 text-purple-400">EPS (Fiscal 10-K)</th>
              <th className="p-4 text-purple-400">P/E (Fiscal 10-K)</th>

              <th className="p-4">Div. Rate</th>
              <th className="p-4">Div. Yield</th>
              <th className="p-4">{locale === 'es' ? 'Volumen' : 'Volume'}</th>
              <th className="p-4">{locale === 'es' ? 'Índice' : 'Index'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Recomendación' : 'Rating'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
            {paginatedList.map((row: any, idx) => {
              const label = activeTab === 'daily' ? row.date : row.dateLabel;
              const rating = calculateHistoricalRating(row.close);

              // Find the index of this row in the activeList to look up previous chronological element
              const globalIndex = idx;
              const nextRow = activeList[globalIndex + 1];

              let priceChange = 0;
              let percentChange = 0;
              if (nextRow) {
                priceChange = row.close - nextRow.close;
                percentChange = (priceChange / nextRow.close) * 100;
              }

              // Color classes based on positive/negative change
              const changeColor = priceChange > 0 
                ? 'text-emerald-400 font-semibold' 
                : priceChange < 0 
                  ? 'text-rose-400 font-semibold' 
                  : 'text-slate-400';
              
              const changeSign = priceChange > 0 ? '+' : '';

              // ============================================================
              // EPS Resolution: Compute TTM dynamically by summing the 4 most
              // recent quarters with date <= target date.
              // ============================================================
              const rowDateStr = activeTab === 'daily'
                ? row.date
                : activeTab === 'monthly' 
                  ? (() => {
                      const [yr, mo] = row.dateLabel.split('-');
                      const lastDay = new Date(parseInt(yr, 10), parseInt(mo, 10), 0).getDate();
                      return `${row.dateLabel}-${String(lastDay).padStart(2, '0')}`;
                    })()
                  : `${row.dateLabel}-12-31`;
              const rowDate = new Date(rowDateStr);

              let resolvedEps: number | null = null;
              let epsSource: 'real' | 'estimated' | 'mixed' | null = null;
              let quartersUsed: any[] = [];
              let resolvedPe: number | null = null;

              const isFund = ticker.sector === 'Index' || 
                             ticker.sector === 'ETF' || 
                             ticker.sector?.toLowerCase().includes('etf') || 
                             ticker.sector?.toLowerCase().includes('fund') || 
                             ticker.symbol === 'QQQ' || ticker.symbol === 'VOO' || ticker.symbol === 'SCHD';

              if (ticker.historicalEpsQuarterly && Array.isArray(ticker.historicalEpsQuarterly) && ticker.historicalEpsQuarterly.length > 0) {
                // Get quarters/months ending on or before rowDate
                // For funds, we can match the exact calendar month of the rowDate to avoid end-of-month day offsets
                const relevantQuarters = ticker.historicalEpsQuarterly
                  .filter(q => {
                    const qDate = new Date(q.date);
                    if (isFund) {
                      // Allow matching the current month's PE ratio on any day of that month
                      return qDate.getFullYear() < rowDate.getFullYear() || 
                             (qDate.getFullYear() === rowDate.getFullYear() && qDate.getMonth() <= rowDate.getMonth());
                    }
                    return qDate <= rowDate;
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (isFund) {
                  if (relevantQuarters.length > 0) {
                    resolvedPe = relevantQuarters[0].peRatio || null;
                    const priceAdj = row.adjClose || row.close;
                    if (resolvedPe && resolvedPe > 5) {
                      resolvedEps = priceAdj / resolvedPe;
                      epsSource = 'real';
                    } else if (ticker.eps && ticker.price && ticker.price > 0) {
                      // Fallback anchor to real ETF EPS ratio to prevent distorted values (like 0.80)
                      const epsRatio = ticker.eps / ticker.price;
                      resolvedEps = priceAdj * epsRatio;
                      resolvedPe = epsRatio > 0 ? 1 / epsRatio : null;
                      epsSource = 'real';
                    }
                  }
                } else {


                  const sliced = relevantQuarters.slice(0, 4);
                  if (sliced.length === 4) {
                    quartersUsed = sliced;

                    // If Buybacks Normalized mode is active and current shares exist
                    const currentShares = ticker.historicalEpsQuarterly?.[0]?.sharesOutstanding;
                    const hasNetIncome = sliced.every(q => q.netIncome && q.netIncome !== 0);

                    if (epsMode === 'buybackNormalized' && currentShares && currentShares > 0 && hasNetIncome) {
                      const ttmNetIncome = sliced.reduce((sum, q) => sum + (q.netIncome || 0), 0);
                      resolvedEps = parseFloat((ttmNetIncome / currentShares).toFixed(2));
                    } else {
                      const ttmSum = sliced.reduce((sum, q) => sum + (q.epsDiluted || q.eps || 0), 0);
                      resolvedEps = parseFloat(ttmSum.toFixed(2));
                    }
                    
                    // Oldest quarter used in the 4-quarter TTM sum
                    const oldestUsed = sliced[sliced.length - 1];
                    const srcUpper = String(oldestUsed.source || '').toUpperCase();
                    if (srcUpper.includes('EDGAR')) {
                      epsSource = 'EDGAR' as any;
                    } else if (srcUpper.includes('FMP')) {
                      epsSource = 'FMP' as any;
                    } else if (oldestUsed.source === 'real') {
                      epsSource = 'real';
                    } else {
                      epsSource = 'estimated';
                    }
                  }

                }
              }

              // Fallback to CAGR calculations if no quarterly data matches
              if (resolvedEps === null) {
                const rowYear = activeTab === 'daily'
                  ? new Date(row.date).getFullYear()
                  : activeTab === 'monthly'
                    ? parseInt(row.dateLabel.split('-')[0], 10)
                    : parseInt(row.dateLabel, 10);

                // Backward extrapolation based on oldest real quarter available
                const oldestReal = ticker.historicalEpsQuarterly && (ticker.historicalEpsQuarterly as any[]).length > 0
                  ? ticker.historicalEpsQuarterly[ticker.historicalEpsQuarterly.length - 1]
                  : null;

                const baseEps = oldestReal ? oldestReal.eps * 4 : (ticker.eps || 6.5);
                const baseDate = oldestReal ? new Date(oldestReal.date) : (ticker.updatedAt ? new Date(ticker.updatedAt) : new Date());

                const sector = (ticker.sector || '').toLowerCase();
                const symbol = (ticker.symbol || '').toUpperCase();
                let epsGrowth = 0.08;
                if (sector.includes('technology') || symbol === 'QQQ' || symbol === 'TQQQ' || symbol === 'AAPL') epsGrowth = 0.12;
                else if (sector.includes('financial') || sector.includes('energy')) epsGrowth = 0.06;

                const yearsDiff = Math.max(0, (baseDate.getTime() - rowDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                resolvedEps = baseEps / Math.pow(1 + epsGrowth, yearsDiff);
                epsSource = 'estimated';
              }


              const estimatedEps = resolvedEps;

              // Real Dividend Rate calculation using historicalDividends dict from DB
              let finalDivRate = 0;
              let divCount = 0;
              let latestDivVal = 0;

              if (ticker.historicalDividends && typeof ticker.historicalDividends === 'object') {
                const oneYearPrior = new Date(rowDate.getTime() - (365.25 * 24 * 60 * 60 * 1000));
                for (const [dateStr, amount] of Object.entries(ticker.historicalDividends)) {
                  const divDate = new Date(dateStr + 'T12:00:00');
                  if (divDate > oneYearPrior && divDate <= rowDate) {
                    finalDivRate += Number(amount);
                    divCount++;
                    latestDivVal = Number(amount);
                  }
                }
              }

              // If fewer than 4 quarters paid in the last 12 months for current date, extrapolate to annual rate (4 * latest payment)
              if (divCount > 0 && divCount < 4 && rowDate >= new Date('2026-01-01')) {
                finalDivRate = ticker.dividendRate || (latestDivVal * 4);
              }

              if (finalDivRate === 0 && ticker.dividendRate) {
                const baseDate2 = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date();
                const yearsDiff2 = Math.max(0, (baseDate2.getTime() - rowDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                finalDivRate = ticker.dividendRate / Math.pow(1 + 0.06, yearsDiff2);
              }



              // Dynamic calculations based on date close price
              const scaledCap = parsedCurrentCap * (row.close / ticker.price);
              const peRatio = isFund ? resolvedPe : (estimatedEps && estimatedEps > 0 ? (row.close / estimatedEps) : null);
              const divYield = row.close > 0 ? (finalDivRate / row.close) * 100 : 0;

              // Smart Hybrid Return / ATH calculation:
              // If row date is BEFORE ATH date -> calculate growth from row date to today
              // If row date is AFTER ATH date  -> calculate pullback from ATH to row date
              // If row date IS ATH date        -> show 0.00% (ATH record)
              const rowDateKey = activeTab === 'daily' 
                ? (row.date ? row.date.split('T')[0] : '')
                : rowDateStr;
              
              const isBeforeATH = overallATHInfo.maxDate ? rowDateKey < overallATHInfo.maxDate : false;
              const isATHDate = overallATHInfo.maxDate ? rowDateKey === overallATHInfo.maxDate : false;

              let cellVal = 0;
              let cellMode: 'growth' | 'ath' | 'pullback' = 'ath';
              let cellColor = 'text-teal-400 font-bold';

              if (isATHDate || (overallATHInfo.maxPrice > 0 && Math.abs(row.close - overallATHInfo.maxPrice) / overallATHInfo.maxPrice < 0.005)) {
                cellVal = 0;
                cellMode = 'ath';
                cellColor = 'text-teal-400 font-bold';
              } else if (isBeforeATH) {
                cellVal = row.close > 0 ? ((ticker.price - row.close) / row.close) * 100 : 0;
                cellMode = 'growth';
                cellColor = cellVal >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
              } else {
                cellVal = overallATHInfo.maxPrice > 0 ? Math.min(0, ((row.close - overallATHInfo.maxPrice) / overallATHInfo.maxPrice) * 100) : 0;
                cellMode = 'pullback';
                cellColor = 'text-rose-400 font-bold';
              }

              // Calculate CAGR (Compound Annual Growth Rate) from rowDate to today
              const todayObj = new Date();
              const rowDateObj = new Date(rowDateStr);
              const diffDays = Math.max(1, (todayObj.getTime() - rowDateObj.getTime()) / (1000 * 60 * 60 * 24));
              const diffYears = diffDays / 365.25;

              let cagrFormatted = 'N/A';
              let cagrColor = 'text-slate-400';
              let cagrNote = '';

              if (row.close > 0 && ticker.price > 0) {
                if (diffYears < 1) {
                  const absReturn = ((ticker.price - row.close) / row.close) * 100;
                  cagrFormatted = `${absReturn >= 0 ? '+' : ''}${absReturn.toFixed(2)}% (Abs.)`;
                  cagrColor = absReturn >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
                  cagrNote = locale === 'es' 
                    ? '< 1 año: Rendimiento absoluto sin anualizar (evita distorsión por volatilidad).'
                    : '< 1 year: Absolute non-annualized return (prevents short-term skew).';
                } else {
                  const ratio = ticker.price / row.close;
                  if (ratio > 0) {
                    const cagrVal = (Math.pow(ratio, 1 / diffYears) - 1) * 100;
                    cagrFormatted = `${cagrVal >= 0 ? '+' : ''}${cagrVal.toFixed(2)}% / año`;
                    cagrColor = cagrVal >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
                    cagrNote = locale === 'es'
                      ? `CAGR Compuesto Anualizado en ${diffYears.toFixed(1)} años.`
                      : `Annualized CAGR over ${diffYears.toFixed(1)} years.`;
                  }
                }
              }

              const formattedATHDate = overallATHInfo.maxDate
                ? new Date(overallATHInfo.maxDate + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'N/A';

              // Generate Tooltip showing summation details
              const tooltipText = quartersUsed.length === 4
                ? quartersUsed.map(q => `${q.period}/${q.fiscalYear}: $${(q.epsDiluted || q.eps || 0).toFixed(2)} (${q.source === 'real' ? 'R' : 'E'})`).join(' + ') + ` = TTM $${estimatedEps?.toFixed(2)}`
                : locale === 'es' ? 'Calculado dinámicamente' : 'Calculated dynamically';
              
              // Calculate Fiscal EPS (10-K) for the row's fiscal year
              let fiscalEps: number | null = null;
              let fiscalPeRatio: number | null = null;
              let fiscalQuartersUsed: any[] = [];
              if (ticker.historicalEpsQuarterly && Array.isArray(ticker.historicalEpsQuarterly)) {
                const targetYr = activeTab === 'daily'
                  ? new Date(row.date).getFullYear()
                  : activeTab === 'monthly'
                    ? parseInt(row.dateLabel.split('-')[0], 10)
                    : parseInt(row.dateLabel, 10);
                
                const fyQuarters = (ticker.historicalEpsQuarterly as any[]).filter(q => q.fiscalYear === String(targetYr));
                if (fyQuarters.length === 4) {
                  fiscalQuartersUsed = fyQuarters;
                  fiscalEps = parseFloat(fyQuarters.reduce((acc, q) => acc + (q.epsDiluted || q.eps || 0), 0).toFixed(2));
                  if (fiscalEps && fiscalEps > 0 && row.close > 0) {
                    fiscalPeRatio = row.close / fiscalEps;
                  }
                }
              }

              return (
                <tr key={`${activeTab}-${label}-${idx}`} className={`hover:bg-slate-900/10 transition-colors ${row.id === 'temp-today' ? 'bg-teal-500/5 border-l-2 border-teal-500' : ''}`}>
                  <td className="p-4 font-sans font-bold text-white whitespace-nowrap flex items-center gap-2">
                    {formatDate(label)}
                    {row.id === 'temp-today' && (
                      <span className="inline-flex items-center text-[9px] font-extrabold bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded px-1.5 py-0.5 animate-pulse uppercase tracking-wider">
                        {locale === 'es' ? 'EN VIVO' : 'LIVE'}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-slate-100 font-bold">${row.close.toFixed(2)}</td>
                  <td className={`p-4 text-right ${changeColor}`}>
                    {nextRow ? `${changeSign}${priceChange.toFixed(2)}` : '-'}
                  </td>
                  <td className={`p-4 text-right ${changeColor}`}>
                    {nextRow ? `${changeSign}${percentChange.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-4 text-right font-mono relative group/ath hover:z-30 cursor-help">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span className={cellColor}>
                        {cellVal > 0 ? '+' : ''}{cellVal.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-slate-500 group-hover/ath:text-teal-400 transition-colors ml-0.5">ℹ</span>
                    </div>

                    {/* Hover Popover Tooltip (Se despliega hacia abajo si es de las primeras filas para no cortarse) */}
                    <div className={`pointer-events-none absolute right-2 hidden group-hover/ath:flex flex-col gap-2 w-72 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8)] z-50 text-left font-sans animate-in fade-in zoom-in-95 duration-150 ${
                      idx <= 2 ? 'top-full mt-2' : 'bottom-full mb-2.5'
                    }`}>
                      <div className={`absolute border-slate-800 rotate-45 w-3 h-3 bg-slate-950 right-4 ${
                        idx <= 2 ? '-top-1.5 border-t border-l' : '-bottom-1.5 border-b border-r'
                      }`}></div>

                      
                      <div className="flex items-center justify-between border-b border-slate-900 pb-2 font-extrabold text-teal-400 relative z-10">
                        <span>
                          {cellMode === 'growth' 
                            ? (locale === 'es' ? 'Crecimiento a Hoy' : 'Growth to Today')
                            : cellMode === 'pullback' 
                              ? (locale === 'es' ? 'Caída desde ATH' : 'Pullback from ATH')
                              : (locale === 'es' ? 'Máximo Histórico (ATH)' : 'All-Time High (ATH)')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{ticker.symbol}</span>
                      </div>
                      
                      <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-300 relative z-10">
                        <div className="flex justify-between">
                          <span className="text-slate-400">{locale === 'es' ? 'Precio en fecha' : 'Price on Date'}:</span>
                          <strong className="text-slate-100">${row.close.toFixed(2)}</strong>
                        </div>
                        {cellMode === 'growth' ? (
                          <div className="flex justify-between">
                            <span className="text-slate-400">{locale === 'es' ? 'Precio Actual' : 'Current Price'}:</span>
                            <strong className="text-emerald-400">${ticker.price.toFixed(2)}</strong>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-slate-400">{locale === 'es' ? 'Máx. Histórico' : 'Highest Price'}:</span>
                            <strong className="text-emerald-400">${overallATHInfo.maxPrice ? overallATHInfo.maxPrice.toFixed(2) : 'N/A'}</strong>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-slate-900">
                          <span className="text-slate-400">
                            {cellMode === 'growth' 
                              ? (locale === 'es' ? 'Rend. acumulado:' : 'Total Return:')
                              : 'From High:'}
                          </span>
                          <strong className={cellColor}>
                            {cellVal > 0 ? '+' : ''}{cellVal.toFixed(2)}%
                          </strong>
                        </div>

                        {/* CAGR (Compound Annual Growth Rate) display */}
                        <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                          <span className="text-slate-400 font-sans flex items-center gap-1">
                            <TrendingUp size={11} className="text-teal-400 shrink-0" />
                            {locale === 'es' ? 'CAGR (Anualizado):' : 'CAGR (Annualized):'}
                          </span>
                          <strong className={cagrColor}>{cagrFormatted}</strong>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 bg-slate-900/60 rounded px-2 py-1 border border-slate-800/80 flex flex-col gap-0.5 mt-0.5 relative z-10">
                        <span className="font-semibold text-slate-300">{locale === 'es' ? 'Fórmula de Cálculo:' : 'Calculation:'}</span>
                        <span className="font-mono text-[9.5px] text-slate-400">
                          {cellMode === 'growth' 
                            ? '((Precio Actual - Precio Fecha) / Precio Fecha) * 100'
                            : '((Precio Cierre - Máx. Histórico) / Máx. Histórico) * 100'}
                        </span>
                      </div>

                      {cagrNote && (
                        <div className="text-[9.5px] text-teal-300/90 bg-teal-500/10 rounded px-2 py-1 border border-teal-500/20 flex flex-col gap-0.5 relative z-10">
                          <span className="font-semibold text-teal-400">{locale === 'es' ? 'Nota sobre CAGR:' : 'CAGR Note:'}</span>
                          <span>{cagrNote}</span>
                        </div>
                      )}

                      {cellMode !== 'growth' && (
                        <div className="text-[10px] pt-1 border-t border-slate-900 flex items-center justify-between relative z-10">
                          <span className="text-slate-400">{locale === 'es' ? 'Fecha del Máximo' : 'Reached On'}:</span>
                          <strong className="font-bold text-teal-300">{formattedATHDate}</strong>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-slate-300">{formatMarketCap(scaledCap)}</td>
                  {/* EPS (TTM Calendar) */}
                  <td className="p-4 font-mono relative group/eps-ttm hover:z-30 cursor-help">
                    {estimatedEps !== null && estimatedEps !== undefined ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className={`font-mono ${
                          epsSource === 'real' ? 'text-sky-300' : epsSource === 'mixed' ? 'text-purple-300' : 'text-amber-300/80'
                        }`}>
                          ${estimatedEps.toFixed(2)}
                        </span>
                        {(epsSource as string) === 'EDGAR' ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[8.5px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1 py-0.5"
                          >
                            <Database size={7.5} /> E
                          </span>
                        ) : (epsSource as string) === 'FMP' ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[8.5px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1 py-0.5"
                          >
                            <Database size={7.5} /> F
                          </span>
                        ) : epsSource === 'real' ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[8px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded px-1 py-0.5"
                          >
                            <Database size={7} /> R
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 text-[8px] font-bold bg-amber-500/10 text-amber-400/90 border border-amber-500/20 rounded px-1 py-0.5"
                          >
                            Est
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 group-hover/eps-ttm:text-sky-400 transition-colors">ℹ</span>
                      </div>
                    ) : (
                      <span className="text-slate-600">N/A</span>
                    )}

                    {/* Popover Hover para EPS TTM Calendar */}
                    {quartersUsed.length > 0 && (
                      <div className={`pointer-events-none absolute right-2 hidden group-hover/eps-ttm:flex flex-col gap-2 w-72 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8)] z-50 text-left font-sans animate-in fade-in zoom-in-95 duration-150 ${
                        idx <= 2 ? 'top-full mt-2' : 'bottom-full mb-2.5'
                      }`}>
                        <div className={`absolute border-slate-800 rotate-45 w-3 h-3 bg-slate-950 right-4 ${
                          idx <= 2 ? '-top-1.5 border-t border-l' : '-bottom-1.5 border-b border-r'
                        }`}></div>

                        <div className="flex items-center justify-between border-b border-slate-900 pb-2 font-extrabold text-sky-400 relative z-10">
                          <span>Desglose EPS TTM (4 Trimestres)</span>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{ticker.symbol}</span>
                        </div>

                        <div className="flex flex-col gap-1.5 text-[11px] font-mono text-slate-300 relative z-10">
                          {quartersUsed.map((q: any, qIdx: number) => (
                            <div key={qIdx} className="flex items-center justify-between border-b border-slate-900/60 pb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-200">{q.period} {q.fiscalYear}</span>
                                <span className="text-[9.5px] text-slate-400">({q.date})</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <strong className="text-sky-300">${(q.epsDiluted || q.eps || 0).toFixed(2)}</strong>
                                <span className={`text-[8px] font-extrabold px-1 rounded border ${
                                  q.source === 'EDGAR' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                }`}>
                                  {q.source || 'EDGAR'}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-between pt-1 font-bold">
                            <span className="text-slate-300">Suma TTM Calendar:</span>
                            <span className="text-sky-400 text-sm">${estimatedEps?.toFixed(2)} USD</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-slate-300 font-bold">{peRatio ? `${peRatio.toFixed(2)}x` : 'N/A'}</td>
                  
                  {/* EPS (Fiscal 10-K) */}
                  <td className="p-4 font-mono relative group/eps-fiscal hover:z-30 cursor-help">
                    {fiscalEps !== null ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-purple-300 font-bold">${fiscalEps.toFixed(2)}</span>
                        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-extrabold bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded px-1 py-0.5">
                          <Database size={7.5} /> E
                        </span>
                        <span className="text-[10px] text-slate-500 group-hover/eps-fiscal:text-purple-400 transition-colors">ℹ</span>
                      </div>
                    ) : (
                      <span className="text-slate-600">N/A</span>
                    )}

                    {/* Popover Hover para EPS Fiscal 10-K */}
                    {fiscalQuartersUsed.length > 0 && (
                      <div className={`pointer-events-none absolute right-2 hidden group-hover/eps-fiscal:flex flex-col gap-2 w-72 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8)] z-50 text-left font-sans animate-in fade-in zoom-in-95 duration-150 ${
                        idx <= 2 ? 'top-full mt-2' : 'bottom-full mb-2.5'
                      }`}>
                        <div className={`absolute border-slate-800 rotate-45 w-3 h-3 bg-slate-950 right-4 ${
                          idx <= 2 ? '-top-1.5 border-t border-l' : '-bottom-1.5 border-b border-r'
                        }`}></div>

                        <div className="flex items-center justify-between border-b border-slate-900 pb-2 font-extrabold text-purple-400 relative z-10">
                          <span>Desglose 10-K Fiscal Auditado</span>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{ticker.symbol}</span>
                        </div>

                        <div className="flex flex-col gap-1.5 text-[11px] font-mono text-slate-300 relative z-10">
                          {fiscalQuartersUsed.map((q: any, qIdx: number) => (
                            <div key={qIdx} className="flex items-center justify-between border-b border-slate-900/60 pb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-200">{q.period} {q.fiscalYear}</span>
                                <span className="text-[9.5px] text-slate-400">({q.date})</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <strong className="text-purple-300">${(q.epsDiluted || q.eps || 0).toFixed(2)}</strong>
                                <span className={`text-[8px] font-extrabold px-1 rounded border ${
                                  q.source === 'EDGAR' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                }`}>
                                  {q.source || 'EDGAR'}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-between pt-1 font-bold">
                            <span className="text-slate-300">Suma Form 10-K SEC:</span>
                            <span className="text-purple-400 text-sm">${fiscalEps?.toFixed(2)} USD</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-purple-300 font-bold">
                    {fiscalPeRatio ? `${fiscalPeRatio.toFixed(2)}x` : 'N/A'}
                  </td>

                  <td className="p-4 text-slate-400">{finalDivRate > 0 ? `$${finalDivRate.toFixed(2)}` : '$0.00'}</td>
                  <td className="p-4 text-emerald-400/90 font-bold">{divYield > 0 ? `${divYield.toFixed(2)}%` : '0.00%'}</td>
                  <td className="p-4 text-slate-400">{row.volume.toLocaleString()}</td>
                  <td className={`p-4 font-extrabold text-sm ${rating.score >= 75 ? 'text-teal-400' : 'text-amber-400'}`}>
                    {rating.score}
                  </td>
                  <td className="p-4 text-right font-sans">
                    <span className={`text-[9px] font-bold border rounded-md px-2 py-0.5 uppercase tracking-wider ${rating.badgeClass}`}>
                      {rating.recommendation}
                    </span>
                  </td>
                </tr>
              );
            })}
            
            {/* Observer element target for infinite scrolling */}
            {activeTab !== 'annual' && visibleCount < activeList.length && (
              <tr ref={observerRef}>
                <td colSpan={13} className="p-4 text-center text-[10px] text-slate-500 font-sans tracking-wide animate-pulse">
                  {locale === 'es' ? 'Cargando más registros...' : 'Loading more records...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
