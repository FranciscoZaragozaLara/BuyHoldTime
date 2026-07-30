'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, AreaSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { HistoricalPrice, Ticker } from '@/services/api';
import { BarChart2, TrendingUp, X, Calendar, Activity, Info } from 'lucide-react';
import { useLocale } from 'next-intl';

interface StockChartProps {
  prices: HistoricalPrice[];
  buyHoldIndex: number;
  recommendation: string;
  ticker: Ticker;
}

// Floating badge shown after a single click on the chart
interface ClickedPoint {
  time: string;
  x: number; // pixels from left of chart container
  y: number; // pixels from top of chart container
}

export const StockChart: React.FC<StockChartProps> = ({ prices, buyHoldIndex, recommendation, ticker }) => {
  const locale = useLocale();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [chartType, setChartType] = useState<'candle' | 'line'>('line');
  const [timeRange, setTimeRange] = useState<'1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL'>('5Y');
  const [isLoaded, setIsLoaded] = useState(false);

  // Single-click → show floating badge; click badge → open modal
  const [clickedPoint, setClickedPoint] = useState<ClickedPoint | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ─── Chart Data Grouping ────────────────────────────────────────────────────
  const chartData = React.useMemo(() => {
    const sortedPrices = [...prices]
      .map((p) => {
        const d = new Date(p.date);
        const dateStr = d.toISOString().split('T')[0];
        return { time: dateStr, dateObj: d, open: p.open, high: p.high, low: p.low, close: p.close };
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    if (sortedPrices.length === 0) return [];

    // Append or update today's live price point from ticker.price if available
    if (ticker?.price && ticker.price > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastPoint = sortedPrices[sortedPrices.length - 1];
      if (lastPoint) {
        if (lastPoint.time === todayStr) {
          lastPoint.close = ticker.price;
          lastPoint.high = Math.max(lastPoint.high, ticker.price);
          lastPoint.low = Math.min(lastPoint.low, ticker.price);
        } else if (todayStr > lastPoint.time) {
          sortedPrices.push({
            time: todayStr,
            dateObj: new Date(),
            open: ticker.price,
            high: ticker.price,
            low: ticker.price,
            close: ticker.price,
          });
        }
      }
    }

    if (timeRange === '5Y') {
      const groups: { [k: string]: typeof sortedPrices } = {};
      sortedPrices.forEach((p) => {
        const td = new Date(p.dateObj.getTime());
        const day = td.getDay();
        td.setDate(td.getDate() - day + (day === 0 ? -6 : 1));
        const key = td.toISOString().split('T')[0];
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
      const result = Object.keys(groups).sort().map((k) => {
        const l = groups[k].sort((a, b) => a.time.localeCompare(b.time));
        return { time: k, open: l[0].open, close: l[l.length - 1].close, high: Math.max(...l.map(x => x.high)), low: Math.min(...l.map(x => x.low)) };
      });

      // Ensure the last point on 5Y view uses the exact most recent date and live ticker.price
      if (result.length > 0) {
        const latestPoint = sortedPrices[sortedPrices.length - 1];
        const lastCandle = result[result.length - 1];
        lastCandle.close = latestPoint.close;
        if (latestPoint.time > lastCandle.time) {
          lastCandle.time = latestPoint.time;
        }
      }

      return result;
    }

    if (timeRange === 'ALL') {
      const groups: { [k: string]: typeof sortedPrices } = {};
      sortedPrices.forEach((p) => {
        const key = p.time.substring(0, 7) + '-01';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
      const result = Object.keys(groups).sort().map((k) => {
        const l = groups[k].sort((a, b) => a.time.localeCompare(b.time));
        return { time: l[l.length - 1].time, open: l[0].open, close: l[l.length - 1].close, high: Math.max(...l.map(x => x.high)), low: Math.min(...l.map(x => x.low)) };
      });

      // Ensure the last point on ALL view uses the exact most recent date and live ticker.price
      if (result.length > 0) {
        const latestPoint = sortedPrices[sortedPrices.length - 1];
        const lastCandle = result[result.length - 1];
        lastCandle.close = latestPoint.close;
        if (latestPoint.time > lastCandle.time) {
          lastCandle.time = latestPoint.time;
        }
      }

      return result;
    }

    return sortedPrices.map((p) => ({ time: p.time, open: p.open, high: p.high, low: p.low, close: p.close }));
  }, [prices, timeRange]);

  // ─── EMA Calculations ───────────────────────────────────────────────────────
  const emaData = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const period = 200;
    const ema: { time: string; value: number }[] = [];
    const m = 2 / (period + 1);
    
    let prev = chartData[0]?.close;
    if (prev === undefined || prev === null || isNaN(prev)) {
      return [];
    }
    
    ema.push({ time: chartData[0].time, value: +prev.toFixed(2) });
    for (let i = 1; i < chartData.length; i++) {
      const close = chartData[i]?.close;
      if (close === undefined || close === null || isNaN(close)) continue;
      prev = (close - prev) * m + prev;
      ema.push({ time: chartData[i].time, value: +prev.toFixed(2) });
    }
    return ema;
  }, [chartData]);

  const ema50Data = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const period = 50;
    const ema: { time: string; value: number }[] = [];
    const m = 2 / (period + 1);
    
    let prev = chartData[0]?.close;
    if (prev === undefined || prev === null || isNaN(prev)) {
      return [];
    }
    
    ema.push({ time: chartData[0].time, value: +prev.toFixed(2) });
    for (let i = 1; i < chartData.length; i++) {
      const close = chartData[i]?.close;
      if (close === undefined || close === null || isNaN(close)) continue;
      prev = (close - prev) * m + prev;
      ema.push({ time: chartData[i].time, value: +prev.toFixed(2) });
    }
    return ema;
  }, [chartData]);

  // ─── Opportunity Markers Calculation ─────────────────────────────────────────
  const opportunityMarkers = React.useMemo(() => {
    const markers: any[] = [];
    let lastBasicTime: string | null = null;
    let lastSuperTime: string | null = null;
    let lastUltraTime: string | null = null;

    const ema50Map = new Map((ema50Data || []).map((e) => [e.time, e.value]));
    const ema200Map = new Map((emaData || []).map((e) => [e.time, e.value]));

    const getDaysDiff = (d1: string, d2: string) => {
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
    };

    for (let i = 0; i < chartData.length; i++) {
      const d = chartData[i];
      if (!d || !d.time) continue;

      const ema50Val = ema50Map.get(d.time);
      const ema200Val = ema200Map.get(d.time);

      if (ema50Val !== undefined && ema200Val !== undefined) {
        const price = d.close;
        if (price === undefined || price === null) continue;
        const mid = (ema50Val + ema200Val) / 2;

        if (price > ema200Val && price < mid) {
          if (!lastBasicTime || getDaysDiff(d.time, lastBasicTime) >= 15) {
            markers.push({
              time: d.time,
              position: 'aboveBar',
              color: '#3b82f6', // Blue
              shape: 'circle',
              text: '$',
              size: 1,
            });
            lastBasicTime = d.time;
          }
        } else if (price <= ema200Val && price > ema200Val * 0.9) {
          if (!lastSuperTime || getDaysDiff(d.time, lastSuperTime) >= 15) {
            markers.push({
              time: d.time,
              position: 'aboveBar',
              color: '#10b981', // Green
              shape: 'circle',
              text: '$$',
              size: 1.15,
            });
            lastSuperTime = d.time;
          }
        } else if (price <= ema200Val * 0.9) {
          if (!lastUltraTime || getDaysDiff(d.time, lastUltraTime) >= 15) {
            markers.push({
              time: d.time,
              position: 'aboveBar',
              color: '#eab308', // Gold
              shape: 'circle',
              text: '$$ 🌟',
              size: 1.15,
            });
            lastUltraTime = d.time;
          }
        }
      }
    }
    return markers;
  }, [chartData, ema50Data, emaData]);

  // ─── Theme Color ────────────────────────────────────────────────────────────
  const themeColor = React.useMemo(() => {
    const rec = recommendation.toLowerCase();
    if (buyHoldIndex >= 85 || rec.includes('strong buy')) return '#10b981';
    if (buyHoldIndex >= 75 || rec.includes('buy')) return '#14b8a6';
    if (buyHoldIndex >= 45 || rec.includes('hold') || rec.includes('neutral')) return '#f59e0b';
    return '#f43f5e';
  }, [buyHoldIndex, recommendation]);

  // ─── Chart Initialization ───────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (chartData.length === 0) {
      setIsLoaded(true);
      return;
    }

    const containerWidth = chartContainerRef.current.clientWidth || 600;
    const containerHeight = chartContainerRef.current.clientHeight || 380;

    const chart = createChart(chartContainerRef.current, {
      width: containerWidth,
      height: containerHeight,
      layout: { background: { type: ColorType.Solid, color: '#030712' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(30,41,59,0.3)' }, horzLines: { color: 'rgba(30,41,59,0.3)' } },
      crosshair: {
        mode: 1,
        vertLine: { color: themeColor, width: 1, style: 3, labelBackgroundColor: themeColor },
        horzLine: { color: themeColor, width: 1, style: 3, labelBackgroundColor: themeColor },
      },
      rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)' },
      timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 6 },
    });
    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: `${themeColor}4d`, bottomColor: `${themeColor}00`, lineColor: themeColor, lineWidth: 2,
    });
    areaSeriesRef.current = areaSeries;

    const emaSeries = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'EMA 200' });
    const ema50Series = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'EMA 50' });

    if (chartType === 'candle') {
      candlestickSeries.setData(chartData);
      createSeriesMarkers(candlestickSeries, opportunityMarkers);
      chart.removeSeries(areaSeries);
      areaSeriesRef.current = null;
    } else {
      areaSeries.setData(chartData.map((d) => ({ time: d.time, value: d.close })));
      createSeriesMarkers(areaSeries, opportunityMarkers);
      chart.removeSeries(candlestickSeries);
      candlestickSeriesRef.current = null;
    }

    if (emaData.length > 0) emaSeries.setData(emaData);
    if (ema50Data.length > 0) ema50Series.setData(ema50Data);

    chart.timeScale().fitContent();
    setIsLoaded(true);

    // Single click → show floating detail badge at clicked coordinates
    chart.subscribeClick((param) => {
      if (param.time && param.point) {
        setClickedPoint({
          time: param.time as string,
          x: param.point.x,
          y: param.point.y,
        });
        setSelectedDate(null); // close modal if open
      } else {
        // Clicked outside data area → dismiss badge
        setClickedPoint(null);
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const w = chartContainerRef.current.clientWidth;
        const h = chartContainerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          chartRef.current.applyOptions({
            width: w,
            height: h,
          });
        }
      }
    };

    // Delayed resize trigger for mobile / remote layout renders
    const resizeTimer = setTimeout(handleResize, 100);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      areaSeriesRef.current = null;
    };
  }, [chartData, chartType, themeColor]);

  // ─── Visible Range by Time Range ────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chartData.length === 0 || !isLoaded) return;
    const latest = chartData[chartData.length - 1];
    if (!latest) return;
    const latestDate = new Date(latest.time);
    let fromDate: Date | null = null;
    switch (timeRange) {
      case '1M': fromDate = new Date(latestDate); fromDate.setMonth(fromDate.getMonth() - 1); break;
      case '6M': fromDate = new Date(latestDate); fromDate.setMonth(fromDate.getMonth() - 6); break;
      case 'YTD': fromDate = new Date(latestDate.getFullYear(), 0, 1); break;
      case '1Y': fromDate = new Date(latestDate); fromDate.setFullYear(fromDate.getFullYear() - 1); break;
      case '5Y': fromDate = new Date(latestDate); fromDate.setFullYear(fromDate.getFullYear() - 5); break;
      default: fromDate = null;
    }
    const timer = setTimeout(() => {
      try {
        if (fromDate) {
          chart.timeScale().setVisibleRange({ from: fromDate.toISOString().split('T')[0] as any, to: latest.time as any });
        } else {
          chart.timeScale().fitContent();
        }
      } catch (_) { /* ignore */ }
    }, 50);
    return () => clearTimeout(timer);
  }, [timeRange, chartData, isLoaded]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const toggleChartType = (type: 'candle' | 'line') => { if (type !== chartType) setChartType(type); };

  const formatMarketCap = (n: number) => {
    if (!n) return 'N/A';
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return n.toLocaleString();
  };

  const formatDateLabel = (dateStr: string) => {
    if (timeRange === 'ALL') {
      const [year, month] = dateStr.split('-');
      const names = locale === 'es'
        ? ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
        : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${names[parseInt(month, 10) - 1]} ${year}`;
    }
    return new Date(dateStr).toLocaleDateString(
      locale === 'es' ? 'es-MX' : 'en-US',
      { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
    );
  };

  // ─── Modal Data Computation ──────────────────────────────────────────────────
  const modalData = React.useMemo(() => {
    if (!selectedDate) return null;
    const priceRecord = chartData.find((d) => d.time === selectedDate);
    if (!priceRecord) return null;

    const ema50Val = ema50Data.find((d) => d.time === selectedDate)?.value ?? null;
    const ema200Val = emaData.find((d) => d.time === selectedDate)?.value ?? null;
    const rowDate = new Date(selectedDate);

    let resolvedEps: number | null = null;
    let epsSource: 'real' | 'estimated' | 'mixed' | null = null;
    let resolvedPe: number | null = null;

    const isFund = ['Index','ETF'].includes(ticker.sector ?? '') ||
      (ticker.sector ?? '').toLowerCase().includes('etf') ||
      (ticker.sector ?? '').toLowerCase().includes('fund') ||
      ['QQQ','VOO','SCHD'].includes(ticker.symbol ?? '');

    if ((ticker.historicalEpsQuarterly?.length ?? 0) > 0) {
      const relevant = (ticker.historicalEpsQuarterly ?? [])
        .filter((q: any) => {
          const qd = new Date(q.date);
          if (isFund) return qd.getFullYear() < rowDate.getFullYear() || (qd.getFullYear() === rowDate.getFullYear() && qd.getMonth() <= rowDate.getMonth());
          return qd <= rowDate;
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (isFund && relevant.length > 0) {
        resolvedPe = relevant[0].peRatio ?? null;
        if (resolvedPe && resolvedPe > 0) { resolvedEps = priceRecord.close / resolvedPe; epsSource = 'real'; }
      } else {
        const sliced = relevant.slice(0, 4);
        if (sliced.length === 4) {
          const ttm = sliced.reduce((s: number, q: any) => s + (q.epsDiluted || q.eps || 0), 0);
          resolvedEps = parseFloat(ttm.toFixed(2));
          epsSource = sliced.every((q: any) => q.source === 'real') ? 'real' : sliced.every((q: any) => q.source === 'estimated') ? 'estimated' : 'mixed';
        }
      }
    }

    if (resolvedEps === null) {
      const yr = rowDate.getFullYear();
      if (!isFund && ticker.historicalEps?.[String(yr)]) {
        resolvedEps = ticker.historicalEps[String(yr)].value;
        epsSource = ticker.historicalEps[String(yr)].source;
      } else if (ticker.eps && ticker.eps > 0) {
        const sec = (ticker.sector ?? '').toLowerCase();
        const sym = (ticker.symbol ?? '').toUpperCase();
        const g = sec.includes('technology') || sym === 'QQQ' ? 0.12 : sec.includes('financial') || sec.includes('energy') ? 0.06 : 0.08;
        const base = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date();
        const yrs = Math.max(0, (base.getTime() - rowDate.getTime()) / (365.25 * 86400000));
        resolvedEps = ticker.eps / Math.pow(1 + g, yrs);
        epsSource = 'estimated';
      }
    }

    const sym = (ticker.symbol ?? '').toUpperCase();
    const sec = (ticker.sector ?? '').toLowerCase();
    const dg = sec.includes('technology') || sym === 'QQQ' ? 0.08 : sec.includes('index') || ['SPY','VOO'].includes(sym) ? 0.04 : sym === 'SCHD' ? 0.09 : 0.05;
    const base2 = ticker.updatedAt ? new Date(ticker.updatedAt) : new Date();
    const yrs2 = Math.max(0, (base2.getTime() - rowDate.getTime()) / (365.25 * 86400000));
    const finalDivRate = ticker.dividendRate && ticker.dividendRate > 0 ? ticker.dividendRate / Math.pow(1 + dg, yrs2) : 0;

    const capStr = ticker.cap ?? '0';
    const capNum = parseFloat(capStr);
    const parsedCap = capStr.toUpperCase().includes('T') ? capNum * 1e12 : capStr.toUpperCase().includes('B') ? capNum * 1e9 : capStr.toUpperCase().includes('M') ? capNum * 1e6 : capNum;
    const scaledCap = parsedCap * (priceRecord.close / ticker.price);

    const avgPrice = prices.length > 0 ? prices.reduce((a, p) => a + p.close, 0) / prices.length : 1;
    const ratio = priceRecord.close / avgPrice;
    const deviation = ratio > 1 ? Math.min(12, (ratio - 1) * 25) : Math.max(-12, (ratio - 1) * 25);
    const ratingScore = Math.max(15, Math.min(98, Math.round(ticker.buyHoldIndex + deviation)));

    let rec = 'Hold', badge = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (ratingScore >= 85) { rec = locale === 'es' ? 'Compra Fuerte' : 'Strong Buy'; badge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'; }
    else if (ratingScore >= 75) { rec = locale === 'es' ? 'Comprar' : 'Buy'; badge = 'bg-teal-500/10 text-teal-400 border-teal-500/20'; }
    else if (ratingScore >= 45) { rec = locale === 'es' ? 'Mantener' : 'Hold'; badge = 'bg-amber-500/10 text-amber-400 border-amber-500/20'; }
    else if (ratingScore >= 30) { rec = locale === 'es' ? 'Vender' : 'Sell'; badge = 'bg-orange-500/10 text-orange-400 border-orange-500/20'; }
    else { rec = locale === 'es' ? 'Venta Fuerte' : 'Strong Sell'; badge = 'bg-red-500/10 text-red-400 border-red-500/30'; }

    const peRatio = isFund ? resolvedPe : (resolvedEps && resolvedEps > 0 ? priceRecord.close / resolvedEps : null);
    const divYield = priceRecord.close > 0 ? (finalDivRate / priceRecord.close) * 100 : 0;
    const volume = prices.find(p => new Date(p.date).toISOString().split('T')[0] === selectedDate)?.volume ?? 0;

    return {
      date: selectedDate, close: priceRecord.close, open: priceRecord.open,
      high: priceRecord.high, low: priceRecord.low, ema50: ema50Val, ema200: ema200Val,
      eps: resolvedEps, epsSource, pe: peRatio, divRate: finalDivRate, divYield,
      marketCap: scaledCap, ratingScore, recommendation: rec, badgeClass: badge, volume,
    };
  }, [selectedDate, chartData, emaData, ema50Data, ticker, prices, locale]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl relative">

      {/* Controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {chartType === 'candle' ? 'Candlestick Chart' : 'Close Price Area Chart'}
            <span className="ml-3 text-[10px] text-teal-500/60 font-normal normal-case">
              {locale === 'es' ? '· Clic en la gráfica para ver detalle del punto' : '· Click chart to inspect any data point'}
            </span>
          </span>
          <div className="flex bg-slate-900/60 border border-slate-800/80 rounded-lg p-0.5 text-[10px] font-bold">
            {(['1M', '6M', 'YTD', '1Y', '5Y', 'ALL'] as const).map((range) => (
              <button key={range} onClick={() => { setTimeRange(range); setClickedPoint(null); }}
                className={`px-2.5 py-1.5 rounded transition-all cursor-pointer ${timeRange === range ? 'bg-slate-800 text-teal-400 font-extrabold shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5">
          <button onClick={() => toggleChartType('candle')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${chartType === 'candle' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
            <BarChart2 size={14} /> Candles
          </button>
          <button onClick={() => toggleChartType('line')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${chartType === 'line' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
            <TrendingUp size={14} /> Line
          </button>
        </div>
      </div>

      {/* Chart Canvas — chart.subscribeClick gives us pixel coords for the badge */}
      <div className="relative w-full h-[320px] md:h-[400px]" style={{ minHeight: '320px' }}>
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 text-slate-500 text-xs">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-500 mr-2" />
            Loading chart...
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />

        {/* ── Floating Detail Badge (appears on single click) ── */}
        {clickedPoint && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${clickedPoint.x}px`,
              top: `${clickedPoint.y}px`,
              transform: 'translate(-50%, -110%)',
            }}
          >
            {/* Vertical stem */}
            <div className="flex flex-col items-center gap-0">
              <button
                className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer shadow-xl border border-teal-500/60 whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                  boxShadow: '0 4px 20px rgba(20,184,166,0.4)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(clickedPoint.time);
                  setClickedPoint(null);
                }}
              >
                <Info size={12} />
                {locale === 'es' ? 'Ver Detalle' : 'View Detail'}
              </button>
              {/* Date label */}
              <div className="text-[9px] font-bold text-teal-400/80 mt-0.5 bg-slate-950/90 px-2 py-0.5 rounded-full border border-slate-800/60">
                {formatDateLabel(clickedPoint.time)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Overlay ── */}
      {selectedDate && modalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(3,7,18,0.80)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="relative w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={11} className="text-teal-400" />
                  {locale === 'es' ? 'Instantánea Histórica' : 'Historical Snapshot'}
                </span>
                <h3 className="text-lg font-black text-white">{formatDateLabel(modalData.date)}</h3>
                <span className="text-xs text-slate-400 font-semibold">{ticker.symbol} · {ticker.name}</span>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Score Banner */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-800/60">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">
                  {locale === 'es' ? 'Índice Buy/Hold' : 'Buy/Hold Index'}
                </div>
                <div className="text-2xl font-black text-white">
                  {modalData.ratingScore} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                </div>
              </div>
              <span className={`text-[10px] font-bold border rounded-lg px-3 py-1.5 uppercase tracking-wider ${modalData.badgeClass}`}>
                {modalData.recommendation}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {([
                { label: locale === 'es' ? 'Precio Cierre' : 'Close Price', value: `$${modalData.close.toFixed(2)}`, color: 'text-white' },
                { label: locale === 'es' ? 'Volumen' : 'Volume', value: modalData.volume > 0 ? modalData.volume.toLocaleString() : 'N/A', color: 'text-slate-200' },
                { label: 'High', value: `$${modalData.high.toFixed(2)}`, color: 'text-emerald-400' },
                { label: 'Low', value: `$${modalData.low.toFixed(2)}`, color: 'text-rose-400' },
                { label: 'EMA 50', value: modalData.ema50 ? `$${modalData.ema50.toFixed(2)}` : 'N/A', color: 'text-orange-400', icon: <Activity size={10} className="text-orange-400" /> },
                { label: 'EMA 200', value: modalData.ema200 ? `$${modalData.ema200.toFixed(2)}` : 'N/A', color: 'text-emerald-400', icon: <Activity size={10} className="text-emerald-400" /> },
                { label: 'EPS (TTM)', value: modalData.eps ? `$${modalData.eps.toFixed(2)}` : 'N/A', color: modalData.epsSource === 'real' ? 'text-sky-300' : 'text-amber-300', badge: modalData.epsSource?.substring(0, 3).toUpperCase() },
                { label: 'P/E Ratio', value: modalData.pe ? `${modalData.pe.toFixed(2)}x` : 'N/A', color: 'text-slate-200' },
                { label: 'Div. Rate', value: modalData.divRate > 0 ? `$${modalData.divRate.toFixed(2)}` : '$0.00', color: 'text-slate-200' },
                { label: 'Div. Yield', value: modalData.divYield > 0 ? `${modalData.divYield.toFixed(2)}%` : '0.00%', color: 'text-emerald-400' },
              ] as any[]).map(({ label, value, color, icon, badge }: any) => (
                <div key={label} className="flex flex-col gap-1 p-3 rounded-xl border border-slate-800/60 bg-slate-900/20">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
                    {icon}{label}
                  </span>
                  <span className={`text-sm font-black font-mono ${color}`}>
                    {value}
                    {badge && (
                      <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                        {badge}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {/* Market Cap — full width */}
              <div className="col-span-2 flex flex-col gap-1 p-3 rounded-xl border border-slate-800/60 bg-slate-900/20">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Market Cap</span>
                <span className="text-sm font-black font-mono text-white">{formatMarketCap(modalData.marketCap)}</span>
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-600">
              {locale === 'es' ? 'Clic fuera del panel para cerrar' : 'Click outside to close'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
