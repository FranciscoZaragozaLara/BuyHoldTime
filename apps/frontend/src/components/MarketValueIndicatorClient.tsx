'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { createChart, ColorType, LineSeries, IChartApi, createSeriesMarkers } from 'lightweight-charts';
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
  const [showMa50, setShowMa50] = useState(false);
  const [showMa200, setShowMa200] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Hovered data state for interactive legend displays
  const [hoveredData, setHoveredData] = useState<{
    date: string | null;
    sp500Price: number | null;
    sp500Ema50: number | null;
    sp500Ema200: number | null;
    peRatio: number | null;
    shillerPe: number | null;
  } | null>(null);

  // Timeframe selection: 1Y, 3Y, 5Y, 10Y, 25Y, ALL
  const [timeframe, setTimeframe] = useState<'1Y' | '3Y' | '5Y' | '10Y' | '25Y' | 'ALL'>('10Y');

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
    const sorted = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));

    // Forward fill (carry forward) missing sp500Dividend and sp500Earnings
    let lastDividend: number | undefined = undefined;
    let lastEarnings: number | undefined = undefined;

    for (const item of sorted) {
      if (item.sp500Dividend !== undefined) {
        lastDividend = item.sp500Dividend;
      } else if (lastDividend !== undefined) {
        item.sp500Dividend = lastDividend;
      }

      if (item.sp500Earnings !== undefined) {
        lastEarnings = item.sp500Earnings;
      } else if (lastEarnings !== undefined) {
        item.sp500Earnings = lastEarnings;
      }
    }

    return sorted;
  }, [
    shillerPeData, peRatioData, sp500PriceData, 
    sp500DividendData, sp500EarningsData, cpiData, 
    rateGs10Data, excessCapeYieldData
  ]);

  // Compute moving averages on the full dataset so they remain accurate when zoomed
  const dataWithMa = useMemo(() => {
    if (mergedData.length === 0) return [];

    const ema50: (number | undefined)[] = new Array(mergedData.length);
    const ema200: (number | undefined)[] = new Array(mergedData.length);

    // S&P 500 prices are monthly, so 50 days approx 2.4 months, 200 days approx 9.5 months
    const m50 = 2 / (2.4 + 1);
    const m200 = 2 / (9.5 + 1);

    // Initialize first elements
    let prev50 = mergedData[0].sp500Price;
    let prev200 = mergedData[0].sp500Price;

    ema50[0] = prev50 !== undefined ? parseFloat(prev50.toFixed(2)) : undefined;
    ema200[0] = prev200 !== undefined ? parseFloat(prev200.toFixed(2)) : undefined;

    for (let i = 1; i < mergedData.length; i++) {
      const val = mergedData[i].sp500Price;

      if (val !== undefined && val !== null) {
        if (prev50 === undefined || prev50 === null) {
          prev50 = val;
          ema50[i] = parseFloat(val.toFixed(2));
        } else {
          prev50 = (val - prev50) * m50 + prev50;
          ema50[i] = parseFloat(prev50.toFixed(2));
        }

        if (prev200 === undefined || prev200 === null) {
          prev200 = val;
          ema200[i] = parseFloat(val.toFixed(2));
        } else {
          prev200 = (val - prev200) * m200 + prev200;
          ema200[i] = parseFloat(prev200.toFixed(2));
        }
      } else {
        ema50[i] = undefined;
        ema200[i] = undefined;
      }
    }

    return mergedData.map((item, index) => ({
      ...item,
      sp500PriceMa50: ema50[index],
      sp500PriceMa200: ema200[index],
    }));
  }, [mergedData]);

  // Compute 15-day rolling opportunity markers for the S&P 500 Price series
  const opportunityMarkers = useMemo(() => {
    const markers: any[] = [];
    let lastBasicTime: string | null = null;
    let lastSuperTime: string | null = null;
    let lastUltraTime: string | null = null;

    const getDaysDiff = (d1: string, d2: string) => {
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
    };

    for (let i = 0; i < dataWithMa.length; i++) {
      const d = dataWithMa[i];
      if (!d || !d.date || d.sp500Price === undefined || d.sp500PriceMa50 === undefined || d.sp500PriceMa200 === undefined) continue;

      const price = d.sp500Price;
      const ema50Val = d.sp500PriceMa50;
      const ema200Val = d.sp500PriceMa200;
      const mid = (ema50Val + ema200Val) / 2;
      const markerTime = `${d.date}-01`;

      if (price > ema200Val && price < mid) {
        if (!lastBasicTime || getDaysDiff(markerTime, lastBasicTime) >= 15) {
          markers.push({
            time: markerTime,
            position: 'aboveBar',
            color: '#3b82f6', // Blue
            shape: 'circle',
            text: '$',
            size: 1,
          });
          lastBasicTime = markerTime;
        }
      } else if (price <= ema200Val && price > ema200Val * 0.9) {
        if (!lastSuperTime || getDaysDiff(markerTime, lastSuperTime) >= 15) {
          markers.push({
            time: markerTime,
            position: 'aboveBar',
            color: '#10b981', // Green
            shape: 'circle',
            text: '$$',
            size: 1.15,
          });
          lastSuperTime = markerTime;
        }
      } else if (price <= ema200Val * 0.9) {
        if (!lastUltraTime || getDaysDiff(markerTime, lastUltraTime) >= 15) {
          markers.push({
            time: markerTime,
            position: 'aboveBar',
            color: '#eab308', // Gold
            shape: 'circle',
            text: '$$ 🌟',
            size: 1.15,
          });
          lastUltraTime = markerTime;
        }
      }
    }
    return markers;
  }, [dataWithMa]);

  // Lightweight charts initialization and synchronization
  useEffect(() => {
    if (!chartContainerRef.current || dataWithMa.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30,41,59,0.1)' },
        horzLines: { color: 'rgba(30,41,59,0.1)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(30,41,59,0.3)',
        visible: showSp500Price || showMa50 || showMa200,
      },
      leftPriceScale: {
        borderColor: 'rgba(30,41,59,0.3)',
        visible: showPeRatio || showShillerPe,
      },
      timeScale: {
        borderColor: 'rgba(30,41,59,0.3)',
        rightOffset: 5,
        barSpacing: 6,
      },
      crosshair: {
        mode: 1,
      },
    });
    chartRef.current = chart;

    // Create Series
    const sp500Series = chart.addSeries(LineSeries, {
      color: '#14b8a6',
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: false,
      title: 'S&P 500',
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#f97316', // Orange
      lineWidth: 2,
      lineStyle: 1, // dashed
      priceScaleId: 'right',
      priceLineVisible: false,
      visible: showMa50,
      title: 'EMA 50',
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: '#10b981', // Emerald
      lineWidth: 2,
      lineStyle: 1, // dashed
      priceScaleId: 'right',
      priceLineVisible: false,
      visible: showMa200,
      title: 'EMA 200',
    });

    const peSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceScaleId: 'left',
      priceLineVisible: false,
      visible: showPeRatio,
      title: 'PE Ratio',
    });

    const shillerPeSeries = chart.addSeries(LineSeries, {
      color: '#f43f5e',
      lineWidth: 2,
      priceScaleId: 'left',
      priceLineVisible: false,
      visible: showShillerPe,
      title: 'Shiller PE',
    });

    // Populate data format suitable for lightweight charts
    const chartPoints = dataWithMa.map((d) => ({
      time: `${d.date}-01`,
      sp500Price: d.sp500Price,
      peRatio: d.peRatio,
      shillerPe: d.shillerPe,
      sp500PriceMa50: d.sp500PriceMa50,
      sp500PriceMa200: d.sp500PriceMa200,
    }));

    if (showSp500Price) {
      sp500Series.setData(chartPoints.map(p => ({ time: p.time, value: p.sp500Price ?? 0 })));
      createSeriesMarkers(sp500Series, opportunityMarkers);
    }
    
    if (showMa50) ema50Series.setData(chartPoints.map(p => ({ time: p.time, value: p.sp500PriceMa50 ?? 0 })));
    if (showMa200) ema200Series.setData(chartPoints.map(p => ({ time: p.time, value: p.sp500PriceMa200 ?? 0 })));
    if (showPeRatio) peSeries.setData(chartPoints.map(p => ({ time: p.time, value: p.peRatio ?? 0 })));
    if (showShillerPe) shillerPeSeries.setData(chartPoints.map(p => ({ time: p.time, value: p.shillerPe ?? 0 })));

    // Reference lines
    let overvaluedLine: any = null;
    let maxPriceLine: any = null;

    if (showShillerPe) {
      overvaluedLine = shillerPeSeries.createPriceLine({
        price: 39,
        color: '#f97316',
        lineWidth: 2,
        lineStyle: 1, // dashed
        axisLabelVisible: true,
        title: locale === 'es' ? 'Mercado Sobrevalorado' : 'Overvalued Market',
      });
    }

    const updateMaxLine = () => {
      if (!showShillerPe) {
        if (maxPriceLine) {
          shillerPeSeries.removePriceLine(maxPriceLine);
          maxPriceLine = null;
        }
        return;
      }

      const range = chart.timeScale().getVisibleRange();
      if (!range || !range.from || !range.to) return;

      const fromStr = typeof range.from === 'string' ? range.from : new Date((range.from as any) * 1000).toISOString().split('T')[0];
      const toStr = typeof range.to === 'string' ? range.to : new Date((range.to as any) * 1000).toISOString().split('T')[0];

      const visiblePoints = chartPoints.filter(p => p.time >= fromStr && p.time <= toStr);
      const values = visiblePoints.map(p => p.shillerPe).filter((v): v is number => v !== undefined && v !== null);

      if (values.length > 0) {
        const maxVal = Math.max(...values);
        if (maxPriceLine) {
          shillerPeSeries.removePriceLine(maxPriceLine);
        }
        maxPriceLine = shillerPeSeries.createPriceLine({
          price: maxVal,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: 1, // dashed
          axisLabelVisible: true,
          title: locale === 'es' ? `Máx: ${maxVal.toFixed(2)}x` : `Max: ${maxVal.toFixed(2)}x`,
        });
      }
    };

    // Subscriptions
    chart.timeScale().subscribeVisibleTimeRangeChange(updateMaxLine);
    
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredData(null);
        return;
      }
      
      let timeStr = '';
      if (typeof param.time === 'string') {
        timeStr = param.time;
      } else if (typeof param.time === 'number') {
        timeStr = new Date(param.time * 1000).toISOString().split('T')[0];
      } else if (param.time && typeof param.time === 'object') {
        const t = param.time as any;
        timeStr = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
      }

      if (!timeStr) {
        setHoveredData(null);
        return;
      }

      const dateKey = timeStr.substring(0, 7);
      const matched = dataWithMa.find(d => d.date === dateKey);
      if (matched) {
        setHoveredData({
          date: dateKey,
          sp500Price: matched.sp500Price ?? null,
          sp500Ema50: matched.sp500PriceMa50 ?? null,
          sp500Ema200: matched.sp500PriceMa200 ?? null,
          peRatio: matched.peRatio ?? null,
          shillerPe: matched.shillerPe ?? null,
        });
      } else {
        setHoveredData(null);
      }
    });

    // Handle timeframe bounds
    const latest = chartPoints[chartPoints.length - 1];
    if (latest) {
      const latestDate = new Date(latest.time);
      let fromDate: Date | null = null;
      if (timeframe === '1Y') {
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 1);
      } else if (timeframe === '3Y') {
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 3);
      } else if (timeframe === '5Y') {
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 5);
      } else if (timeframe === '10Y') {
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 10);
      } else if (timeframe === '25Y') {
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 25);
      }

      if (fromDate) {
        chart.timeScale().setVisibleRange({
          from: fromDate.toISOString().split('T')[0] as any,
          to: latest.time as any,
        });
      } else {
        chart.timeScale().fitContent();
      }
    }

    setTimeout(updateMaxLine, 100);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    dataWithMa,
    showSp500Price,
    showPeRatio,
    showShillerPe,
    showMa50,
    showMa200,
    timeframe,
    locale,
  ]);

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

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              {(['1Y', '3Y', '5Y', '10Y', '25Y', 'ALL'] as const).map((t) => (
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
        <div className="flex flex-wrap gap-4 text-xs bg-slate-900/40 p-4 rounded-xl border border-slate-900 min-h-[104px] md:h-[104px] content-start">
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
            <span>S&P 500 Index Price{hoveredData?.sp500Price ? `: $${hoveredData.sp500Price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}</span>
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
            <span>Regular P/E Ratio{hoveredData?.peRatio ? `: ${hoveredData.peRatio.toFixed(2)}x` : ''}</span>
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
            <span>Shiller P/E Ratio (CAPE){hoveredData?.shillerPe ? `: ${hoveredData.shillerPe.toFixed(2)}x` : ''}</span>
          </button>

          <button
            onClick={() => setShowMa50(!showMa50)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showMa50
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showMa50 ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>S&P 500 EMA 50{hoveredData?.sp500Ema50 ? `: $${hoveredData.sp500Ema50.toFixed(2)}` : ''}</span>
          </button>

          <button
            onClick={() => setShowMa200(!showMa200)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showMa200
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showMa200 ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>S&P 500 EMA 200{hoveredData?.sp500Ema200 ? `: $${hoveredData.sp500Ema200.toFixed(2)}` : ''}</span>
          </button>
        </div>

        {/* Responsive Line Chart using TradingView's Lightweight Charts */}
        <div className="relative">
          {hoveredData?.date && (
            <div className="absolute top-2 left-2 z-10 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded bg-slate-950/80 text-slate-300 border border-slate-800 backdrop-blur-sm pointer-events-none">
              <span className="text-teal-400 font-bold">{formatDateLabel(hoveredData.date)}</span>
            </div>
          )}
          <div ref={chartContainerRef} className="h-[400px] w-full" />
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
