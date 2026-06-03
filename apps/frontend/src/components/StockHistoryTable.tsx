'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Layers, Clock, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const baseIndex = ticker.buyHoldIndex;

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

  // Select active list
  const activeList = useMemo(() => {
    if (activeTab === 'monthly') return monthlyData;
    if (activeTab === 'annual') return annualData;
    return dailyData;
  }, [activeTab, dailyData, monthlyData, annualData]);

  // Pagination bounds
  const totalPages = Math.ceil(activeList.length / itemsPerPage);
  const paginatedList = useMemo(() => {
    if (activeTab === 'annual') return activeList; // No pagination for annual (too short)
    const startIndex = (currentPage - 1) * itemsPerPage;
    return activeList.slice(startIndex, startIndex + itemsPerPage);
  }, [activeList, activeTab, currentPage]);

  const handleTabChange = (tab: PeriodTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
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
    });
  };

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

        {/* Tab switcher */}
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

      {/* Aggregated Table */}
      <div className="overflow-x-auto border border-slate-900 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-900">
            <tr>
              <th className="p-4">{locale === 'es' ? 'Fecha' : 'Date'}</th>
              <th className="p-4">{locale === 'es' ? 'Cierre' : 'Close'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Var. ($)' : 'Var. ($)'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Var. (%)' : 'Var. (%)'}</th>
              <th className="p-4">Market Cap</th>
              <th className="p-4">EPS</th>
              <th className="p-4">P/E Ratio</th>
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
              const globalIndex = activeTab === 'annual' ? idx : (currentPage - 1) * itemsPerPage + idx;
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

              // Determine growth rates based on sector
              const sector = (ticker.sector || '').toLowerCase();
              const symbol = (ticker.symbol || '').toUpperCase();
              let epsGrowth = 0.08; // 8% default
              let divGrowth = 0.05; // 5% default
              if (sector.includes('technology') || symbol === 'QQQ' || symbol === 'TQQQ') {
                epsGrowth = 0.12;
                divGrowth = 0.08;
              } else if (sector.includes('index') || symbol === 'SPY' || symbol === 'VOO') {
                epsGrowth = 0.07;
                divGrowth = 0.04;
              } else if (sector.includes('financial') || sector.includes('energy')) {
                epsGrowth = 0.06;
                divGrowth = 0.05;
              } else if (symbol === 'SCHD') {
                epsGrowth = 0.06;
                divGrowth = 0.09;
              }

              // Calculate years diff continuously based on row date vs current base date
              const rowDateStr = activeTab === 'daily' 
                ? row.date 
                : (activeTab === 'monthly' ? `${row.dateLabel}-15` : `${row.dateLabel}-06-30`);
              const rowDate = new Date(rowDateStr);
              const baseDate = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date('2026-06-03');
              const timeDiff = baseDate.getTime() - rowDate.getTime();
              const yearsDiff = Math.max(0, timeDiff / (365.25 * 24 * 60 * 60 * 1000));

              // Project EPS and Dividend Rate backwards
              const estimatedEps = ticker.eps && ticker.eps > 0 
                ? ticker.eps / Math.pow(1 + epsGrowth, yearsDiff) 
                : null;
              const estimatedDivRate = ticker.dividendRate && ticker.dividendRate > 0 
                ? ticker.dividendRate / Math.pow(1 + divGrowth, yearsDiff) 
                : null;
              const finalDivRate = estimatedDivRate || 0;

              // Dynamic calculations based on date close price
              const scaledCap = parsedCurrentCap * (row.close / ticker.price);
              const peRatio = estimatedEps && estimatedEps > 0 ? (row.close / estimatedEps) : null;
              const divYield = row.close > 0 ? (finalDivRate / row.close) * 100 : 0;

              return (
                <tr key={idx} className="hover:bg-slate-900/10 transition-colors">
                  <td className="p-4 font-sans font-bold text-white whitespace-nowrap">{formatDate(label)}</td>
                  <td className="p-4 text-slate-100 font-bold">${row.close.toFixed(2)}</td>
                  <td className={`p-4 text-right ${changeColor}`}>
                    {nextRow ? `${changeSign}${priceChange.toFixed(2)}` : '-'}
                  </td>
                  <td className={`p-4 text-right ${changeColor}`}>
                    {nextRow ? `${changeSign}${percentChange.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-4 text-slate-300">{formatMarketCap(scaledCap)}</td>
                  <td className="p-4 text-slate-400">{estimatedEps ? `$${estimatedEps.toFixed(2)}` : 'N/A'}</td>
                  <td className="p-4 text-slate-300 font-bold">{peRatio ? `${peRatio.toFixed(2)}x` : 'N/A'}</td>
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
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {activeTab !== 'annual' && totalPages > 1 && (
        <div className="flex justify-between items-center border-t border-slate-900/40 pt-4 text-xs text-slate-400">
          <div>
            {locale === 'es' ? 'Página' : 'Page'} <strong className="text-slate-200">{currentPage}</strong> {locale === 'es' ? 'de' : 'of'} <strong className="text-slate-200">{totalPages}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-800 rounded-lg bg-slate-900/40 text-slate-400 hover:text-slate-100 hover:bg-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-slate-900/40 transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-800 rounded-lg bg-slate-900/40 text-slate-400 hover:text-slate-100 hover:bg-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-slate-900/40 transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
