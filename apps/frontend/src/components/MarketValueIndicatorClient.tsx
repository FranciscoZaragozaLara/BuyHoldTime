'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { athColor } from '@/lib/athDrawdown';
import { createChart, ColorType, LineSeries, IChartApi, createSeriesMarkers, type Time } from 'lightweight-charts';
import { Crown, Eye, EyeOff, LineChart as ChartIcon } from 'lucide-react';
import { IndicatorDetails } from '@/services/api';
import { TOKENS } from '@/lib/designTokens';
import { getApiBase } from '@/lib/apiBase';
import { athDrawdownLine, buildValuationChart, buyLadderMarkers, netLadderMarkers, sellLadderMarkers, signalMarkers, thinMarkers, MARKER_MIN_PX, NET_COLOR, type BuyLadderEvent, type DailyValuation, type Instrument, type NetLadderEvent, type SellLadderEvent } from '@/lib/valuationChart';
import { BHT_BANDS, bhtBandColor } from '@/components/backtesting/bhtBands';
import { BhtDetailPopover, BhtHoverTip, useBhtDetail, useBhtPin } from '@/components/backtesting/BhtDetail';
import { attachBhtChartPin, type BhtPinNav, type BhtPoint } from '@/components/backtesting/bhtChartPin';

interface MarketValueIndicatorClientProps {
  shillerPeData: IndicatorDetails;
  peRatioData: IndicatorDetails;
  sp500PriceData: IndicatorDetails;
  /** P/E estimado actual (WSJ / Birinyi), el mismo del termómetro. */
}

export const MarketValueIndicatorClient: React.FC<MarketValueIndicatorClientProps> = ({
  shillerPeData,
  peRatioData,
  sp500PriceData,
}) => {
  const locale = useLocale();
  
  // Líneas visibles: por defecto solo el instrumento base y el BHT; P/E, CAPE y SMA se encienden a mano.
  const [showSp500Price, setShowSp500Price] = useState(true);
  const [showPeRatio, setShowPeRatio] = useState(false);
  const [showShillerPe, setShowShillerPe] = useState(false);
  const [showBht, setShowBht] = useState(true);
  // Un instrumento a la vez: precio, SMA 50/200 y P/E son los suyos; CAPE y BHT no cambian.
  const [instrument, setInstrument] = useState<Instrument>('spx');
  // P/E del Nasdaq 100: cálculo propio con reportes a la SEC (NDX_PE_EDGAR del backend), solo desde 2011.
  const ndxPeNote = locale === 'es'
    ? 'P/E propio desde 2011: capitalización total ÷ utilidad neta de 12 meses de los miembros del índice en cada fecha (reportes a la SEC; sin las extranjeras que no reportan trimestres)'
    : 'Our own P/E since 2011: total market cap ÷ trailing 12-month net income of the index members at each date (SEC filings; excludes foreign filers without quarterly reports)';
  const INSTRUMENTS: Record<Instrument, { label: string; color: string; pe: string; peNote?: string }> = {
    spx: { label: 'S&P 500', color: TOKENS.accent, pe: 'P/E S&P 500' },
    ndx: { label: 'Nasdaq 100 (QQQ)', color: '#3b82f6', pe: 'P/E Nasdaq 100', peNote: ndxPeNote },
    tqqq: { label: 'TQQQ', color: '#d946ef', pe: locale === 'es' ? 'P/E Nasdaq 100 (subyacente)' : 'P/E Nasdaq 100 (underlying)', peNote: ndxPeNote },
  };
  const inst = INSTRUMENTS[instrument];
  const [showMa50, setShowMa50] = useState(false);
  const [showMa200, setShowMa200] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Zoom y posición vigentes: la gráfica se recrea al prender/apagar series o cambiar de instrumento y debe
  // conservarlos; solo los botones de rango (1Y…ALL) los cambian.
  // Vista guardada; `atEnd` = llegaba a la última sesión (así sigue al final cuando llegan datos más nuevos).
  const viewRef = useRef<{ from: any; to: any; atEnd?: boolean } | null>(null);
  const lastTimeframeRef = useRef<string | null>(null);

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
  // Íconos parpadeantes del último ATH (corona) y del valor actual (punto en vivo), encima de la gráfica en píxeles.
  type AthIcon = { x: number; y: number; label: string } | null;
  const [athIcons, setAthIcons] = useState<{ ath: AthIcon; now: AthIcon; color: string } | null>(null);

  // Serie mensual (precio, P/E y CAPE) por mes
  const mergedData = useMemo(() => {
    const map: Record<string, { 
      date: string; 
      sp500Price?: number; 
      peRatio?: number; 
      shillerPe?: number;
    }> = {};

    // Helper to extract clean YYYY-MM
    const addEntries = (
      entries: typeof shillerPeData.history, 
      key: 'shillerPe' | 'peRatio' | 'sp500Price'
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

    // Convert to sorted array
    const sorted = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));

    return sorted;
  }, [shillerPeData, peRatioData, sp500PriceData]);

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

  // Detalle del BHT (mismo popover que el Timeline del termómetro) + fila forward de esa fecha.
  // El cursor muestra un tooltip compacto; un clic fija el popover completo (ver bhtChartPin).
  const bhtDet = useBhtDetail();
  const bhtPin = useBhtPin();
  // Navegación del encabezado del popover fijo (‹ calendario ›), la registra attachBhtChartPin.
  const [pinNav, setPinNav] = useState<BhtPinNav | null>(null);
  const dailyIdx = useMemo(() => new Map((daily?.dates ?? []).map((d, i) => [d, i])), [daily]);
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

  // Callbacks vigentes para los manejadores de la gráfica (se registran una vez por cada gráfica creada).
  const pinCb = useRef({ tip: (_p: BhtPoint | null) => {}, pin: (_p: BhtPoint) => {}, pinned: (): string | null => null });
  pinCb.current = {
    tip: bhtPin.setTip,
    pin: (p) => { bhtPin.setPin(p); bhtDet.load(p.d); loadFwd(p.d); },
    pinned: bhtPin.pinnedDate,
  };

  // Puntos de la gráfica (mensual antes de 1990, diaria después) con SMA 50/200 y señales BHT × tendencia.
  const points = useMemo(() => buildValuationChart(mergedData, daily, instrument), [mergedData, daily, instrument]);
  // Señales BHT × tendencia ($$, $, ⚠) y cruces SMA 50/200 (Golden / Death Cross) sobre la línea del precio.
  // Escaleras de compra (T0–T4) y venta (V1–V5): el mismo motor de la pestaña Tranches (S&P 500 → ruta VOO; QQQ y TQQQ → ruta QQQ).
  const [ladder, setLadder] = useState<Record<string, { buys: BuyLadderEvent[]; sells: SellLadderEvent[]; net: NetLadderEvent[] }>>({});
  const ladderRoute = instrument === 'spx' ? 'spx' : 'qqq';
  useEffect(() => {
    if (ladder[ladderRoute]) return;
    fetch(`${getApiBase()}/api/backtesting/tranche-ladder?instrument=${ladderRoute}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { buys?: BuyLadderEvent[]; sells?: SellLadderEvent[]; net?: NetLadderEvent[] } | null) => { if (j?.buys && j?.sells) setLadder((m) => ({ ...m, [ladderRoute]: { buys: j.buys!, sells: j.sells!, net: j.net ?? [] } })); })
      .catch(() => {});
  }, [ladderRoute, ladder]);
  const opportunityMarkers = useMemo(() => {
    const times = new Set(points.filter((p) => p.daily).map((p) => p.time));
    const L = ladder[ladderRoute];
    return [...signalMarkers(points, locale, { buys: false }), ...buyLadderMarkers(L?.buys, times), ...netLadderMarkers(L?.net, times), ...sellLadderMarkers(L?.sells, times)].sort((a, b) => a.time.localeCompare(b.time));
  }, [points, locale, ladder, ladderRoute]);
  // Caída desde el máximo (ATH o máximo de 5 años) para la línea y la badge de la gráfica.
  const athDl = useMemo(() => athDrawdownLine(points), [points]);

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
        // Aprovecha la altura: el pico de la vista queda cerca del borde (deja lugar a la badge y a las señales de arriba).
        scaleMargins: { top: 0.12, bottom: 0.04 },
      },
      leftPriceScale: {
        borderColor: 'rgba(30,41,59,0.3)',
        visible: showPeRatio || showShillerPe,
      },
      timeScale: {
        borderColor: 'rgba(30,41,59,0.3)',
        rightOffset: 5,
        barSpacing: 6,
        // ~10 000 sesiones desde 1871: con el mínimo por defecto (0.5 px) "ALL" solo cabía desde ~2018.
        minBarSpacing: 0.05,
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
      title: 'SMA 50',
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: TOKENS.favorable, // Emerald
      lineWidth: 2,
      lineStyle: 1, // dashed
      priceScaleId: 'right',
      priceLineVisible: false,
      visible: showMa200,
      title: 'SMA 200',
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

    // BHT Index (0-100) en su propia escala superpuesta, con el color del semáforo en cada punto. La escala se ajusta al
    // tramo visible (zoom o 1Y/3Y/5Y/10Y…) para que no se vea plano cuando no hubo extremos; nunca sale de 0–100.
    const bhtSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      priceScaleId: 'bht',
      priceLineVisible: false,
      lastValueVisible: true,
      visible: showBht,
      title: 'BHT',
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
        const r = original();
        if (!r?.priceRange) return r;
        const { minValue, maxValue } = r.priceRange;
        // Margen de 2 puntos para que la línea no toque los bordes; recortado a 0–100.
        return { ...r, priceRange: { minValue: Math.max(0, minValue - 2), maxValue: Math.min(100, maxValue + 2) } };
      },
    });
    chart.priceScale('bht').applyOptions({ visible: false, scaleMargins: { top: 0.05, bottom: 0.05 } });

    // Populate data format suitable for lightweight charts
    const chartPoints = points;
    const byTime = new Map(points.map((p) => [p.time, p]));

    // Sin dato → punto vacío (hueco), no 0: el 0 dibujaba caídas verticales al final de cada serie.
    type PointKey = 'sp500Price' | 'peRatio' | 'shillerPe' | 'sp500PriceMa50' | 'sp500PriceMa200';
    const line = (k: PointKey) => chartPoints.map(p => (p[k] == null ? { time: p.time } : { time: p.time, value: p[k] as number }));
    // Señales con raleo según el zoom: distancia mínima en píxeles por carril, convertida a sesiones con el ancho
    // de cada sesión en pantalla; se recalcula al hacer zoom o desplazar (cruces y entradas tienen prioridad).
    let detachMarkers = () => {};
    if (showSp500Price) {
      sp500Series.setData(line('sp500Price'));
      const markerApi = createSeriesMarkers(sp500Series, []);
      const idxOf = new Map(chartPoints.map((p, k) => [p.time, k]));
      const applyMarkers = () => {
        const ts = chart.timeScale();
        const lr = ts.getVisibleLogicalRange();
        const bars = lr ? Math.max(1, lr.to - lr.from) : chartPoints.length;
        const pxPerBar = ts.width() / bars;
        const gap = Math.ceil(MARKER_MIN_PX / Math.max(pxPerBar, 0.001));
        markerApi.setMarkers(thinMarkers(opportunityMarkers, (t) => idxOf.get(t), gap)
          .map(({ time, position, color, shape, text, size }) => ({ time, position, color, shape, text, size })));
      };
      let raf = 0;
      const onRange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyMarkers); };
      chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
      onRange();
      detachMarkers = () => { cancelAnimationFrame(raf); try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange); } catch { /* noop */ } };
    }
    
    // Caída desde el máximo (ATH, o máximo de 5 años): recta del pico al precio actual. No entra en el autoescalado,
    // así que si el pico queda fuera de la vista la línea entra por el borde (el "techo").
    let detachAth = () => {};
    if (showSp500Price) {
      const dl = athDl;
      if (dl && dl.from.time < dl.to.time) {
        const c = athColor(dl.tone);
        const athSeries = chart.addSeries(LineSeries, {
          color: c, lineWidth: 2, lineStyle: 3, priceScaleId: 'right', priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, autoscaleInfoProvider: () => null,
        });
        athSeries.setData([dl.from, dl.to]);
        // Techo: nivel del máximo en toda la gráfica, con su etiqueta en el eje (se ve aunque la recta sea corta).
        athSeries.createPriceLine({ price: dl.ath, color: `${c}80`, lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: dl.window5y ? 'ATH 5Y' : 'ATH' });
        const es = locale === 'es';
        const ath = dl.window5y ? 'ATH 5Y' : 'ATH';
        const pctTxt = dl.pct > -0.05 ? null : `${dl.pct.toFixed(1)}%`;
        // El texto del pico se oculta si la recta mide pocos píxeles (vista lejana): se encimaría con el del punto actual.
        const athMarkers = createSeriesMarkers(athSeries, []);
        const peakText = `${ath} ${dl.ath.toFixed(2)}${pctTxt ? ` (${pctTxt})` : ''}`;
        const applyAth = () => {
          const ts = chart.timeScale();
          const x0 = ts.timeToCoordinate(dl.from.time as Time), x1 = ts.timeToCoordinate(dl.to.time as Time);
          const far = x0 == null || x1 == null || Math.abs(x1 - x0) >= 100;
          // Sin círculos de marcador: los puntos van como íconos HTML parpadeantes (corona = ATH, punto = hoy).
          athMarkers.setMarkers([]);
          const off = chart.priceScale('left').width();
          const plotW = ts.width();
          const at = (x: number | null, price: number): { x: number; y: number } | null => {
            const y = athSeries.priceToCoordinate(price);
            return x == null || y == null || x < 0 || x > plotW ? null : { x: x + off, y };
          };
          const pa = at(x0, dl.ath), pn = at(x1, dl.to.value);
          setAthIcons({
            color: c,
            ath: pa ? { ...pa, label: far ? peakText : '' } : null,
            now: pn ? { ...pn, label: pctTxt ?? (es ? `En ${ath}` : `At ${ath}`) } : null,
          });
        };
        let rafAth = 0;
        // Doble cuadro: la escala de precios se reajusta (autoescala) después del cambio de rango; medir antes deja los
        // íconos desfasados.
        const onAthRange = () => { cancelAnimationFrame(rafAth); rafAth = requestAnimationFrame(() => { rafAth = requestAnimationFrame(applyAth); }); };
        chart.timeScale().subscribeVisibleLogicalRangeChange(onAthRange);
        onAthRange();
        // Al redimensionar también cambian las coordenadas de los íconos.
        const roAth = new ResizeObserver(onAthRange);
        if (chartContainerRef.current) roAth.observe(chartContainerRef.current);
        detachAth = () => { cancelAnimationFrame(rafAth); roAth.disconnect(); setAthIcons(null); try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onAthRange); } catch { /* noop */ } };
      }
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

    // Rango visible: se conserva el de antes de recrear la gráfica salvo que se haya pulsado un botón de rango.
    const timeframeChanged = lastTimeframeRef.current !== timeframe;
    lastTimeframeRef.current = timeframe;
    const latest = chartPoints[chartPoints.length - 1];
    // Se fija con índices (setVisibleLogicalRange) para poder dejar ~40 px libres a la derecha cuando la vista llega
    // al final, a cualquier zoom: ahí se lee la etiqueta de la caída desde ATH. setVisibleRange pega la última sesión al eje.
    const isoOf = (t: Time): string => typeof t === 'string' ? t : typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 10)
      : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
    const setView = (fromIso: string, toIso: string) => {
      const last = chartPoints.length - 1;
      let fromIdx = chartPoints.findIndex((p) => p.time >= fromIso);
      if (fromIdx < 0) fromIdx = 0;
      let toIdx = last;
      while (toIdx > fromIdx && chartPoints[toIdx].time > toIso) toIdx--;
      const ts = chart.timeScale();
      const w = ts.width() || (chartContainerRef.current?.clientWidth ?? 0) - 60;
      const pad = toIdx === last && w > 80 ? (40 * (toIdx - fromIdx)) / (w - 40) : 0;
      ts.setVisibleLogicalRange({ from: fromIdx, to: toIdx + pad });
    };
    let restored = false;
    if (!timeframeChanged && viewRef.current) {
      // Si la vista llegaba al final (p. ej. la serie mensual antes de que cargue la diaria), se extiende al último día.
      try { setView(isoOf(viewRef.current.from), viewRef.current.atEnd && latest ? latest.time : isoOf(viewRef.current.to)); restored = true; } catch { /* rango inválido: se aplica el del botón */ }
    }
    if (latest && !restored) {
      const years: Record<string, number> = { '1Y': 1, '3Y': 3, '5Y': 5, '10Y': 10, '25Y': 25 };
      const fromDate = new Date(latest.time);
      if (years[timeframe]) fromDate.setFullYear(fromDate.getFullYear() - years[timeframe]);
      if (years[timeframe]) setView(fromDate.toISOString().slice(0, 10), latest.time);
      else chart.timeScale().fitContent();
    }

    // Guarda cada cambio de zoom/desplazamiento (después de aplicar el rango inicial).
    const rememberView = (r: { from: any; to: any } | null) => { if (r) viewRef.current = { from: r.from, to: r.to, atEnd: !!latest && isoOf(r.to) >= latest.time }; };
    chart.timeScale().subscribeVisibleTimeRangeChange(rememberView);

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
    // Tooltip compacto al pasar el cursor, clic para fijar el detalle y ← → día a día.
    const navDates = chartPoints.filter((p) => p.daily && p.bht != null).map((p) => p.time);
    const detachPin = attachBhtChartPin(chart, chartContainerRef.current, {
      resolve: (d) => { const m = byTime.get(d); return m?.daily && m.bht != null ? d : null; },
      dates: () => navDates,
      anchor: () => showBht ? { series: bhtSeries, value: (d) => byTime.get(d)?.bht ?? null }
        : showSp500Price ? { series: sp500Series, value: (d) => byTime.get(d)?.sp500Price ?? null } : null,
      onTip: (p) => pinCb.current.tip(p),
      onPin: (p) => pinCb.current.pin(p),
      pinned: () => pinCb.current.pinned(),
      register: setPinNav,
    });

    return () => {
      resizeObserver.disconnect();
      detachPin();
      disposed = true;
      clearTimeout(maxLineTimer);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updateMaxLine);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rememberView);
      detachMarkers();
      detachAth();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    points,
    opportunityMarkers,
    athDl,
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
            title={inst.peNote}
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
            <span>SMA 50 {inst.label}{hoveredData?.sp500Ema50 ? `: $${hoveredData.sp500Ema50.toFixed(2)}` : ''}</span>
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
            <span>SMA 200 {inst.label}{hoveredData?.sp500Ema200 ? `: $${hoveredData.sp500Ema200.toFixed(2)}` : ''}</span>
          </button>
        </div>

        {/* Responsive Line Chart using TradingView's Lightweight Charts */}
        <div className="relative">
          {hoveredData?.date && (
            <div className="absolute top-2 left-2 z-10 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded bg-slate-950/80 text-slate-300 border border-slate-800 backdrop-blur-sm pointer-events-none">
              <span className="text-accent-400 font-bold">{formatDateLabel(hoveredData.date)}</span>
            </div>
          )}
          {showSp500Price && athDl && (() => {
            const c = athColor(athDl.tone);
            const es = locale === 'es';
            const ath = athDl.window5y ? 'ATH 5Y' : 'ATH';
            const at = athDl.pct > -0.05;
            return (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold backdrop-blur-sm whitespace-nowrap"
                style={{ color: c, borderColor: `${c}66`, background: `${c}1a` }}
                title={`${ath} ${athDl.ath.toFixed(2)} · ${athDl.athDate}`}>
                <span className="font-mono text-sm">{at ? '▲' : '▼'} {at ? (es ? `En ${ath}` : `At ${ath}`) : `${athDl.pct.toFixed(1)}%`}</span>
                {!at && <span className="text-slate-400 font-normal">{es ? 'desde' : 'from'} {ath} {athDl.ath.toFixed(2)} · {formatDateLabel(athDl.athDate)}</span>}
              </div>
            );
          })()}
          <div className="relative">
            <div ref={chartContainerRef} data-bht-chart className="h-[400px] w-full" />
            {athIcons && (
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
                {athIcons.ath && (
                  <div className="absolute flex flex-col items-center" style={{ left: athIcons.ath.x, top: athIcons.ath.y, transform: 'translate(-50%, -100%)', color: athIcons.color }}>
                    {athIcons.ath.label && <span className="mb-0.5 whitespace-nowrap font-mono text-[10px] font-semibold">{athIcons.ath.label}</span>}
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: athIcons.color }} />
                      <Crown size={14} strokeWidth={2.5} className="relative drop-shadow" fill="currentColor" fillOpacity={0.25} />
                    </span>
                  </div>
                )}
                {athIcons.now && (
                  <div className="absolute flex flex-col items-center" style={{ left: athIcons.now.x, top: athIcons.now.y, transform: 'translate(-50%, -50%)', color: athIcons.color }}>
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: athIcons.color }} />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-slate-950" style={{ background: athIcons.color }} />
                    </span>
                    <span className="mt-0.5 whitespace-nowrap font-mono text-[10px] font-semibold">{athIcons.now.label}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Leyenda de las señales sobre la línea del precio. */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>
              <b style={{ color: TOKENS.favorable }}>● T0–T4</b> {locale === 'es' ? 'escalera de compra (la misma de la pestaña Tranches): ' : 'buy ladder (same as the Tranches tab): '}
              <b style={{ color: '#a855f7' }}>T0</b> {locale === 'es' ? 'capitulación' : 'capitulation'} · <b style={{ color: TOKENS.caution }}>T1</b> {locale === 'es' ? 'pánico terminando' : 'panic ending'} · <b style={{ color: TOKENS.accent }}>T2</b> {locale === 'es' ? 'desaceleración' : 'deceleration'} · <b style={{ color: TOKENS.favorable }}>T3</b> {locale === 'es' ? 'validación' : 'validation'} · <b style={{ color: TOKENS.favorable }}>T4</b> {locale === 'es' ? 'valuación profunda (·r respaldo)' : 'deep value (·r backup)'}
            </span>
            <span><b style={{ color: NET_COLOR.Bv }}>● R%</b> {locale === 'es' ? 'red de seguridad: recompra el efectivo de la venta que T0–T4 no recompraron (% de ese efectivo): ' : 'safety net: buys back the sale cash that T0–T4 left (% of that cash): '}<b style={{ color: NET_COLOR.Bv }}>{locale === 'es' ? 'barato con rebote' : 'cheap with rebound'}</b> · <b style={{ color: NET_COLOR.Ds }}>{locale === 'es' ? 'valuación en mínimos' : 'valuation lows'}</b> · <b style={{ color: NET_COLOR.R1e }}>{locale === 'es' ? 'regreso a máximos' : 'back at highs'}</b></span>
            <span><b style={{ color: TOKENS.elevated }}>▼ V1–V5</b> {locale === 'es' ? 'escalera de venta (la misma de la pestaña Tranches): V1–V3 BHT 70/75/80 en la primera debilidad · V4 bajo la SMA 50 · V5 tendencia rota' : 'sell ladder (same as the Tranches tab): V1–V3 BHT 70/75/80 on the first weakness · V4 below the 50-day SMA · V5 broken trend'} · <b style={{ color: TOKENS.risk }}>·C</b> {locale === 'es' ? 'ciclo por crisis de crédito' : 'credit-crisis cycle'}</span>
            <span><b style={{ color: TOKENS.risk }}>⚠</b> {locale === 'es' ? 'Riesgo: BHT ≥ 50 con el S&P 500 en tendencia bajista (abajo de su SMA 50 y 200); una por caída, salvo que el precio suba' : 'Risk: BHT ≥ 50 with the S&P 500 in a downtrend (below its 50- and 200-day SMA); once per decline unless price rises'}</span>
            <span><b style={{ color: TOKENS.caution }}>▲ Golden Cross</b> / <b className="text-slate-400">▼ Death Cross</b> {locale === 'es' ? 'SMA 50 cruza la SMA 200 del instrumento (el Death Cross solo con BHT ≥ 50: con BHT bajo llega tarde, cerca de los pisos)' : 'instrument 50-day SMA crosses its 200-day SMA (Death Cross only with BHT ≥ 50: with a low BHT it comes late, near bottoms)'}</span>
            <span className="text-slate-500">{locale === 'es' ? 'Lectura del modelo, no recomendación.' : 'Model reading, not advice.'}</span>
          </div>
          {bhtPin.tip && bhtPin.tip.d !== bhtPin.pin?.d && daily && (() => {
            const i = dailyIdx.get(bhtPin.tip.d);
            if (i == null) return null;
            return <BhtHoverTip point={bhtPin.tip} bht={daily.bht?.[i] ?? null} trend={daily.trend?.[i] ?? null}
              prices={[['S&P 500', daily.spx[i]], ['QQQ (Nasdaq-100)', daily.qqq?.[i]], ['TQQQ', daily.tqqq?.[i]]]} />;
          })()}
          {bhtPin.pin && (
            <BhtDetailPopover
              hover={bhtPin.pin}
              detail={bhtDet.cache[bhtPin.pin.d]}
              forward={fwdCache[bhtPin.pin.d]}
              onClose={bhtPin.close}
              nav={pinNav}
              trancheRoute={instrument === 'spx' ? 'voo' : 'qqq'}
            />
          )}
        </div>
      </div>

    </div>
  );
};
