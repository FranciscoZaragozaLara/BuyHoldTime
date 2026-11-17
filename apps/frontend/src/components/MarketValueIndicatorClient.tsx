'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { createChart, ColorType, LineSeries, IChartApi, createSeriesMarkers } from 'lightweight-charts';
import { Eye, EyeOff, Calendar, Table, LineChart as ChartIcon, Sparkles } from 'lucide-react';
import { IndicatorDetails } from '@/services/api';
import { TOKENS } from '@/lib/designTokens';
import { getApiBase } from '@/lib/apiBase';
import { buildValuationChart, monthlyOpportunityMarkers, type DailyValuation, type Instrument } from '@/lib/valuationChart';
import { BHT_BANDS, bhtBandColor } from '@/components/backtesting/bhtBands';
import { BhtDetailPopover, bhtLeaveGuard, useBhtDetail } from '@/components/backtesting/BhtDetail';

interface MarketValueIndicatorClientProps {
  shillerPeData: IndicatorDetails;
  peRatioData: IndicatorDetails;
  sp500PriceData: IndicatorDetails;
  sp500DividendData: IndicatorDetails;
  sp500EarningsData: IndicatorDetails;
  cpiData: IndicatorDetails;
  rateGs10Data: IndicatorDetails;
  excessCapeYieldData: IndicatorDetails;
  /** P/E estimado actual (WSJ / Birinyi), el mismo del termómetro. */
  fwdPe?: number | null;
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
  fwdPe = null,
}) => {
  const locale = useLocale();
  
  // Visibility states for the 3 main chart lines
  const [showSp500Price, setShowSp500Price] = useState(true);
  const [showPeRatio, setShowPeRatio] = useState(true);
  const [showShillerPe, setShowShillerPe] = useState(true);
  const [showBht, setShowBht] = useState(true);
  // Un instrumento a la vez: precio, EMA 50/200 y P/E son los suyos; CAPE y BHT no cambian.
  const [instrument, setInstrument] = useState<Instrument>('spx');
  const INSTRUMENTS: Record<Instrument, { label: string; color: string; pe: string }> = {
    spx: { label: 'S&P 500', color: TOKENS.accent, pe: 'P/E S&P 500' },
    ndx: { label: 'Nasdaq 100 (QQQ)', color: '#3b82f6', pe: 'P/E Nasdaq 100' },
    tqqq: { label: 'TQQQ', color: '#d946ef', pe: locale === 'es' ? 'P/E Nasdaq 100 (subyacente)' : 'P/E Nasdaq 100 (underlying)' },
  };
  const inst = INSTRUMENTS[instrument];
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
    bht: number | null;
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

  // Serie diaria desde 1990 (S&P 500, P/E registrado, CAPE): se pide después de pintar la mensual y la
  // reemplaza en cuanto llega. Si falla, la gráfica se queda con la serie mensual.
  const [daily, setDaily] = useState<DailyValuation | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${getApiBase()}/indicators/valuation-daily`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: DailyValuation | null) => { if (alive && j && Array.isArray(j.dates) && j.dates.length) setDaily(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Detalle del BHT en el hover (mismo popover que el Timeline del termómetro) + fila forward de esa fecha.
  const bhtDet = useBhtDetail();
  const [fwdCache, setFwdCache] = useState<Record<string, unknown>>({});
  const loadFwd = (d: string) => {
    if (fwdCache[d] !== undefined) return;
    setFwdCache((m) => ({ ...m, [d]: null }));
    const from = new Date(d); from.setDate(from.getDate() - 7);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown[]) => setFwdCache((m) => ({ ...m, [d]: rows.length ? rows[rows.length - 1] : null })))
      .catch(() => {});
  };

  // Puntos de la gráfica (mensual antes de 1990, diaria después) con EMA 50/200 y marcadores mensuales.
  const points = useMemo(() => buildValuationChart(mergedData, daily, instrument), [mergedData, daily, instrument]);
  const opportunityMarkers = useMemo(() => monthlyOpportunityMarkers(points), [points]);

  // Lightweight charts initialization and synchronization
  useEffect(() => {
    if (!chartContainerRef.current || points.length === 0) return;

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
      color: inst.color,
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: false,
      title: inst.label,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: TOKENS.elevated, // Orange
      lineWidth: 2,
      lineStyle: 1, // dashed
      priceScaleId: 'right',
      priceLineVisible: false,
      visible: showMa50,
      title: 'EMA 50',
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: TOKENS.favorable, // Emerald
      lineWidth: 2,
      lineStyle: 1, // dashed
      priceScaleId: 'right',
      priceLineVisible: false,
      visible: showMa200,
      title: 'EMA 200',
    });

    const peSeries = chart.addSeries(LineSeries, {
      color: TOKENS.caution,
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

    // BHT Index (0-100) en su propia escala superpuesta y fija, con el color del semáforo en cada punto.
    const bhtSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      priceScaleId: 'bht',
      priceLineVisible: false,
      lastValueVisible: true,
      visible: showBht,
      title: 'BHT',
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    chart.priceScale('bht').applyOptions({ visible: false, scaleMargins: { top: 0.05, bottom: 0.05 } });

    // Populate data format suitable for lightweight charts
    const chartPoints = points;
    const byTime = new Map(points.map((p) => [p.time, p]));

    // Sin dato → punto vacío (hueco), no 0: el 0 dibujaba caídas verticales al final de cada serie.
    type PointKey = 'sp500Price' | 'peRatio' | 'shillerPe' | 'sp500PriceMa50' | 'sp500PriceMa200';
    const line = (k: PointKey) => chartPoints.map(p => (p[k] == null ? { time: p.time } : { time: p.time, value: p[k] as number }));
    if (showSp500Price) {
      sp500Series.setData(line('sp500Price'));
      createSeriesMarkers(sp500Series, opportunityMarkers);
    }
    
    if (showMa50) ema50Series.setData(line('sp500PriceMa50'));
    if (showMa200) ema200Series.setData(line('sp500PriceMa200'));
    if (showPeRatio) peSeries.setData(line('peRatio'));
    if (showShillerPe) shillerPeSeries.setData(line('shillerPe'));
    if (showBht) {
      bhtSeries.setData(chartPoints.map(p => (p.bht == null ? { time: p.time } : { time: p.time, value: p.bht, color: bhtBandColor(p.bht) })));
      bhtSeries.createPriceLine({ price: 50, color: 'rgba(226,232,240,0.35)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
    }

    // Reference lines
    let overvaluedLine: any = null;
    let maxPriceLine: any = null;

    if (showShillerPe) {
      overvaluedLine = shillerPeSeries.createPriceLine({
        price: 39,
        color: TOKENS.elevated,
        lineWidth: 2,
        lineStyle: 1, // dashed
        axisLabelVisible: true,
        title: locale === 'es' ? 'Mercado Sobrevalorado' : 'Overvalued Market',
      });
    }

    // La gráfica se recrea al cambiar datos o filtros: lo pendiente no debe pintar sobre una instancia eliminada.
    let disposed = false;
    const updateMaxLine = () => {
      if (disposed) return;
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
          color: TOKENS.risk,
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

      const matched = byTime.get(timeStr);
      if (matched?.daily && matched.bht != null && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        // param.point cuenta desde el área de trazo: se suma el ancho del eje izquierdo para tener la posición real del cursor.
        bhtDet.setHover({ d: timeStr, x: rect.left + chart.priceScale('left').width() + param.point.x, y: rect.top + param.point.y });
        bhtDet.load(timeStr);
        loadFwd(timeStr);
      } else {
        bhtDet.scheduleClear();
      }
      if (matched) {
        setHoveredData({
          date: matched.daily ? timeStr : timeStr.substring(0, 7),
          sp500Price: matched.sp500Price ?? null,
          sp500Ema50: matched.sp500PriceMa50 ?? null,
          sp500Ema200: matched.sp500PriceMa200 ?? null,
          peRatio: matched.peRatio ?? null,
          shillerPe: matched.shillerPe ?? null,
          bht: matched.bht ?? null,
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

    const maxLineTimer = setTimeout(updateMaxLine, 100);

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
    const containerEl = chartContainerRef.current;
    const onLeave = (e: MouseEvent) => bhtLeaveGuard(e, bhtDet);
    containerEl.addEventListener('mouseleave', onLeave);

    return () => {
      resizeObserver.disconnect();
      containerEl.removeEventListener('mouseleave', onLeave);
      disposed = true;
      clearTimeout(maxLineTimer);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updateMaxLine);
      chart.remove();
      chartRef.current = null;
    };
  }, [
    points,
    opportunityMarkers,
    showSp500Price,
    showPeRatio,
    showShillerPe,
    showBht,
    instrument,
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
    const [year, month, day] = dateKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, day ? Number(day) : 15);
    return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      ...(day ? { day: 'numeric' as const } : {}),
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-10">
      
      {/* Visual Header / Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-accent-400 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'VALOR S&P 500' : 'S&P 500 PRICE'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-accent-400">
            {sp500PriceData.indicator.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Último cierre del índice' : 'Latest index close'}
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-caution-500 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'P/E RATIO REGULAR' : 'REGULAR P/E RATIO'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-caution-400">
            {peRatioData.indicator.currentValue.toFixed(2)}x
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Múltiplo de ganancias tradicional' : 'Traditional price-to-earnings multiple'}
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-risk-500 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'SHILLER PE (CAPE)' : 'SHILLER PE (CAPE)'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-risk-400">
            {shillerPeData.indicator.currentValue.toFixed(2)}x
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Ajustado por inflación (promedio 10 años)' : 'Inflation-adjusted 10-year earnings multiple'}
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 text-favorable-500 group-hover:scale-110 transition duration-300">
            <Sparkles size={48} />
          </div>
          <p className="text-xs text-slate-500 font-bold tracking-wider uppercase">
            {locale === 'es' ? 'P/E ESTIMADO (FORWARD)' : 'FORWARD P/E'}
          </p>
          <p className="text-3xl font-extrabold mt-2 text-favorable-400">
            {fwdPe != null ? `${fwdPe.toFixed(2)}x` : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {locale === 'es' ? 'Precio ÷ EPS estimado a 12 meses (WSJ / Birinyi)' : 'Price ÷ 12-month estimated EPS (WSJ / Birinyi)'}
          </p>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ChartIcon className="text-accent-400" size={20} />
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
                      ? 'bg-accent-500 text-slate-950 shadow-md'
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
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-semibold">{locale === 'es' ? 'Instrumento:' : 'Instrument:'}</span>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
            {(Object.keys(INSTRUMENTS) as Instrument[]).map((k) => (
              <button key={k} type="button" onClick={() => setInstrument(k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${instrument === k ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: INSTRUMENTS[k].color }} />
                {INSTRUMENTS[k].label}
              </button>
            ))}
          </div>
          {instrument !== 'spx' && <span className="text-slate-500">{locale === 'es' ? 'Desde 1999 (QQQ) / 2010 (TQQQ). El CAPE es del S&P 500.' : 'Since 1999 (QQQ) / 2010 (TQQQ). CAPE is the S&P 500\'s.'}</span>}
        </div>
        <div className="flex flex-wrap gap-4 text-xs bg-slate-900/40 p-4 rounded-xl border border-slate-900 min-h-[104px] md:h-[104px] content-start">
          <button
            onClick={() => setShowSp500Price(!showSp500Price)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showSp500Price
                ? 'bg-accent-500/10 border-accent-500/30 text-accent-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showSp500Price ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: inst.color }} />
            <span>{inst.label}{hoveredData?.sp500Price ? `: $${hoveredData.sp500Price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}</span>
          </button>

          <button
            onClick={() => setShowPeRatio(!showPeRatio)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showPeRatio
                ? 'bg-caution-500/10 border-caution-500/30 text-caution-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showPeRatio ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-caution-500" />
            <span>{inst.pe}{hoveredData?.peRatio ? `: ${hoveredData.peRatio.toFixed(2)}x` : ''}</span>
          </button>

          <button
            onClick={() => setShowShillerPe(!showShillerPe)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showShillerPe
                ? 'bg-risk-500/10 border-risk-500/30 text-risk-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showShillerPe ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-risk-500" />
            <span>Shiller P/E Ratio (CAPE){hoveredData?.shillerPe ? `: ${hoveredData.shillerPe.toFixed(2)}x` : ''}</span>
          </button>

          <button
            onClick={() => setShowBht(!showBht)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showBht
                ? 'bg-slate-800/60 border-slate-600 text-slate-200'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
            title={locale === 'es' ? 'BHT Index (0-100) en escala propia, con el color del semáforo' : 'BHT Index (0-100) on its own scale, colored by the traffic light'}
          >
            {showBht ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: `linear-gradient(90deg,${BHT_BANDS.map((b) => b.color).join(',')})` }} />
            <span>BHT Index{hoveredData?.bht != null ? `: ${hoveredData.bht.toFixed(1)}` : ''}</span>
          </button>

          <button
            onClick={() => setShowMa50(!showMa50)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showMa50
                ? 'bg-elevated-500/10 border-elevated-500/30 text-elevated-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showMa50 ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-elevated-500" />
            <span>EMA 50 {inst.label}{hoveredData?.sp500Ema50 ? `: $${hoveredData.sp500Ema50.toFixed(2)}` : ''}</span>
          </button>

          <button
            onClick={() => setShowMa200(!showMa200)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
              showMa200
                ? 'bg-favorable-500/10 border-favorable-500/30 text-favorable-300'
                : 'bg-slate-950 border-slate-900 text-slate-600'
            }`}
          >
            {showMa200 ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="w-2.5 h-2.5 rounded-full bg-favorable-500" />
            <span>EMA 200 {inst.label}{hoveredData?.sp500Ema200 ? `: $${hoveredData.sp500Ema200.toFixed(2)}` : ''}</span>
          </button>
        </div>

        {/* Responsive Line Chart using TradingView's Lightweight Charts */}
        <div className="relative">
          {hoveredData?.date && (
            <div className="absolute top-2 left-2 z-10 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded bg-slate-950/80 text-slate-300 border border-slate-800 backdrop-blur-sm pointer-events-none">
              <span className="text-accent-400 font-bold">{formatDateLabel(hoveredData.date)}</span>
            </div>
          )}
          <div ref={chartContainerRef} className="h-[400px] w-full" />
          {bhtDet.hover && (
            <BhtDetailPopover
              hover={bhtDet.hover}
              detail={bhtDet.cache[bhtDet.hover.d]}
              forward={fwdCache[bhtDet.hover.d]}
              onLeave={() => bhtDet.scheduleClear()} onHold={() => bhtDet.cancelClear()}
            />
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Table className="text-accent-400" size={20} />
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
                  <td className="p-3 text-accent-400 font-semibold">
                    {item.sp500Price !== undefined 
                      ? `$${item.sp500Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-'}
                  </td>
                  <td className="p-3 text-caution-500 font-semibold">
                    {item.peRatio !== undefined ? `${item.peRatio.toFixed(2)}x` : '-'}
                  </td>
                  <td className="p-3 text-risk-500 font-semibold">
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
                  <td className="p-3 text-accent-500 font-medium">
                    {item.rateGs10 !== undefined ? `${item.rateGs10.toFixed(2)}%` : '-'}
                  </td>
                  <td className="p-3 text-favorable-500 font-semibold">
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
