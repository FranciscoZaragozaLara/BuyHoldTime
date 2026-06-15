'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Database, Layers, BarChart3 } from 'lucide-react';
import { useLocale } from 'next-intl';

interface QuarterData {
  date: string;
  period: string;
  fiscalYear: string;
  revenue: number;
  netIncome: number;
  eps: number;
  epsDiluted: number;
  sharesOutstanding: number;
  source: 'real' | 'estimated';
}

interface HistoricalPrice {
  id: string;
  tickerId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

interface QuarterlyDataTableProps {
  quarters: QuarterData[] | null | undefined;
  historicalPrices?: HistoricalPrice[];
}

export const QuarterlyDataTable: React.FC<QuarterlyDataTableProps> = ({ quarters, historicalPrices = [] }) => {
  const locale = useLocale();
  const [filterSource, setFilterSource] = useState<'all' | 'real' | 'estimated'>('all');
  
  // Infinite scroll limit state
  const [visibleCount, setVisibleCount] = useState(10);
  const observerRef = useRef<HTMLTableRowElement | null>(null);

  if (!quarters || quarters.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl text-center text-xs text-slate-500">
        {locale === 'es' 
          ? 'No hay registros trimestrales detallados disponibles en la base de datos.' 
          : 'No detailed quarterly records available in the database.'}
      </div>
    );
  }

  // Filter quarters list
  const filteredList = quarters.filter(q => {
    if (filterSource === 'real') return q.source === 'real';
    if (filterSource === 'estimated') return q.source === 'estimated';
    return true;
  });

  // Limit items shown initially (e.g. show 10 quarters initially)
  const displayList = filteredList.slice(0, visibleCount);

  // Intersection observer to load more when reaching the bottom of the table
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredList.length) {
          setVisibleCount((prev) => Math.min(filteredList.length, prev + 10));
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
  }, [visibleCount, filteredList.length]);

  // Reset page count on filter changes
  const handleFilterChange = (filter: 'all' | 'real' | 'estimated') => {
    setFilterSource(filter);
    setVisibleCount(10);
  };

  const formatCurrency = (val: number) => {
    if (val === 0) return 'N/A';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  // Helper to find the closest price to the quarter date
  const findQuarterPrice = (qDateStr: string): number | null => {
    if (historicalPrices.length === 0) return null;
    const targetTime = new Date(qDateStr).getTime();
    
    // Find closest price candle
    let closestPrice = historicalPrices[0].close;
    let minDiff = Math.abs(new Date(historicalPrices[0].date).getTime() - targetTime);

    for (const p of historicalPrices) {
      const diff = Math.abs(new Date(p.date).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = p.close;
      }
    }
    return closestPrice;
  };

  return (
    <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
      
      {/* Header section with Filter controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers size={18} className="text-teal-400" />
            {locale === 'es' ? 'Detalle de Estados Trimestrales (BD)' : 'Quarterly Financial Statements Details (DB)'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {locale === 'es'
              ? `Visualización de los trimestres guardados (Datos reales e históricos estimados)`
              : `Visualization of stored quarters (Real and estimated historical data)`}
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5 text-xs font-semibold">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
              filterSource === 'all' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {locale === 'es' ? 'Todos' : 'All'} ({quarters.length})
          </button>
          <button
            onClick={() => handleFilterChange('real')}
            className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
              filterSource === 'real' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            {locale === 'es' ? 'Reales' : 'Real'} ({quarters.filter(q => q.source === 'real').length})
          </button>
          <button
            onClick={() => handleFilterChange('estimated')}
            className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center gap-1 ${
              filterSource === 'estimated' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            {locale === 'es' ? 'Estimados' : 'Estimated'} ({quarters.filter(q => q.source === 'estimated').length})
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto overflow-y-auto max-h-[400px] border border-slate-900 rounded-xl custom-scrollbar">
        <table className="w-full text-left text-xs relative">
          <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
            <tr>
              <th className="p-4">{locale === 'es' ? 'Cierre de Periodo' : 'Period End'}</th>
              <th className="p-4">{locale === 'es' ? 'Periodo / Año' : 'Period / Year'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Precio' : 'Price'}</th>
              <th className="p-4 text-right">Market Cap</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Ingresos' : 'Revenue'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Utilidad Neta' : 'Net Income'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Margen Neto' : 'Net Margin'}</th>
              <th className="p-4 text-right">EPS</th>
              <th className="p-4 text-right">EPS Diluido</th>
              <th className="p-4 text-right">{locale === 'es' ? 'P/E Ratio (Trim.)' : 'P/E Ratio (Qtr.)'}</th>
              <th className="p-4 text-right">{locale === 'es' ? 'Acciones en Circulación' : 'Shares Outstanding'}</th>
              <th className="p-4 text-center">{locale === 'es' ? 'Origen' : 'Source'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
            {displayList.map((q, idx) => {
              const netMargin = q.revenue > 0 ? (q.netIncome / q.revenue) * 100 : 0;
              const quarterPrice = findQuarterPrice(q.date);
              
              // Quarterly EPS annualized to compute quarterly P/E ratio, or close / (EPS * 4)
              const epsVal = q.epsDiluted || q.eps || 0;
              const peRatio = quarterPrice && epsVal > 0 ? quarterPrice / (epsVal * 4) : null;

              // Calculate historical Market Cap: Shares Outstanding * closest Quarter Close Price
              const qMarketCap = quarterPrice && q.sharesOutstanding ? quarterPrice * q.sharesOutstanding : 0;

              return (
                <tr key={idx} className="hover:bg-slate-900/10 transition-colors">
                  <td className="p-4 font-sans font-bold text-white whitespace-nowrap">
                    {formatDate(q.date)}
                  </td>
                  <td className="p-4 text-slate-300 font-sans font-semibold">
                    <span className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 mr-1 text-[10px] text-teal-400 uppercase">
                      {q.period}
                    </span>
                    {q.fiscalYear}
                  </td>
                  <td className="p-4 text-right text-slate-100 font-bold">
                    {quarterPrice ? `$${quarterPrice.toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="p-4 text-right text-slate-300">
                    {qMarketCap > 0 ? formatCurrency(qMarketCap) : 'N/A'}
                  </td>
                  <td className="p-4 text-right text-slate-300">
                    {formatCurrency(q.revenue)}
                  </td>
                  <td className="p-4 text-right text-slate-300 font-bold">
                    {formatCurrency(q.netIncome)}
                  </td>
                  <td className="p-4 text-right text-emerald-400/90">
                    {netMargin > 0 ? `${netMargin.toFixed(1)}%` : '0.0%'}
                  </td>
                  <td className="p-4 text-right text-slate-100 font-semibold">
                    ${q.eps.toFixed(2)}
                  </td>
                  <td className="p-4 text-right text-teal-400 font-bold">
                    ${q.epsDiluted.toFixed(2)}
                  </td>
                  <td className="p-4 text-right text-slate-200 font-semibold">
                    {peRatio ? `${peRatio.toFixed(1)}x` : 'N/A'}
                  </td>
                  <td className="p-4 text-right text-slate-400">
                    {q.sharesOutstanding ? q.sharesOutstanding.toLocaleString() : 'N/A'}
                  </td>
                  <td className="p-4 text-center">
                    {q.source === 'real' ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded px-2 py-0.5">
                        <Database size={8} /> {locale === 'es' ? 'DATO REAL' : 'REAL DATA'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-0.5">
                        <BarChart3 size={8} /> {locale === 'es' ? 'ESTIMADO' : 'ESTIMATED'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            
            {/* Observer element target for infinite scrolling */}
            {visibleCount < filteredList.length && (
              <tr ref={observerRef}>
                <td colSpan={12} className="p-4 text-center text-[10px] text-slate-500 font-sans tracking-wide animate-pulse">
                  {locale === 'es' ? 'Cargando más trimestres...' : 'Loading more quarters...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
