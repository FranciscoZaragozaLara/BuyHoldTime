'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, AreaSeries, LineSeries } from 'lightweight-charts';
import { HistoricalPrice } from '@/services/api';
import { Maximize2, Minimize2, BarChart2, TrendingUp } from 'lucide-react';

interface StockChartProps {
  prices: HistoricalPrice[];
  buyHoldIndex: number;
  recommendation: string;
}

export const StockChart: React.FC<StockChartProps> = ({ prices, buyHoldIndex, recommendation }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [isLoaded, setIsLoaded] = useState(false);

  // Format data for lightweight-charts (date must be in YYYY-MM-DD or Unix timestamp)
  const chartData = React.useMemo(() => {
    return prices
      .map((p) => {
        // Ensure date is formatted as YYYY-MM-DD
        const d = new Date(p.date);
        const dateStr = d.toISOString().split('T')[0];
        return {
          time: dateStr,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          // adjClose used as fallback or secondary metrics
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [prices]);

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

  const toggleChartType = (type: 'candle' | 'line') => {
    if (type === chartType) return;
    setChartType(type);
  };

  return (
    <div className="w-full flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl relative">
      
      {/* Chart Headers & Controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {chartType === 'candle' ? 'Candlestick Chart' : 'Close Price Area Chart'}
          </span>
          <p className="text-[10px] text-slate-500">
            Drag to pan, scroll to zoom. Powered by TradingView.
          </p>
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

      {/* Chart Render Canvas Container */}
      <div className="relative w-full h-[320px] md:h-[400px]" style={{ minHeight: '320px' }}>
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 text-slate-500 text-xs">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-500 mr-2"></span>
            Loading TradingView Chart...
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

    </div>
  );
};
