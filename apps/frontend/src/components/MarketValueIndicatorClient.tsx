'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Eye, EyeOff, Calendar, Table, LineChart as ChartIcon, Sparkles } from 'lucide-react';
import { IndicatorDetails } from '@/services/api';

interface MarketValueIndicatorClientProps {
  shillerPeData: IndicatorDetails;
  peRatioData: IndicatorDetails;
  sp500PriceData: IndicatorDetails;
  sp500DividendData: IndicatorDetails;
  sp500EarningsData: IndicatorDetails;
  cpiData: IndicatorDetails;
  rateGs10Data: IndicatorDetails;
  excessCapeYieldData: IndicatorDetails;
}

export const MarketValueIndicatorClient: React.FC<MarketValueIndicatorClientProps> = ({
  shillerPeData,
  peRatioData,
  sp500PriceData,
  sp500DividendData,
  sp500EarningsData,
  cpiData,
  rateGs10Data,
  excessCapeYieldData,
}) => {
  const locale = useLocale();
  
  // Visibility states for the 3 main chart lines
  const [showSp500Price, setShowSp500Price] = useState(true);
  const [showPeRatio, setShowPeRatio] = useState(true);
  const [showShillerPe, setShowShillerPe] = useState(true);

  // Timeframe selection: 5Y, 10Y, 25Y, ALL
  const [timeframe, setTimeframe] = useState<'5Y' | '10Y' | '25Y' | 'ALL'>('10Y');

  // Pagination for the table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Merge the 8 datasets by month/date key
  const mergedData = useMemo(() => {
    const map: Record<string, { 
      date: string; 
      sp500Price?: number; 
      peRatio?: number; 
      shillerPe?: number;
      sp500Dividend?: number;
      sp500Earnings?: number;
      cpi?: number;
      rateGs10?: number;
      excessCapeYield?: number;
    }> = {};

    // Helper to extract clean YYYY-MM
    const addEntries = (
      entries: typeof shillerPeData.history, 
      key: 'shillerPe' | 'peRatio' | 'sp500Price' | 'sp500Dividend' | 'sp500Earnings' | 'cpi' | 'rateGs10' | 'excessCapeYield'
    ) => {
      for (const entry of entries) {
        const dateObj = new Date(entry.date);
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const monthKey = `${y}-${m}`;

        if (!map[monthKey]) {
          map[monthKey] = { date: monthKey };
        }
        map[monthKey][key] = entry.value;
      }
    };

    addEntries(sp500PriceData.history, 'sp500Price');
    addEntries(peRatioData.history, 'peRatio');
    addEntries(shillerPeData.history, 'shillerPe');
    addEntries(sp500DividendData.history, 'sp500Dividend');
    addEntries(sp500EarningsData.history, 'sp500Earnings');
    addEntries(cpiData.history, 'cpi');
    addEntries(rateGs10Data.history, 'rateGs10');
    addEntries(excessCapeYieldData.history, 'excessCapeYield');

    // Convert to sorted array
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [
    shillerPeData, peRatioData, sp500PriceData, 
    sp500DividendData, sp500EarningsData, cpiData, 
    rateGs10Data, excessCapeYieldData
  ]);

  // Filter data based on selected timeframe
  const filteredChartData = useMemo(() => {
    if (timeframe === 'ALL') return mergedData;

    const limitYear = new Date().getFullYear() - (timeframe === '5Y' ? 5 : timeframe === '10Y' ? 10 : 25);
    const limitDateStr = `${limitYear}-01`;

    return mergedData.filter((item) => item.date >= limitDateStr);
  }, [mergedData, timeframe]);

  // Data for the table (sorted newest first)
  const tableData = useMemo(() => {
    return [...mergedData]
      .filter(item => 
        item.sp500Price !== undefined || 
        item.peRatio !== undefined || 
        item.shillerPe !== undefined ||
        item.sp500Dividend !== undefined ||
        item.sp500Earnings !== undefined ||
        item.cpi !== undefined ||
        item.rateGs10 !== undefined ||
        item.excessCapeYield !== undefined
      )
      .reverse();
  }, [mergedData]);

  // Paginated table items
  const paginatedTableData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return tableData.slice(startIndex, startIndex + itemsPerPage);
  }, [tableData, currentPage]);

  const totalPages = Math.ceil(tableData.length / itemsPerPage);

  // Formatting helpers
  const formatDateLabel = (dateKey: any) => {
    if (typeof dateKey !== 'string') return '';
    const [year, month] = dateKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 15);
    return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-10">
      
      {/* Visual Header / Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* S&P 500 Card */}
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-teal-400 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'VALOR S&P 500' : 'S&P 500 PRICE'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-teal-400">
            {sp500PriceData.indicator.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Último precio de cierre mensual' : 'Latest monthly index closing price'}
          </p>
        </div>

        {/* Regular PE Card */}
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-amber-500 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'P/E RATIO REGULAR' : 'REGULAR P/E RATIO'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-amber-400">
            {peRatioData.indicator.currentValue.toFixed(2)}x
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Múltiplo de ganancias tradicional' : 'Traditional price-to-earnings multiple'}
          </p>
        </div>

        {/* Shiller PE Card */}
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-rose-500 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'SHILLER PE (CAPE)' : 'SHILLER PE (CAPE)'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-rose-400">
            {shillerPeData.indicator.currentValue.toFixed(2)}x
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Ajustado por inflación (promedio 10 años)' : 'Inflation-adjusted 10-year earnings multiple'}
          </p>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ChartIcon className="text-teal-400" size={20} />
            <h2 className="text-lg font-bold text-white">
              {locale === 'es' ? 'Gráfica del Valor de Mercado' : 'Market Valuation Multi-Line Chart'}
            </h2>
          </div>

          {/* Timeframe Selector & Line Toggles */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              {(['5Y', '10Y', '25Y', 'ALL'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    timeframe === t
                      ? 'bg-teal-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend / Line toggles */}
        <div className="flex flex-wrap gap-4 text-xs bg-slate-900/40 p-4 rounded-xl border border-slate-900">
          <button
            onClick={() => setShowSp500Price(!showSp500Price)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showSp500Price
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showSp500Price ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
            <span>S&P 500 Index Price</span>
          </button>

          <button
            onClick={() => setShowPeRatio(!showPeRatio)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showPeRatio
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showPeRatio ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Regular P/E Ratio</span>
          </button>

          <button
            onClick={() => setShowShillerPe(!showShillerPe)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showShillerPe
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showShillerPe ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Shiller P/E Ratio (CAPE)</span>
          </button>
        </div>

        {/* Responsive Line Chart */}
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" vertical={false} />
              
              <XAxis
                dataKey="date"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                tickFormatter={formatDateLabel}
              />
              
              {/* Left Axis for multiples */}
              <YAxis
                yAxisId="left"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                domain={[0, 'auto']}
                label={{ value: 'Multiples (P/E)', angle: -90, position: 'insideLeft', fill: '#94a3b8', style: { fontSize: 10 } }}
              />

              {/* Right Axis for S&P Price */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                domain={['auto', 'auto']}
                label={{ value: 'S&P 500 Price ($)', angle: 90, position: 'insideRight', fill: '#94a3b8', style: { fontSize: 10 } }}
              />

              <Tooltip
                contentStyle={{
                  background: '#020617',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
                }}
                labelFormatter={formatDateLabel}
                formatter={(value: any, name: any) => {
                  if (name === 'sp500Price') return [`$${Number(value).toFixed(2)}`, 'S&P 500 Price'];
                  if (name === 'peRatio') return [`${Number(value).toFixed(2)}x`, 'Regular PE Ratio'];
                  if (name === 'shillerPe') return [`${Number(value).toFixed(2)}x`, 'Shiller PE Ratio'];
                  return [value, String(name)];
                }}
              />

              {showSp500Price && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sp500Price"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {showPeRatio && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="peRatio"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {showShillerPe && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="shillerPe"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table Section */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Table className="text-teal-400" size={20} />
          <h2 className="text-lg font-bold text-white">
            {locale === 'es' ? 'Historial de Valuación del Mercado' : 'Market Valuation Historical Table'}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-900">
          <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-900 text-slate-400 font-bold whitespace-nowrap">
                <th className="p-3">{locale === 'es' ? 'Fecha' : 'Date'}</th>
                <th className="p-3">{locale === 'es' ? 'S&P 500' : 'S&P 500 Price'}</th>
                <th className="p-3">{locale === 'es' ? 'P/E Regular' : 'Regular PE'}</th>
                <th className="p-3">{locale === 'es' ? 'Shiller PE (CAPE)' : 'Shiller PE'}</th>
                <th className="p-3">{locale === 'es' ? 'Dividendo Anual' : 'Dividend'}</th>
                <th className="p-3">{locale === 'es' ? 'Ganancia Anual' : 'Earnings'}</th>
                <th className="p-3">CPI</th>
                <th className="p-3">{locale === 'es' ? 'Bono 10A (GS10)' : 'GS10 Yield'}</th>
                <th className="p-3">{locale === 'es' ? 'Excess CAPE Yield' : 'Excess CAPE Yield'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 bg-slate-950/20 whitespace-nowrap">
              {paginatedTableData.map((item, index) => (
                <tr key={index} className="hover:bg-slate-900/20 transition-colors">
                  <td className="p-3 font-medium text-slate-300 flex items-center gap-1">
                    <Calendar size={13} className="text-slate-500" />
                    {formatDateLabel(item.date)}
                  </td>
                  <td className="p-3 text-teal-400 font-semibold">
                    {item.sp500Price !== undefined 
                      ? `$${item.sp500Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-'}
                  </td>
                  <td className="p-3 text-amber-500 font-semibold">
                    {item.peRatio !== undefined ? `${item.peRatio.toFixed(2)}x` : '-'}
                  </td>
                  <td className="p-3 text-rose-500 font-semibold">
                    {item.shillerPe !== undefined ? `${item.shillerPe.toFixed(2)}x` : '-'}
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.sp500Dividend !== undefined ? `$${item.sp500Dividend.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.sp500Earnings !== undefined ? `$${item.sp500Earnings.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-3 text-slate-400">
                    {item.cpi !== undefined ? item.cpi.toFixed(2) : '-'}
                  </td>
                  <td className="p-3 text-teal-500 font-medium">
                    {item.rateGs10 !== undefined ? `${item.rateGs10.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-3 text-emerald-500 font-semibold">
                    {item.excessCapeYield !== undefined ? `${item.excessCapeYield.toFixed(3)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center gap-4 text-xs font-semibold mt-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:hover:text-slate-400 transition"
            >
              {locale === 'es' ? 'Anterior' : 'Previous'}
            </button>
            <span className="text-slate-400">
              {locale === 'es' 
                ? `Página ${currentPage} de ${totalPages}`
                : `Page ${currentPage} of ${totalPages}`}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:hover:text-slate-400 transition"
            >
              {locale === 'es' ? 'Siguiente' : 'Next'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
