'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, AreaSeries, LineSeries } from 'lightweight-charts';
import { HistoricalPrice, Ticker } from '@/services/api';
import { BarChart2, TrendingUp, X, Calendar, DollarSign, Activity, Info, BarChart3 } from 'lucide-react';
import { useLocale } from 'next-intl';

interface StockChartProps {
  prices: HistoricalPrice[];
  buyHoldIndex: number;
  recommendation: string;
  ticker: Ticker;
}

export const StockChart: React.FC<StockChartProps> = ({ prices, buyHoldIndex, recommendation, ticker }) => {
  const locale = useLocale();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const hoveredTimeRef = useRef<string | null>(null);
  const lastHoveredTimeRef = useRef<string | null>(null); // Persistent: never reset to null

  const [chartType, setChartType] = useState<'candle' | 'line'>('line');
  const [timeRange, setTimeRange] = useState<'1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL'>('5Y');
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Format data for lightweight-charts (date must be in YYYY-MM-DD or Unix timestamp)
  // Format data for lightweight-charts (date must be in YYYY-MM-DD or Unix timestamp)
  // Group dynamically if timeRange is 5Y (weekly) or ALL (monthly)
  const chartData = React.useMemo(() => {
    const sortedPrices = [...prices]
      .map((p) => {
        const d = new Date(p.date);
        const dateStr = d.toISOString().split('T')[0];
        return {
          time: dateStr,
          dateObj: d,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    if (sortedPrices.length === 0) return [];

    if (timeRange === '5Y') {
      // Group into Weekly candles
      const weeklyGroups: { [key: string]: typeof sortedPrices } = {};
      
      sortedPrices.forEach((p) => {
        const d = p.dateObj;
        const tempDate = new Date(d.getTime());
        const day = tempDate.getDay();
        const diff = tempDate.getDate() - day + (day === 0 ? -6 : 1); // Monday of the week
        tempDate.setDate(diff);
        const weekKey = tempDate.toISOString().split('T')[0];
        
        if (!weeklyGroups[weekKey]) weeklyGroups[weekKey] = [];
        weeklyGroups[weekKey].push(p);
      });
      
      return Object.keys(weeklyGroups)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => {
          const list = weeklyGroups[key];
          list.sort((a, b) => a.time.localeCompare(b.time));
          
          const open = list[0].open;
          const close = list[list.length - 1].close;
          const high = Math.max(...list.map((l) => l.high));
          const low = Math.min(...list.map((l) => l.low));
          
          return {
            time: key,
            open,
            high,
            low,
            close,
          };
        });
    }
    
    if (timeRange === 'ALL') {
      // Group into Monthly candles
      const monthlyGroups: { [key: string]: typeof sortedPrices } = {};
      
      sortedPrices.forEach((p) => {
        const monthKey = p.time.substring(0, 7) + '-01'; // e.g. "2026-06-01"
        if (!monthlyGroups[monthKey]) monthlyGroups[monthKey] = [];
        monthlyGroups[monthKey].push(p);
      });
      
      return Object.keys(monthlyGroups)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => {
          const list = monthlyGroups[key];
          list.sort((a, b) => a.time.localeCompare(b.time));
          
          const open = list[0].open;
          const close = list[list.length - 1].close;
          const high = Math.max(...list.map((l) => l.high));
          const low = Math.min(...list.map((l) => l.low));
          
          // Use the date of the last transaction in the month as the candle timestamp
          const finalTime = list[list.length - 1].time;
          
          return {
            time: finalTime,
            open,
            high,
            low,
            close,
          };
        });
    }

    // Default: Daily candles
    return sortedPrices.map((p) => ({
      time: p.time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
  }, [prices, timeRange]);

  // Calculate Exponential Moving Average (EMA) of 200 periods
  const emaData = React.useMemo(() => {
    const period = 200;
    if (chartData.length < period) return [];
    
    const ema: { time: string; value: number }[] = [];
    const multiplier = 2 / (period + 1);
    
    // Initial SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += chartData[i].close;
    }
    let prevEma = sum / period;
    
    ema.push({ time: chartData[period - 1].time, value: Number(prevEma.toFixed(2)) });
    
    for (let i = period; i < chartData.length; i++) {
      const currentEma = (chartData[i].close - prevEma) * multiplier + prevEma;
      ema.push({ time: chartData[i].time, value: Number(currentEma.toFixed(2)) });
      prevEma = currentEma;
    }
    return ema;
  }, [chartData]);

  // Calculate Exponential Moving Average (EMA) of 50 periods
  const ema50Data = React.useMemo(() => {
    const period = 50;
    if (chartData.length < period) return [];
    
    const ema: { time: string; value: number }[] = [];
    const multiplier = 2 / (period + 1);
    
    // Initial SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += chartData[i].close;
    }
    let prevEma = sum / period;
    
    ema.push({ time: chartData[period - 1].time, value: Number(prevEma.toFixed(2)) });
    
    for (let i = period; i < chartData.length; i++) {
      const currentEma = (chartData[i].close - prevEma) * multiplier + prevEma;
      ema.push({ time: chartData[i].time, value: Number(currentEma.toFixed(2)) });
      prevEma = currentEma;
    }
    return ema;
  }, [chartData]);

  // Determine chart theme colors based on recommendation
  const themeColor = React.useMemo(() => {
    const rec = recommendation.toLowerCase();
    if (buyHoldIndex >= 85 || rec.includes('strong buy')) return '#10b981'; // Emerald
    if (buyHoldIndex >= 75 || rec.includes('buy')) return '#14b8a6'; // Teal
    if (buyHoldIndex >= 45 || rec.includes('hold') || rec.includes('neutral')) return '#f59e0b'; // Amber
    return '#f43f5e'; // Rose
  }, [buyHoldIndex, recommendation]);

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#030712' }, // bg-slate-950
        textColor: '#94a3b8', // text-slate-400
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.3)' }, // border-slate-900
        horzLines: { color: 'rgba(30, 41, 59, 0.3)' },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: {
          color: themeColor,
          width: 1,
          style: 3, // dashed
          labelBackgroundColor: themeColor,
        },
        horzLine: {
          color: themeColor,
          width: 1,
          style: 3,
          labelBackgroundColor: themeColor,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(30, 41, 59, 0.5)',
      },
      timeScale: {
        borderColor: 'rgba(30, 41, 59, 0.5)',
        rightOffset: 5,
        barSpacing: 6,
      },
    });

    chartRef.current = chart;

    // Create Candlestick Series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Create Area Series
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: `${themeColor}4d`, // 30% Opacity
      bottomColor: `${themeColor}00`, // Transparent
      lineColor: themeColor,
      lineWidth: 2,
    });
    areaSeriesRef.current = areaSeries;

    // Create EMA 200 line series
    const emaSeries = chart.addSeries(LineSeries, {
      color: '#10b981', // Premium green/emerald color matching indicators
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA 200',
    });

    // Create EMA 50 line series
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#f97316', // Orange color for EMA 50 support
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA 50',
    });

    // Apply data based on active chartType
    if (chartType === 'candle') {
      candlestickSeries.setData(chartData);
      chart.removeSeries(areaSeries);
      areaSeriesRef.current = null;
    } else {
      areaSeries.setData(chartData.map((d) => ({ time: d.time, value: d.close })));
      chart.removeSeries(candlestickSeries);
      candlestickSeriesRef.current = null;
    }

    // Load calculated EMA data points if available
    if (emaData.length > 0) {
      emaSeries.setData(emaData);
    }
    if (ema50Data.length > 0) {
      ema50Series.setData(ema50Data);
    }

    chart.timeScale().fitContent();
    setIsLoaded(true);

    // Crosshair move handler — keep lastHoveredTimeRef always set to last known date
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const t = param.time as string;
        hoveredTimeRef.current = t;
        lastHoveredTimeRef.current = t; // Never reset — survives mouse leaving chart
      } else {
        hoveredTimeRef.current = null;
        // lastHoveredTimeRef.current intentionally NOT reset
      }
    });

    // Responsive Resize Handler
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
      candlestickSeriesRef.current = null;
      areaSeriesRef.current = null;
    };
  }, [chartData, chartType, themeColor]);

  // Handle active time range changes and update chart visible bounds
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chartData.length === 0 || !isLoaded) return;

    const latestPrice = chartData[chartData.length - 1];
    if (!latestPrice) return;
    
    const latestDate = new Date(latestPrice.time);
    let fromDate: Date | null = null;
    
    switch (timeRange) {
      case '1M':
        fromDate = new Date(latestDate);
        fromDate.setMonth(fromDate.getMonth() - 1);
        break;
      case '6M':
        fromDate = new Date(latestDate);
        fromDate.setMonth(fromDate.getMonth() - 6);
        break;
      case 'YTD':
        fromDate = new Date(latestDate.getFullYear(), 0, 1);
        break;
      case '1Y':
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        break;
      case '5Y':
        fromDate = new Date(latestDate);
        fromDate.setFullYear(fromDate.getFullYear() - 5);
        break;
      case 'ALL':
      default:
        fromDate = null;
        break;
    }
    
    if (fromDate) {
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = latestPrice.time;
      
      // Wrap in short timeout to ensure the chart has layouted
      const timer = setTimeout(() => {
        try {
          chart.timeScale().setVisibleRange({
            from: fromStr as any,
            to: toStr as any,
          });
        } catch (err) {
          console.warn('Failed to set chart visible range:', err);
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        try {
          chart.timeScale().fitContent();
        } catch (err) {
          console.warn('Failed to fit chart content:', err);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [timeRange, chartData, isLoaded]);

  const toggleChartType = (type: 'candle' | 'line') => {
    if (type === chartType) return;
    setChartType(type);
  };

  // Synchronize modal state with native dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isModalOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isModalOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      setIsModalOpen(false);
    };
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, []);

  const formatMarketCap = (num: number) => {
    if (num === 0) return 'N/A';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  };

  const formatDateLabel = (dateStr: string) => {
    if (timeRange === 'ALL') {
      const [year, month] = dateStr.split('-');
      const monthNames = locale === 'es' 
        ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const modalData = React.useMemo(() => {
    if (!selectedDate) return null;

    const priceRecord = chartData.find((d) => d.time === selectedDate);
    if (!priceRecord) return null;

    const ema50Val = ema50Data.find((d) => d.time === selectedDate)?.value || null;
    const ema200Val = emaData.find((d) => d.time === selectedDate)?.value || null;

    const rowDateStr = selectedDate;
    const rowDate = new Date(rowDateStr);

    let resolvedEps: number | null = null;
    let epsSource: 'real' | 'estimated' | 'mixed' | null = null;
    let resolvedPe: number | null = null;

    const isFund = ticker.sector === 'Index' || 
                   ticker.sector === 'ETF' || 
                   ticker.sector?.toLowerCase().includes('etf') || 
                   ticker.sector?.toLowerCase().includes('fund') || 
                   ticker.symbol === 'QQQ' || ticker.symbol === 'VOO' || ticker.symbol === 'SCHD';

    if (ticker.historicalEpsQuarterly && Array.isArray(ticker.historicalEpsQuarterly) && ticker.historicalEpsQuarterly.length > 0) {
      const relevantQuarters = ticker.historicalEpsQuarterly
        .filter(q => {
          const qDate = new Date(q.date);
          if (isFund) {
            return qDate.getFullYear() < rowDate.getFullYear() || 
                   (qDate.getFullYear() === rowDate.getFullYear() && qDate.getMonth() <= rowDate.getMonth());
          }
          return qDate <= rowDate;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (isFund) {
        if (relevantQuarters.length > 0) {
          resolvedPe = relevantQuarters[0].peRatio || null;
          if (resolvedPe && resolvedPe > 0) {
            resolvedEps = priceRecord.close / resolvedPe;
            epsSource = 'real';
          }
        }
      } else {
        const sliced = relevantQuarters.slice(0, 4);
        if (sliced.length === 4) {
          const ttmSum = sliced.reduce((sum, q) => sum + (q.epsDiluted || q.eps || 0), 0);
          resolvedEps = parseFloat(ttmSum.toFixed(2));
          const allReal = sliced.every(q => q.source === 'real');
          epsSource = allReal ? 'real' : sliced.every(q => q.source === 'estimated') ? 'estimated' : 'mixed';
        }
      }
    }

    if (resolvedEps === null) {
      const rowYear = rowDate.getFullYear();
      if (!isFund && ticker.historicalEps && ticker.historicalEps[String(rowYear)]) {
        const entry = ticker.historicalEps[String(rowYear)];
        resolvedEps = entry.value;
        epsSource = entry.source;
      } else {
        const sectorStr = (ticker.sector || '').toLowerCase();
        const symbolStr = (ticker.symbol || '').toUpperCase();
        let epsGrowth = 0.08;
        if (sectorStr.includes('technology') || symbolStr === 'QQQ' || symbolStr === 'TQQQ') epsGrowth = 0.12;
        else if (sectorStr.includes('financial') || sectorStr.includes('energy')) epsGrowth = 0.06;

        const baseDate = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date();
        const yearsDiff = Math.max(0, (baseDate.getTime() - rowDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        if (ticker.eps && ticker.eps > 0) {
          resolvedEps = ticker.eps / Math.pow(1 + epsGrowth, yearsDiff);
          epsSource = 'estimated';
        }
      }
    }

    const sectorStr = (ticker.sector || '').toLowerCase();
    const symbolStr = (ticker.symbol || '').toUpperCase();
    let divGrowth = 0.05;
    if (sectorStr.includes('technology') || symbolStr === 'QQQ' || symbolStr === 'TQQQ') divGrowth = 0.08;
    else if (sectorStr.includes('index') || symbolStr === 'SPY' || symbolStr === 'VOO') divGrowth = 0.04;
    else if (symbolStr === 'SCHD') divGrowth = 0.09;

    const baseDate2 = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date();
    const yearsDiff2 = Math.max(0, (baseDate2.getTime() - rowDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    const estimatedDivRate = ticker.dividendRate && ticker.dividendRate > 0
      ? ticker.dividendRate / Math.pow(1 + divGrowth, yearsDiff2)
      : null;
    const finalDivRate = estimatedDivRate || 0;

    const parsedCurrentCap = (() => {
      const capStr = ticker.cap || '0';
      const num = parseFloat(capStr);
      if (capStr.toUpperCase().includes('T')) return num * 1e12;
      if (capStr.toUpperCase().includes('B')) return num * 1e9;
      if (capStr.toUpperCase().includes('M')) return num * 1e6;
      return num;
    })();
    const scaledCap = parsedCurrentCap * (priceRecord.close / ticker.price);

    const averagePrice = prices.length > 0 ? prices.reduce((acc, p) => acc + p.close, 0) / prices.length : 1;
    const ratio = priceRecord.close / averagePrice;
    let deviation = 0;
    if (ratio > 1) {
      deviation = Math.min(12, (ratio - 1) * 25);
    } else {
      deviation = Math.max(-12, (ratio - 1) * 25);
    }
    const baseIndex = ticker.buyHoldIndex;
    const ratingScore = Math.max(15, Math.min(98, Math.round(baseIndex + deviation)));

    let recommendation = 'Hold';
    let badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (ratingScore >= 85) {
      recommendation = locale === 'es' ? 'Compra Fuerte' : 'Strong Buy';
      badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (ratingScore >= 75) {
      recommendation = locale === 'es' ? 'Comprar' : 'Buy';
      badgeClass = 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    } else if (ratingScore >= 45) {
      recommendation = locale === 'es' ? 'Mantener' : 'Hold';
      badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    } else if (ratingScore >= 30) {
      recommendation = locale === 'es' ? 'Vender' : 'Sell';
      badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else {
      recommendation = locale === 'es' ? 'Venta Fuerte' : 'Strong Sell';
      badgeClass = 'bg-red-500/10 text-red-400 border-red-500/30';
    }

    const peRatio = isFund ? resolvedPe : (resolvedEps && resolvedEps > 0 ? (priceRecord.close / resolvedEps) : null);
    const divYield = priceRecord.close > 0 ? (finalDivRate / priceRecord.close) * 100 : 0;

    const origPriceObj = prices.find((p) => {
      const d = new Date(p.date);
      const dateStr = d.toISOString().split('T')[0];
      return dateStr === selectedDate;
    });
    const volume = origPriceObj?.volume || 0;

    return {
      date: selectedDate,
      close: priceRecord.close,
      open: priceRecord.open,
      high: priceRecord.high,
      low: priceRecord.low,
      ema50: ema50Val,
      ema200: ema200Val,
      eps: resolvedEps,
      epsSource,
      pe: peRatio,
      divRate: finalDivRate,
      divYield: divYield,
      marketCap: scaledCap,
      ratingScore,
      recommendation,
      badgeClass,
      volume,
    };
  }, [selectedDate, chartData, emaData, ema50Data, ticker, prices, locale]);

  return (
    <div className="w-full flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl relative">
      
      {/* Chart Headers & Controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        
        {/* Title & Time Range Tabs */}
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {chartType === 'candle' ? 'Candlestick Chart' : 'Close Price Area Chart'}
            </span>
          </div>
          
          {/* Time Range Selector Tabs */}
          <div className="flex bg-slate-900/60 border border-slate-800/80 rounded-lg p-0.5 text-[10px] font-bold">
            {(['1M', '6M', 'YTD', '1Y', '5Y', 'ALL'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1.5 rounded transition-all cursor-pointer ${
                  timeRange === range
                    ? 'bg-slate-800 text-teal-400 font-extrabold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle buttons */}
        <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => toggleChartType('candle')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              chartType === 'candle'
                ? 'bg-slate-800 text-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 size={14} />
            Candles
          </button>
          <button
            onClick={() => toggleChartType('line')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              chartType === 'line'
                ? 'bg-slate-800 text-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp size={14} />
            Line
          </button>
        </div>
      </div>

      {/* Chart Render Canvas Container — onDoubleClick here bypasses canvas event swallowing */}
      <div
        className="relative w-full h-[320px] md:h-[400px]"
        style={{ minHeight: '320px' }}
        onDoubleClick={() => {
          const time = lastHoveredTimeRef.current;
          if (time) {
            setSelectedDate(time);
            setIsModalOpen(true);
          }
        }}
      >
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 text-slate-500 text-xs">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-500 mr-2"></span>
            Loading TradingView Chart...
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* Modern Glassmorphic Dialog Modal */}
      <dialog
        ref={dialogRef}
        className="fixed inset-0 z-50 m-auto max-w-xl w-[92%] sm:w-full bg-slate-950/95 border border-slate-900 rounded-2xl shadow-2xl p-6 backdrop:bg-slate-950/80 backdrop:backdrop-blur-md outline-none border-slate-800/80 animate-in fade-in zoom-in duration-200 text-white"
      >
        {modalData && (
          <div className="flex flex-col gap-6">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-900/80 pb-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={12} className="text-teal-400" />
                  {locale === 'es' ? 'Instantánea Histórica' : 'Historical Snapshot'}
                </span>
                <h3 className="text-lg font-black text-slate-100">
                  {formatDateLabel(modalData.date)}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Score and Recommendation */}
            <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-slate-900/60 rounded-xl">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                  {locale === 'es' ? 'Valor Indicador' : 'Indicator Value'}
                </span>
                <span className="text-2xl font-black text-white">
                  {modalData.ratingScore} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                </span>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center text-[10px] font-bold border rounded-lg px-3 py-1 uppercase tracking-wider ${modalData.badgeClass}`}>
                  {modalData.recommendation}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              {/* Close Price */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  {locale === 'es' ? 'Precio de Cierre' : 'Close Price'}
                </span>
                <span className="text-base font-black text-slate-100">
                  ${modalData.close.toFixed(2)}
                </span>
              </div>

              {/* Volume */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans font-mono">
                  {locale === 'es' ? 'Volumen' : 'Volume'}
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.volume > 0 ? modalData.volume.toLocaleString() : 'N/A'}
                </span>
              </div>

              {/* EMA 50 */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans flex items-center gap-1">
                  <Activity size={10} className="text-orange-500" />
                  EMA 50
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.ema50 ? `$${modalData.ema50.toFixed(2)}` : 'N/A'}
                </span>
              </div>

              {/* EMA 200 */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans flex items-center gap-1">
                  <Activity size={10} className="text-emerald-500" />
                  EMA 200
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.ema200 ? `$${modalData.ema200.toFixed(2)}` : 'N/A'}
                </span>
              </div>

              {/* EPS */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  EPS (TTM)
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.eps ? `$${modalData.eps.toFixed(2)}` : 'N/A'}
                  {modalData.epsSource && (
                    <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      {modalData.epsSource.toUpperCase().substring(0, 3)}
                    </span>
                  )}
                </span>
              </div>

              {/* P/E Ratio */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  P/E Ratio
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.pe ? `${modalData.pe.toFixed(2)}x` : 'N/A'}
                </span>
              </div>

              {/* Dividend Rate */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  Div. Rate
                </span>
                <span className="text-base font-black text-slate-100">
                  {modalData.divRate > 0 ? `$${modalData.divRate.toFixed(2)}` : '$0.00'}
                </span>
              </div>

              {/* Dividend Yield */}
              <div className="flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  Div. Yield
                </span>
                <span className="text-base font-black text-emerald-400">
                  {modalData.divYield > 0 ? `${modalData.divYield.toFixed(2)}%` : '0.00%'}
                </span>
              </div>

              {/* Market Cap */}
              <div className="col-span-2 flex flex-col gap-1 p-3 rounded-xl border border-slate-900 bg-slate-900/10">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-sans">
                  Market Cap
                </span>
                <span className="text-base font-black text-slate-100">
                  {formatMarketCap(modalData.marketCap)}
                </span>
              </div>
            </div>
          </div>
        )}
      </dialog>

    </div>
  );
};
