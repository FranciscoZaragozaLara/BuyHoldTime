'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Search, ArrowUpDown, SlidersHorizontal, Star, Activity, Sparkles, Filter, LayoutGrid, List } from 'lucide-react';
import { Ticker } from '@/services/api';
import precalculatedPerformance from '../data/precalculated_performance.json';

interface PricesListClientProps {
  initialTickers: Ticker[];
}

type SortOption = 'score-desc' | 'score-asc' | 'symbol-asc' | 'symbol-desc' | 'price-desc' | 'price-asc';

export const PricesListClient: React.FC<PricesListClientProps> = ({ initialTickers }) => {
  const locale = useLocale();
  const tCommon = useTranslations('Common');
  const tPrices = useTranslations('HistoricalPrices');
  const tHeatmap = useTranslations('Heatmap');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const [sortBy, setSortBy] = useState<SortOption>('score-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Extract unique sectors from tickers
  const sectors = useMemo(() => {
    const rawSectors = initialTickers.map((t) => t.sector);
    const uniqueSectors = Array.from(new Set(rawSectors)).filter(Boolean);
    // Sort sectors to keep list neat
    return ['All', ...uniqueSectors.sort()];
  }, [initialTickers]);

  // Translate sector names if translations exist
  const getSectorLabel = (sector: string) => {
    if (sector === 'All') return locale === 'es' ? 'Todos los Sectores' : 'All Sectors';
    
    // Match with translation file Heatmap keys
    const sectorKey = sector.toLowerCase().replace(' ', '');
    try {
      // Re-map common sectors
      if (sectorKey.includes('technology')) return tHeatmap('technology');
      if (sectorKey.includes('financial')) return tHeatmap('financials');
      if (sectorKey.includes('healthcare')) return tHeatmap('healthcare');
      if (sectorKey.includes('energy')) return tHeatmap('energy');
      if (sectorKey.includes('cyclical')) return tHeatmap('consumer');
      if (sectorKey.includes('defensive')) return tHeatmap('defensive');
      if (sectorKey.includes('communication')) return tHeatmap('communication');
    } catch (e) {
      // Fallback
    }
    return sector;
  };

  // Filter & sort logic (split into ETFs and Companies)
  const { filteredEtfs, filteredCompanies } = useMemo(() => {
    const etfList: Ticker[] = [];
    const companyList: Ticker[] = [];

    const isEtf = (ticker: Ticker) => {
      const sector = (ticker.sector || '').toLowerCase();
      const symbol = (ticker.symbol || '').toUpperCase();
      return sector === 'index' || sector === 'etf' || ['SPY', 'VOO', 'QQQ', 'SCHD', 'TQQQ', 'SOXX', 'SMH', 'IBB', 'NLR', 'SOXL'].includes(symbol);
    };

    const parseMarketCap = (capStr: string | null | undefined): number => {
      if (!capStr) return 0;
      const clean = capStr.toUpperCase().replace(/[\s$,]/g, '');
      const val = parseFloat(clean);
      if (isNaN(val)) return 0;
      if (clean.includes('T')) return val * 1e12;
      if (clean.includes('B')) return val * 1e9;
      if (clean.includes('M')) return val * 1e6;
      return val;
    };

    initialTickers.forEach((ticker) => {
      const matchesSearch =
        ticker.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticker.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSector = selectedSector === 'All' || ticker.sector === selectedSector;

      if (matchesSearch && matchesSector) {
        if (isEtf(ticker)) {
          etfList.push(ticker);
        } else {
          companyList.push(ticker);
        }
      }
    });

    // Sort ETFs by MarketCap descending
    etfList.sort((a, b) => parseMarketCap(b.cap) - parseMarketCap(a.cap));

    // Sort Companies by MarketCap descending
    companyList.sort((a, b) => parseMarketCap(b.cap) - parseMarketCap(a.cap));

    return {
      filteredEtfs: etfList,
      filteredCompanies: companyList,
    };
  }, [initialTickers, searchQuery, selectedSector, sortBy]);

  // Recommendations styling helpers
  const getRecommendationStyle = (rec: string, index: number) => {
    const normRec = rec.toLowerCase();
    if (index >= 85 || normRec.includes('strong buy')) {
      return {
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
        text: 'text-emerald-400',
        bar: 'bg-emerald-500',
        ring: 'stroke-emerald-500',
      };
    } else if (index >= 75 || normRec.includes('buy')) {
      return {
        badge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        text: 'text-teal-400',
        bar: 'bg-teal-500',
        ring: 'stroke-teal-500',
      };
    } else if (index >= 45 || normRec.includes('hold') || normRec.includes('neutral')) {
      return {
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        text: 'text-amber-400',
        bar: 'bg-amber-500',
        ring: 'stroke-amber-500',
      };
    } else if (index >= 30 || normRec.includes('sell')) {
      return {
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        text: 'text-rose-400',
        bar: 'bg-rose-500',
        ring: 'stroke-rose-500',
      };
    } else {
      return {
        badge: 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
        text: 'text-red-400',
        bar: 'bg-red-500',
        ring: 'stroke-red-500',
      };
    }
  };

  const renderPerfCell = (symbol: string, key: 'perf1M' | 'perfYTD' | 'perf1Y' | 'perf5Y') => {
    const data = (precalculatedPerformance as any)[symbol];
    const val = data ? data[key] : null;
    if (val === null || val === undefined) return <td className="p-4 text-right text-slate-500 font-mono">-</td>;
    const color = val >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
    return (
      <td className={`p-4 text-right font-mono ${color}`}>
        {val >= 0 ? '+' : ''}{val.toFixed(2)}%
      </td>
    );
  };

  const renderFromHighCell = (stock: Ticker, index: number = 0, total: number = 10) => {
    const data = (precalculatedPerformance as any)[stock.symbol];
    const storedHighestPrice = data?.highestPrice ?? 0;
    const storedHighestDate = data?.highestDate ?? '';
    const currentPrice = stock.price;

    let highestPrice = Math.max(storedHighestPrice, currentPrice);
    let highestDate = storedHighestDate;

    // If current live price equals or exceeds stored historical high, today is the ATH!
    const todayISO = new Date().toISOString().split('T')[0];
    if (currentPrice >= storedHighestPrice || !storedHighestPrice) {
      highestPrice = currentPrice;
      if (!highestDate || storedHighestDate < todayISO) {
        highestDate = todayISO;
      }
    }

    const fromHighVal = highestPrice > 0 ? Math.min(0, ((currentPrice - highestPrice) / highestPrice) * 100) : 0;

    if (highestPrice <= 0) {
      return <td className="p-4 text-right text-slate-500 font-mono">-</td>;
    }

    const isAtHigh = Math.abs(fromHighVal) < 0.01;
    const textColor = isAtHigh ? 'text-teal-400 font-bold' : 'text-rose-400 font-bold';

    const formattedDate = highestDate
      ? new Date(highestDate + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : 'N/A';

    const isNearBottom = total > 2 && index >= total - 2;

    return (
      <td className="p-4 text-right font-mono relative group/ath hover:z-30 cursor-help">
        <div className="inline-flex items-center gap-1 justify-end">
          <span className={textColor}>
            {fromHighVal > 0 ? '+' : ''}{fromHighVal.toFixed(2)}%
          </span>
          <span className="text-[10px] text-slate-500 group-hover/ath:text-teal-400 transition-colors ml-0.5">ℹ</span>
        </div>

        {/* Hover Popover Tooltip (Smart positioning: opens UP if near bottom, DOWN if near top) */}
        <div className={`pointer-events-none absolute right-2 ${isNearBottom ? 'bottom-full mb-2.5' : 'top-full mt-2.5'} hidden group-hover/ath:flex flex-col gap-2 w-64 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8)] z-50 text-left font-sans animate-in fade-in zoom-in-95 duration-150`}>
          <div className={`absolute ${isNearBottom ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-t border-l'} right-4 w-3 h-3 bg-slate-950 border-slate-800 rotate-45`}></div>
          
          <div className="flex items-center justify-between border-b border-slate-900 pb-2 font-extrabold text-teal-400 relative z-10">
            <span>{locale === 'es' ? 'Caída desde Máximo' : 'From High Calculation'}</span>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{stock.symbol}</span>
          </div>
          
          <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-300 relative z-10">
            <div className="flex justify-between">
              <span className="text-slate-400">{locale === 'es' ? 'Máx. Histórico' : 'Highest Price'}:</span>
              <strong className="text-emerald-400">${highestPrice ? highestPrice.toFixed(2) : 'N/A'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{locale === 'es' ? 'Precio Actual' : 'Actual Price'}:</span>
              <strong className="text-slate-100">${currentPrice.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-900">
              <span className="text-slate-400">From High:</span>
              <strong className={textColor}>
                {fromHighVal > 0 ? '+' : ''}{fromHighVal.toFixed(2)}%
              </strong>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-900/60 rounded px-2 py-1 border border-slate-800/80 flex flex-col gap-0.5 mt-0.5 relative z-10">
            <span className="font-semibold text-slate-300">{locale === 'es' ? 'Cálculo de From High:' : 'Calculation:'}</span>
            <span className="font-mono text-[9.5px] text-slate-400">
              Highest Price - Actual Price = From High
            </span>
          </div>

          <div className="text-[10px] pt-1 border-t border-slate-900 flex items-center justify-between relative z-10">
            <span className="text-slate-400">{locale === 'es' ? 'Fecha del Máximo' : 'Reached On'}:</span>
            <strong className="font-bold text-teal-300">{formattedDate}</strong>
          </div>
        </div>
      </td>
    );
  };

  const getLocalizedRecommendation = (rec: string) => {
    const norm = rec.toLowerCase();
    if (norm.includes('strong buy')) return locale === 'es' ? 'Compra Fuerte' : 'Strong Buy';
    if (norm.includes('strong sell')) return locale === 'es' ? 'Venta Fuerte' : 'Strong Sell';
    if (norm.includes('buy')) return tCommon('buy');
    if (norm.includes('sell')) return tCommon('sell');
    if (norm.includes('hold')) return tCommon('hold');
    if (norm.includes('neutral')) return tCommon('neutral');
    return rec;
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Controls: Search, Filter & Sort */}
      <div className="flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          
          {/* Search bar */}
          <div className="relative w-full md:w-96">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search size={18} />
            </span>
            <input
              type="text"
              id="ticker-search"
              placeholder={tCommon('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 transition-all"
            />
          </div>

          {/* Sort selection */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <span className="text-slate-400 text-xs font-semibold flex items-center gap-1">
              <ArrowUpDown size={14} />
              {locale === 'es' ? 'Ordenar por:' : 'Sort By:'}
            </span>
            <select
              id="ticker-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="score-desc">{tCommon('buyHoldIndex')} (↑)</option>
              <option value="score-asc">{tCommon('buyHoldIndex')} (↓)</option>
              <option value="symbol-asc">Ticker (A-Z)</option>
              <option value="symbol-desc">Ticker (Z-A)</option>
              <option value="price-desc">{tCommon('price')} (↑)</option>
              <option value="price-asc">{tCommon('price')} (↓)</option>
            </select>

            {/* View toggle */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5 ml-2 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={locale === 'es' ? 'Vista Cuadrícula' : 'Grid View'}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={locale === 'es' ? 'Vista Tabla' : 'Table View'}
              >
                <List size={15} />
              </button>
            </div>
          </div>

        </div>

        {/* Sector Tabs (Scrollable) */}
        <div className="border-t border-slate-900/80 pt-4 flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
            <Filter size={12} />
            {tPrices('sector')}
          </span>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800">
            {sectors.map((sector) => {
              const isActive = selectedSector === sector;
              return (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                      : 'bg-slate-900/40 text-slate-400 border-slate-900 hover:bg-slate-900/80 hover:text-slate-200'
                  }`}
                >
                  {getSectorLabel(sector)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid count & summary */}
      <div className="flex justify-between items-center px-2">
        <p className="text-xs text-slate-400">
          {locale === 'es' ? 'Mostrando' : 'Showing'} <strong className="text-slate-100">{filteredEtfs.length + filteredCompanies.length}</strong> {locale === 'es' ? 'activos' : 'assets'} ({filteredEtfs.length} ETFs, {filteredCompanies.length} {locale === 'es' ? 'Empresas' : 'Companies'})
        </p>
      </div>

      {/* Results Catalog */}
      {/* Results Catalog */}
      {filteredEtfs.length === 0 && filteredCompanies.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-2xl border border-dashed border-slate-800 bg-slate-950/20 text-center gap-3">
          <Activity size={36} className="text-slate-600 animate-pulse" />
          <p className="text-sm font-semibold text-slate-400">
            {locale === 'es' ? 'No se encontraron activos coincidentes.' : 'No matching assets found.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="flex flex-col gap-12">
          {/* ETFs Grid */}
          {filteredEtfs.length > 0 && (
            <div className="flex flex-col gap-5">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-teal-400 border-b border-slate-900 pb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-teal-400 animate-pulse" />
                ETFs & Fondos Indexados ({filteredEtfs.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEtfs.map((stock) => {
                  const styles = getRecommendationStyle(stock.recommendation, stock.buyHoldIndex);
                  const isBuy = stock.buyHoldIndex >= 75;
                  const changeColor = stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400';
                  
                  const radius = 24;
                  const strokeWidth = 4;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (stock.buyHoldIndex / 100) * circumference;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/${locale}/prices/${stock.symbol}`}
                      className="group flex flex-col justify-between p-6 rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:border-slate-800 hover:bg-slate-900/20 hover:-translate-y-1 shadow-lg hover:shadow-2xl"
                    >
                      <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-300 group-hover:h-1.5 ${isBuy ? 'bg-teal-500' : 'bg-amber-500'}`} />
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-black tracking-wider uppercase bg-teal-500/15 text-teal-300 border border-teal-500/30 group-hover:bg-teal-500 group-hover:text-slate-950 group-hover:border-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.15)] group-hover:shadow-[0_0_16px_rgba(20,184,166,0.4)] transition-all duration-200">
                              {stock.symbol}
                              <span className="text-xs opacity-70 group-hover:opacity-100 font-normal">→</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 border border-slate-800 rounded bg-slate-900/60 px-2 py-0.5">
                              {stock.sector}
                            </span>
                          </div>
                          <h3 className="text-xs text-slate-400 mt-1 truncate max-w-[160px] md:max-w-[200px]">
                            {stock.name}
                          </h3>
                        </div>
                        <span className={`text-[9px] font-bold border rounded px-2 py-0.5 uppercase tracking-wider ${styles.badge}`}>
                          {getLocalizedRecommendation(stock.recommendation)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-900/60">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{tCommon('price')}</span>
                          <span className="text-xl font-black text-white">${stock.price.toFixed(2)}</span>
                          <span className={`text-xs font-bold flex items-center gap-1 ${changeColor}`}>
                            {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-900/20 border border-slate-900/80 p-2.5 rounded-2xl">
                          <div className="relative w-14 h-14">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle cx="28" cy="28" r={radius} fill="transparent" stroke="#1e293b" strokeWidth={strokeWidth} />
                              <circle cx="28" cy="28" r={radius} fill="transparent" className="transition-all duration-500 ease-out" stroke={isBuy ? '#14b8a6' : '#f59e0b'} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-extrabold text-white">{stock.buyHoldIndex}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Buy/Hold</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Index</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 items-center text-[10px] text-slate-500 mt-4 pt-3 border-t border-slate-900/40">
                        <span>{tPrices('pe')}: <strong className="text-slate-400">{stock.pe ? `${stock.pe}x` : 'N/A'}</strong></span>
                        <span>•</span>
                        <span>{tPrices('dy')}: <strong className="text-slate-400">{stock.dy ? `${stock.dy}%` : '0.00%'}</strong></span>
                        <span>•</span>
                        <span>Cap: <strong className="text-slate-400">{stock.cap}</strong></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Companies Grid */}
          {filteredCompanies.length > 0 && (
            <div className="flex flex-col gap-5">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-teal-400 border-b border-slate-900 pb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-teal-400 animate-pulse" />
                {locale === 'es' ? 'Empresas' : 'Companies'} ({filteredCompanies.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCompanies.map((stock) => {
                  const styles = getRecommendationStyle(stock.recommendation, stock.buyHoldIndex);
                  const isBuy = stock.buyHoldIndex >= 75;
                  const changeColor = stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400';
                  
                  const radius = 24;
                  const strokeWidth = 4;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (stock.buyHoldIndex / 100) * circumference;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/${locale}/prices/${stock.symbol}`}
                      className="group flex flex-col justify-between p-6 rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:border-slate-800 hover:bg-slate-900/20 hover:-translate-y-1 shadow-lg hover:shadow-2xl"
                    >
                      <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-300 group-hover:h-1.5 ${isBuy ? 'bg-teal-500' : 'bg-amber-500'}`} />
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-black tracking-wider uppercase bg-teal-500/15 text-teal-300 border border-teal-500/30 group-hover:bg-teal-500 group-hover:text-slate-950 group-hover:border-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.15)] group-hover:shadow-[0_0_16px_rgba(20,184,166,0.4)] transition-all duration-200">
                              {stock.symbol}
                              <span className="text-xs opacity-70 group-hover:opacity-100 font-normal">→</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 border border-slate-800 rounded bg-slate-900/60 px-2 py-0.5">
                              {stock.sector}
                            </span>
                          </div>
                          <h3 className="text-xs text-slate-400 mt-1 truncate max-w-[160px] md:max-w-[200px]">
                            {stock.name}
                          </h3>
                        </div>
                        <span className={`text-[9px] font-bold border rounded px-2 py-0.5 uppercase tracking-wider ${styles.badge}`}>
                          {getLocalizedRecommendation(stock.recommendation)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-900/60">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{tCommon('price')}</span>
                          <span className="text-xl font-black text-white">${stock.price.toFixed(2)}</span>
                          <span className={`text-xs font-bold flex items-center gap-1 ${changeColor}`}>
                            {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-900/20 border border-slate-900/80 p-2.5 rounded-2xl">
                          <div className="relative w-14 h-14">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle cx="28" cy="28" r={radius} fill="transparent" stroke="#1e293b" strokeWidth={strokeWidth} />
                              <circle cx="28" cy="28" r={radius} fill="transparent" className="transition-all duration-500 ease-out" stroke={isBuy ? '#14b8a6' : '#f59e0b'} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-extrabold text-white">{stock.buyHoldIndex}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Buy/Hold</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Index</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 items-center text-[10px] text-slate-500 mt-4 pt-3 border-t border-slate-900/40">
                        <span>{tPrices('pe')}: <strong className="text-slate-400">{stock.pe ? `${stock.pe}x` : 'N/A'}</strong></span>
                        <span>•</span>
                        <span>{tPrices('dy')}: <strong className="text-slate-400">{stock.dy ? `${stock.dy}%` : '0.00%'}</strong></span>
                        <span>•</span>
                        <span>Cap: <strong className="text-slate-400">{stock.cap}</strong></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {/* ETFs Table */}
          {filteredEtfs.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-teal-400 border-b border-slate-900 pb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-teal-400 animate-pulse" />
                ETFs & Fondos Indexados ({filteredEtfs.length})
              </h3>
              <div className="max-h-[650px] overflow-auto border border-slate-900 rounded-xl bg-slate-950 shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-30 bg-slate-950 text-slate-400 font-bold border-b border-slate-900 shadow-md">
                    <tr>
                      <th className="p-3.5 px-4 bg-slate-950 whitespace-nowrap">{tCommon('ticker')}</th>
                      <th className="p-3.5 px-4 bg-slate-950 whitespace-nowrap">{tPrices('sector')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('price')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('change')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 1M</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf YTD</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 1Y</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 5Y</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">From High</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('cap')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('pe')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Forward P/E</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">EPS (TTM)</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Div. Rate</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('dy')}</th>
                      <th className="p-3.5 px-4 text-center bg-slate-950 whitespace-nowrap">{tCommon('buyHoldIndex')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('recommendation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-mono">
                    {filteredEtfs.map((stock, index) => {
                      const styles = getRecommendationStyle(stock.recommendation, stock.buyHoldIndex);
                      const isBuy = stock.buyHoldIndex >= 75;
                      const changeColor = stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400';
                      
                      return (
                        <tr key={stock.symbol} className="hover:bg-slate-900/20 transition-colors">
                          <td className="p-4 font-sans font-bold text-white whitespace-nowrap">
                            <Link href={`/${locale}/prices/${stock.symbol}`} className="group/ticker inline-flex flex-col items-start gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-teal-500/15 text-teal-300 border border-teal-500/30 group-hover/ticker:bg-teal-500 group-hover/ticker:text-slate-950 group-hover/ticker:border-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.15)] group-hover/ticker:shadow-[0_0_16px_rgba(20,184,166,0.4)] group-hover/ticker:scale-105 transition-all duration-200 cursor-pointer">
                                {stock.symbol}
                                <span className="text-[10px] opacity-70 group-hover/ticker:opacity-100 font-normal">→</span>
                              </span>
                              <span className="block text-[10px] text-slate-400 font-medium normal-case truncate max-w-[160px] group-hover/ticker:text-slate-200 transition-colors">{stock.name}</span>
                            </Link>
                          </td>
                          <td className="p-4 font-sans whitespace-nowrap">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-900/40 border border-slate-800 rounded px-2 py-0.5">
                              {getSectorLabel(stock.sector)}
                            </span>
                          </td>
                          <td className="p-4 text-right text-slate-100 font-bold font-mono">${stock.price.toFixed(2)}</td>
                          <td className={`p-4 text-right font-bold font-mono ${changeColor}`}>
                            {stock.changePercent >= 0 ? '+' : ''}
                            {stock.changePercent.toFixed(2)}%
                          </td>
                          {renderPerfCell(stock.symbol, 'perf1M')}
                          {renderPerfCell(stock.symbol, 'perfYTD')}
                          {renderPerfCell(stock.symbol, 'perf1Y')}
                          {renderPerfCell(stock.symbol, 'perf5Y')}
                          {renderFromHighCell(stock, index, filteredEtfs.length)}
                          <td className="p-4 text-right text-slate-300 font-mono">{stock.cap || 'N/A'}</td>
                          <td className="p-4 text-right text-slate-300 font-bold font-mono">{stock.pe ? `${stock.pe.toFixed(2)}x` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{stock.forwardPe ? `${stock.forwardPe.toFixed(2)}x` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-300 font-mono">{stock.eps ? `$${stock.eps.toFixed(2)}` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{stock.dividendRate ? `$${stock.dividendRate.toFixed(2)}` : '$0.00'}</td>
                          <td className="p-4 text-right text-emerald-400/90 font-bold font-mono">{stock.dy ? `${stock.dy.toFixed(2)}%` : '0.00%'}</td>
                          <td className="p-4 text-center font-extrabold text-sm">
                            <span className={`${isBuy ? 'text-teal-400' : 'text-amber-400'}`}>
                              {stock.buyHoldIndex}
                            </span>
                          </td>
                          <td className="p-4 text-right font-sans whitespace-nowrap">
                            <Link href={`/${locale}/prices/${stock.symbol}`}>
                              <span className={`text-[9px] font-bold border rounded-md px-2 py-0.5 uppercase tracking-wider ${styles.badge}`}>
                                {getLocalizedRecommendation(stock.recommendation)}
                              </span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Companies Table */}
          {filteredCompanies.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-teal-400 border-b border-slate-900 pb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-teal-400 animate-pulse" />
                {locale === 'es' ? 'Empresas' : 'Companies'} ({filteredCompanies.length})
              </h3>
              <div className="max-h-[650px] overflow-auto border border-slate-900 rounded-xl bg-slate-950 shadow-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-30 bg-slate-950 text-slate-400 font-bold border-b border-slate-900 shadow-md">
                    <tr>
                      <th className="p-3.5 px-4 bg-slate-950 whitespace-nowrap">{tCommon('ticker')}</th>
                      <th className="p-3.5 px-4 bg-slate-950 whitespace-nowrap">{tPrices('sector')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('price')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('change')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 1M</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf YTD</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 1Y</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Perf 5Y</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">From High</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('cap')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('pe')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Forward P/E</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">EPS (TTM)</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">Div. Rate</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tPrices('dy')}</th>
                      <th className="p-3.5 px-4 text-center bg-slate-950 whitespace-nowrap">{tCommon('buyHoldIndex')}</th>
                      <th className="p-3.5 px-4 text-right bg-slate-950 whitespace-nowrap">{tCommon('recommendation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-mono">
                    {filteredCompanies.map((stock, index) => {
                      const styles = getRecommendationStyle(stock.recommendation, stock.buyHoldIndex);
                      const isBuy = stock.buyHoldIndex >= 75;
                      const changeColor = stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400';
                      
                      return (
                        <tr key={stock.symbol} className="hover:bg-slate-900/20 transition-colors">
                          <td className="p-4 font-sans font-bold text-white whitespace-nowrap">
                            <Link href={`/${locale}/prices/${stock.symbol}`} className="group/ticker inline-flex flex-col items-start gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-teal-500/15 text-teal-300 border border-teal-500/30 group-hover/ticker:bg-teal-500 group-hover/ticker:text-slate-950 group-hover/ticker:border-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.15)] group-hover/ticker:shadow-[0_0_16px_rgba(20,184,166,0.4)] group-hover/ticker:scale-105 transition-all duration-200 cursor-pointer">
                                {stock.symbol}
                                <span className="text-[10px] opacity-70 group-hover/ticker:opacity-100 font-normal">→</span>
                              </span>
                              <span className="block text-[10px] text-slate-400 font-medium normal-case truncate max-w-[160px] group-hover/ticker:text-slate-200 transition-colors">{stock.name}</span>
                            </Link>
                          </td>
                          <td className="p-4 font-sans whitespace-nowrap">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-900/40 border border-slate-800 rounded px-2 py-0.5">
                              {getSectorLabel(stock.sector)}
                            </span>
                          </td>
                          <td className="p-4 text-right text-slate-100 font-bold font-mono">${stock.price.toFixed(2)}</td>
                          <td className={`p-4 text-right font-bold font-mono ${changeColor}`}>
                            {stock.changePercent >= 0 ? '+' : ''}
                            {stock.changePercent.toFixed(2)}%
                          </td>
                          {renderPerfCell(stock.symbol, 'perf1M')}
                          {renderPerfCell(stock.symbol, 'perfYTD')}
                          {renderPerfCell(stock.symbol, 'perf1Y')}
                          {renderPerfCell(stock.symbol, 'perf5Y')}
                          {renderFromHighCell(stock, index, filteredCompanies.length)}
                          <td className="p-4 text-right text-slate-300 font-mono">{stock.cap || 'N/A'}</td>
                          <td className="p-4 text-right text-slate-300 font-bold font-mono">{stock.pe ? `${stock.pe.toFixed(2)}x` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{stock.forwardPe ? `${stock.forwardPe.toFixed(2)}x` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-300 font-mono">{stock.eps ? `$${stock.eps.toFixed(2)}` : 'N/A'}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{stock.dividendRate ? `$${stock.dividendRate.toFixed(2)}` : '$0.00'}</td>
                          <td className="p-4 text-right text-emerald-400/90 font-bold font-mono">{stock.dy ? `${stock.dy.toFixed(2)}%` : '0.00%'}</td>
                          <td className="p-4 text-center font-extrabold text-sm">
                            <span className={`${isBuy ? 'text-teal-400' : 'text-amber-400'}`}>
                              {stock.buyHoldIndex}
                            </span>
                          </td>
                          <td className="p-4 text-right font-sans whitespace-nowrap">
                            <Link href={`/${locale}/prices/${stock.symbol}`}>
                              <span className={`text-[9px] font-bold border rounded-md px-2 py-0.5 uppercase tracking-wider ${styles.badge}`}>
                                {getLocalizedRecommendation(stock.recommendation)}
                              </span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
