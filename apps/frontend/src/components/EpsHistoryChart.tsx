'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart3, TrendingUp, Sparkles, CheckCircle2, Calendar, HelpCircle, Layers, ArrowUpRight, ArrowDownRight, Info, ChevronLeft, ChevronRight, DollarSign, Calculator, Activity, Sun } from 'lucide-react';
import { useLocale } from 'next-intl';

interface QuarterData {
  date: string;
  period: string;
  fiscalYear: string;
  revenue?: number;
  netIncome?: number;
  eps: number;
  epsDiluted?: number;
  source?: string;
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

interface EpsHistoryChartProps {
  ticker: any;
  quarters: QuarterData[] | null | undefined;
  snapshot?: any;
  historicalPrices?: HistoricalPrice[];
}

interface ChartItem {
  key: string;
  label: string;
  subLabel?: string;
  calendarYear: number;
  periodName: string;
  eps: number;
  isProjection: boolean;
  source: string;
  growthPercent: number | null;
  seasonalityWeight?: number;
  stockPrice: number | null;
  priceGrowthPercent: number | null;
  mixPeUsed?: number;
  peRatio: number | null;
}

export const EpsHistoryChart: React.FC<EpsHistoryChartProps> = ({
  ticker,
  quarters,
  snapshot,
  historicalPrices = [],
}) => {
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
  const [hoveredItem, setHoveredItem] = useState<ChartItem | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [columnCenterX, setColumnCenterX] = useState<number[]>([]);
  const [svgTotalWidth, setSvgTotalWidth] = useState<number>(0);

  // Helper para obtener el precio histórico más cercano a una fecha dada de calendario solar
  const getHistoricalPriceForDate = (targetDateStr: string): number | null => {
    if (!historicalPrices || historicalPrices.length === 0) return null;
    const targetTime = new Date(targetDateStr).getTime();
    let closest = historicalPrices[0];
    let minDiff = Math.abs(new Date(closest.date).getTime() - targetTime);

    for (const p of historicalPrices) {
      const diff = Math.abs(new Date(p.date).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    return closest.adjClose || closest.close;
  };

  // Helper para obtener el precio histórico al cierre del AÑO CALENDARIO SOLAR (31 de Diciembre del año solar calYear)
  const getHistoricalPriceForCalendarYear = (calYear: number): number | null => {
    if (!historicalPrices || historicalPrices.length === 0) return null;
    const pricesInYear = historicalPrices.filter((p) => new Date(p.date).getFullYear() === calYear);
    if (pricesInYear.length > 0) {
      pricesInYear.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return pricesInYear[0].adjClose || pricesInYear[0].close;
    }
    return null;
  };

  // 1. Parámetros para la fórmula del Escenario Mix de Valoración
  const currentPrice = ticker?.price || 1;
  const rawSnapshotPe = snapshot?.pe ? Number(snapshot.pe) : null;
  const peTtm = rawSnapshotPe && rawSnapshotPe >= 3 ? rawSnapshotPe : (ticker?.pe && ticker.pe > 0 ? ticker.pe : 25);
  const peFwd = snapshot?.forwardPe ? Number(snapshot.forwardPe) : (ticker?.forwardPe && ticker.forwardPe > 0 ? ticker.forwardPe : peTtm * 0.9);
  const peMix = (peTtm + peFwd) / 2;
  const terminalPe = ticker?.sectorTerminalPe && ticker.sectorTerminalPe > 0 ? ticker.sectorTerminalPe : 22.0;
  const currentYearNum = new Date().getFullYear();

  // Calcular el último EPS histórico TTM conocido de la empresa para la fórmula de Escenario Mix
  const lastHistoricalEps = useMemo(() => {
    const validQuarters = (quarters || []).filter((q) => q && q.date);
    if (validQuarters.length === 0) return ticker?.eps || 1;
    const calMap = new Map<number, number>();
    validQuarters.forEach((q) => {
      const calYear = new Date(q.date).getFullYear();
      calMap.set(calYear, (calMap.get(calYear) || 0) + (q.epsDiluted ?? q.eps ?? 0));
    });
    const sorted = Array.from(calMap.entries()).sort((a, b) => a[0] - b[0]);
    return sorted.length > 0 ? sorted[sorted.length - 1][1] : ticker?.eps || 1;
  }, [quarters, ticker]);

  // 2. Extraer estimaciones anuales futuras de analistas desde el snapshot
  const analystEstimates = useMemo(() => {
    const estimatesObj = snapshot?.analystEstimates;
    if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) return [];

    const years: string[] = estimatesObj.years;
    const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;

    const epsRow = estimatesList.find(
      (e) =>
        e.metric.trim() === 'EPS ($)' ||
        e.metric.trim() === 'EPS without NRI ($)' ||
        e.metric.toLowerCase().includes('eps'),
    );

    if (!epsRow) return [];

    const results: { calendarYear: number; label: string; eps: number }[] = [];

    years.forEach((yStr, idx) => {
      const match = yStr.match(/\d{4}/);
      if (match) {
        const calYear = parseInt(match[0], 10);
        const valStr = epsRow.values[idx];
        const epsVal = parseFloat(valStr);
        if (!isNaN(epsVal) && valStr !== '—') {
          results.push({ calendarYear: calYear, label: yStr, eps: epsVal });
        }
      }
    });

    return results;
  }, [snapshot]);

  const totalHorizonYears = Math.max(4, analystEstimates.length);

  // Cálculo exacto del Precio del Escenario Mix idéntico a la Calculadora Multiescenario
  const calculateMixScenarioPrice = (calYear: number, estFwdEps: number) => {
    const yearsDiff = Math.max(1, calYear - currentYearNum);
    const decayRatio = Math.min(1, yearsDiff / totalHorizonYears);
    const peFutureMix = peMix - (peMix - terminalPe) * decayRatio;
    
    // Escenario Mix: promedia el EPS TTM histórico conocido y el EPS Forward estimado de analistas
    const epsMix = (lastHistoricalEps + estFwdEps) / 2;
    const projectedPriceMix = parseFloat((epsMix * peFutureMix).toFixed(2));
    
    return { projectedPriceMix, peFutureMix: parseFloat(peFutureMix.toFixed(1)) };
  };

  // 3. Procesar datos Anuales agrupados estrictamente por AÑO CALENDARIO SOLAR
  const annualData = useMemo<ChartItem[]>(() => {
    const validQuarters = (quarters || []).filter((q) => q && q.date);

    // Agrupar los trimestres de SEC EDGAR por AÑO CALENDARIO SOLAR de su fecha de cierre
    const calMap = new Map<number, QuarterData[]>();
    validQuarters.forEach((q) => {
      const calYear = new Date(q.date).getFullYear();
      if (!calMap.has(calYear)) calMap.set(calYear, []);
      calMap.get(calYear)!.push(q);
    });

    const sortedCalYears = Array.from(calMap.keys()).sort((a, b) => a - b);
    const historicalAnnualItems: ChartItem[] = [];

    sortedCalYears.forEach((calYear) => {
      const qList = calMap.get(calYear)!;
      if (qList.length >= 3 || calYear < currentYearNum) {
        const sumEps = qList.reduce((acc, q) => acc + (q.epsDiluted ?? q.eps ?? 0), 0);
        const roundedEps = parseFloat(sumEps.toFixed(2));
        
        // Precio al cierre del AÑO CALENDARIO SOLAR (31 de Diciembre del año calYear)
        const priceForCalYear = getHistoricalPriceForCalendarYear(calYear);
        const peVal = priceForCalYear && roundedEps > 0 ? parseFloat((priceForCalYear / roundedEps).toFixed(1)) : null;

        historicalAnnualItems.push({
          key: `cal-${calYear}`,
          label: `${calYear}`,
          subLabel: locale === 'es' ? 'Año Calendario Solar' : 'Solar Calendar Year',
          calendarYear: calYear,
          periodName: `${calYear}`,
          eps: roundedEps,
          isProjection: false,
          source: 'SEC EDGAR',
          growthPercent: null,
          stockPrice: priceForCalYear,
          priceGrowthPercent: null,
          peRatio: peVal,
        });
      }
    });

    const lastHistoricalCalYear = historicalAnnualItems.length > 0
      ? historicalAnnualItems[historicalAnnualItems.length - 1].calendarYear
      : currentYearNum - 1;

    const futureAnnualItems: ChartItem[] = analystEstimates
      .filter((est) => est.calendarYear > lastHistoricalCalYear)
      .map((est) => {
        const { projectedPriceMix, peFutureMix } = calculateMixScenarioPrice(est.calendarYear, est.eps);
        return {
          key: `cal-est-${est.calendarYear}`,
          label: `${est.calendarYear}`,
          subLabel: locale === 'es' ? 'Proyección Solar Wall St + Mix' : 'Solar Wall St + Mix Forecast',
          calendarYear: est.calendarYear,
          periodName: `${est.calendarYear}`,
          eps: est.eps,
          isProjection: true,
          source: 'Escenario Mix (Valuation)',
          growthPercent: null,
          stockPrice: projectedPriceMix,
          priceGrowthPercent: null,
          mixPeUsed: peFutureMix,
          peRatio: peFutureMix,
        };
      });

    const combined = [...historicalAnnualItems, ...futureAnnualItems];

    combined.forEach((item, idx) => {
      if (idx > 0) {
        const prevEps = combined[idx - 1].eps;
        if (prevEps !== 0) {
          item.growthPercent = parseFloat((((item.eps - prevEps) / Math.abs(prevEps)) * 100).toFixed(1));
        }

        const prevPrice = combined[idx - 1].stockPrice;
        if (item.stockPrice !== null && prevPrice !== null && prevPrice > 0) {
          item.priceGrowthPercent = parseFloat((((item.stockPrice - prevPrice) / prevPrice) * 100).toFixed(1));
        }
      }
    });

    return combined;
  }, [quarters, analystEstimates, locale, historicalPrices, peMix, terminalPe, currentYearNum, totalHorizonYears, lastHistoricalEps]);

  // 4. Procesar datos Trimestrales basándose en fechas del Calendario Solar
  const quarterlyData = useMemo<ChartItem[]>(() => {
    const validQuarters = (quarters || [])
      .filter((q) => q && q.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (validQuarters.length === 0) return [];

    const calMap = new Map<number, QuarterData[]>();
    validQuarters.forEach((q) => {
      const calYear = new Date(q.date).getFullYear();
      if (!calMap.has(calYear)) calMap.set(calYear, []);
      calMap.get(calYear)!.push(q);
    });

    const fullYears = Array.from(calMap.entries())
      .filter(([, list]) => list.length === 4)
      .map(([y]) => y)
      .sort((a, b) => b - a);

    const baseYear = fullYears.length > 0 ? fullYears[0] : new Date(validQuarters[validQuarters.length - 1].date).getFullYear();
    const baseQuarters = calMap.get(baseYear) || [];

    const baseSum = baseQuarters.reduce((acc, q) => acc + Math.abs(q.epsDiluted ?? q.eps ?? 0), 0);
    const seasonalityWeights: Record<string, number> = { Q1: 0.25, Q2: 0.25, Q3: 0.25, Q4: 0.25 };

    if (baseSum > 0 && baseQuarters.length === 4) {
      baseQuarters.forEach((q) => {
        const periodName = q.period || `Q${Math.floor(new Date(q.date).getMonth() / 3) + 1}`;
        seasonalityWeights[periodName] = (Math.abs(q.epsDiluted ?? q.eps ?? 0)) / baseSum;
      });
    }

    const historicalQuarterlyItems: ChartItem[] = validQuarters.map((q) => {
      const qDate = new Date(q.date);
      const calYear = qDate.getFullYear();
      const pName = q.period || `Q${Math.floor(qDate.getMonth() / 3) + 1}`;
      const qPrice = getHistoricalPriceForDate(q.date);
      const epsVal = q.epsDiluted ?? q.eps ?? 0;
      const annualizedEps = epsVal * 4;
      const peVal = qPrice && annualizedEps > 0 ? parseFloat((qPrice / annualizedEps).toFixed(1)) : null;

      return {
        key: `q-${calYear}-${pName}`,
        label: `${pName} ${calYear}`,
        subLabel: locale === 'es' ? 'Trimestre Solar Confirmado' : 'Confirmed Solar Quarter',
        calendarYear: calYear,
        periodName: pName,
        eps: parseFloat(epsVal.toFixed(2)),
        isProjection: false,
        source: 'SEC EDGAR',
        growthPercent: null,
        stockPrice: qPrice,
        priceGrowthPercent: null,
        peRatio: peVal,
      };
    });

    const lastHistQuarter = validQuarters[validQuarters.length - 1];
    const lastHistCalYear = new Date(lastHistQuarter.date).getFullYear();

    const futureQuarterlyItems: ChartItem[] = [];
    const futureAnnuals = analystEstimates.filter((est) => est.calendarYear >= lastHistCalYear);

    futureAnnuals.forEach((est) => {
      const periods = ['Q1', 'Q2', 'Q3', 'Q4'];
      const { projectedPriceMix, peFutureMix } = calculateMixScenarioPrice(est.calendarYear, est.eps);

      periods.forEach((p) => {
        const existsInHist = validQuarters.some((q) => new Date(q.date).getFullYear() === est.calendarYear && (q.period === p || `Q${Math.floor(new Date(q.date).getMonth() / 3) + 1}` === p));
        if (!existsInHist) {
          const weight = seasonalityWeights[p] || 0.25;
          const estimatedQEps = parseFloat((est.eps * weight).toFixed(2));

          futureQuarterlyItems.push({
            key: `q-est-${est.calendarYear}-${p}`,
            label: `${p} ${est.calendarYear}`,
            subLabel: locale === 'es' ? 'Est. Solar + Mix' : 'Solar Est. + Mix',
            calendarYear: est.calendarYear,
            periodName: p,
            eps: estimatedQEps,
            isProjection: true,
            source: 'Escenario Mix (Valuation)',
            growthPercent: null,
            stockPrice: projectedPriceMix,
            priceGrowthPercent: null,
            mixPeUsed: peFutureMix,
            peRatio: peFutureMix,
          });
        }
      });
    });

    const combined = [...historicalQuarterlyItems, ...futureQuarterlyItems];

    combined.forEach((item, idx) => {
      if (idx > 0) {
        const prevEps = combined[idx - 1].eps;
        if (prevEps !== 0) {
          item.growthPercent = parseFloat((((item.eps - prevEps) / Math.abs(prevEps)) * 100).toFixed(1));
        }

        const prevPrice = combined[idx - 1].stockPrice;
        if (item.stockPrice !== null && prevPrice !== null && prevPrice > 0) {
          item.priceGrowthPercent = parseFloat((((item.stockPrice - prevPrice) / prevPrice) * 100).toFixed(1));
        }
      }
    });

    return combined;
  }, [quarters, analystEstimates, locale, historicalPrices, peMix, terminalPe, currentYearNum, totalHorizonYears, lastHistoricalEps]);

  const activeSeries = viewMode === 'annual' ? annualData : quarterlyData;

  // Medir la posición X exacta de cada columna en el DOM real
  useEffect(() => {
    const updatePositions = () => {
      const centers: number[] = [];
      let totalW = 0;
      columnRefs.current.forEach((el) => {
        if (el) {
          centers.push(el.offsetLeft + el.offsetWidth / 2);
          totalW = Math.max(totalW, el.offsetLeft + el.offsetWidth);
        }
      });
      setColumnCenterX(centers);
      setSvgTotalWidth(totalW);
    };

    updatePositions();
    const timer = setTimeout(updatePositions, 100);
    window.addEventListener('resize', updatePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePositions);
    };
  }, [activeSeries, viewMode]);

  // Auto-scroll a las fechas recientes y proyecciones
  useEffect(() => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollLeft = el.scrollWidth - el.clientWidth - 150;
    }
  }, [viewMode, activeSeries.length]);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -360, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 360, behavior: 'smooth' });
    }
  };

  const maxEps = useMemo(() => {
    if (activeSeries.length === 0) return 1;
    const maxVal = Math.max(...activeSeries.map((d) => Math.abs(d.eps)));
    return maxVal > 0 ? maxVal * 1.25 : 1;
  }, [activeSeries]);

  // 1. Rango de P/E Ratio Calendario Solar (min y max) para escalar la Línea 1 (Dorada)
  const { minPe, maxPe } = useMemo(() => {
    const validPes = activeSeries.map((d) => d.peRatio).filter((v): v is number => v !== null && v > 0);
    if (validPes.length === 0) return { minPe: 10, maxPe: 50 };
    const minVal = Math.min(...validPes);
    const maxVal = Math.max(...validPes);
    const padding = (maxVal - minVal) * 0.15 || 5;
    return {
      minPe: Math.max(0, minVal - padding),
      maxPe: maxVal + padding,
    };
  }, [activeSeries]);

  // Puntos de la Línea de P/E Ratio (Dorada - Calendario Solar)
  const peLinePoints = useMemo(() => {
    const peRange = Math.max(1, maxPe - minPe);

    return activeSeries.map((item, idx) => {
      const x = columnCenterX[idx] ?? (idx * 116 + 58);
      const pe = item.peRatio ?? 0;
      const normalizedPe = Math.max(0, Math.min(1, (pe - minPe) / peRange));
      const y = 60 - normalizedPe * 45; // Franja superior 15px - 60px

      return {
        x,
        y: parseFloat(y.toFixed(1)),
        pe,
        stockPrice: item.stockPrice,
        label: item.label,
        isProjection: item.isProjection,
        key: item.key,
        item,
      };
    });
  }, [activeSeries, columnCenterX, minPe, maxPe]);

  const peSvgPath = useMemo(() => {
    if (peLinePoints.length === 0) return '';
    return peLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [peLinePoints]);

  // 2. Rango de Precio de la Acción (min y max) para escalar la Línea 2 (Turquesa/Cian)
  const { minPrice, maxPrice } = useMemo(() => {
    const validPrices = activeSeries.map((d) => d.stockPrice).filter((v): v is number => v !== null && v > 0);
    if (validPrices.length === 0) return { minPrice: 10, maxPrice: 200 };
    const minVal = Math.min(...validPrices);
    const maxVal = Math.max(...validPrices);
    const padding = (maxVal - minVal) * 0.15 || 10;
    return {
      minPrice: Math.max(0, minVal - padding),
      maxPrice: maxVal + padding,
    };
  }, [activeSeries]);

  // Puntos de la Línea de Precio de la Acción (Turquesa/Cian - Calendario Solar)
  const priceLinePoints = useMemo(() => {
    const priceRange = Math.max(1, maxPrice - minPrice);

    return activeSeries.map((item, idx) => {
      const x = columnCenterX[idx] ?? (idx * 116 + 58);
      const price = item.stockPrice ?? 0;
      const normalizedPrice = Math.max(0, Math.min(1, (price - minPrice) / priceRange));
      const y = 120 - normalizedPrice * 55; // Franja media 65px - 120px

      return {
        x,
        y: parseFloat(y.toFixed(1)),
        price,
        label: item.label,
        isProjection: item.isProjection,
        key: item.key,
        priceGrowthPercent: item.priceGrowthPercent,
      };
    });
  }, [activeSeries, columnCenterX, minPrice, maxPrice]);

  const priceSvgPath = useMemo(() => {
    if (priceLinePoints.length === 0) return '';
    return priceLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [priceLinePoints]);

  if (activeSeries.length === 0) return null;

  return (
    <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6 w-full">
      {/* Header Block with Title & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Sun size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              {locale === 'es' ? 'Histórico de EPS, Precio y P/E (Calendario Solar)' : 'EPS, Stock Price & P/E Lines (Solar Calendar Year)'}
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sun size={10} /> Calendario Solar
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {locale === 'es'
                ? 'P/E Ratio y Crecimiento agrupados por Año Calendario Solar (del 1 de enero al 31 de diciembre) con Escenario Mix.'
                : 'P/E Ratio & Growth grouped by Solar Calendar Year (Jan 1 to Dec 31) with Mix Scenario.'}
            </p>
          </div>
        </div>

        {/* Action Controls: Scroll Arrows & Mode Switcher */}
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={handleScrollLeft}
              title={locale === 'es' ? 'Ver Pasado (Izquierda)' : 'Scroll Left (Past)'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleScrollRight}
              title={locale === 'es' ? 'Ver Futuro (Derecha)' : 'Scroll Right (Future)'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-slate-800 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('annual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'annual'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar size={13} />
              {locale === 'es' ? 'Año Solar' : 'Solar Year'}
            </button>
            <button
              onClick={() => setViewMode('quarterly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'quarterly'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={13} />
              {locale === 'es' ? 'Trimestral' : 'Quarterly'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Bar Chart Container with Smooth Horizontal Scroll */}
      <div className="relative group/chart">
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none z-10 opacity-70" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none z-10 opacity-70" />

        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent pt-6 pb-4 px-4 scroll-smooth"
        >
          <div className="relative flex items-start gap-3 w-max min-w-full">
            
            {/* SVG OVERLAY: Línea P/E Calendario Solar (Dorada) + Línea Precio (Turquesa) */}
            <svg
              className="absolute left-0 top-0 h-60 pointer-events-none z-30 overflow-visible"
              style={{ width: `${Math.max(svgTotalWidth, activeSeries.length * 116)}px` }}
            >
              <defs>
                {/* Resplandor P/E Ratio (Dorado) */}
                <filter id="glow-pe" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="peLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                </linearGradient>

                {/* Resplandor Precio de la Acción (Turquesa / Cyan) */}
                <filter id="glow-price" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="priceLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* LÍNEA 1: Trazo continuo visible de P/E Ratio (Dorada) */}
              {peSvgPath && (
                <path
                  d={peSvgPath}
                  fill="none"
                  stroke="url(#peLineGradient)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow-pe)"
                  className="transition-all duration-300 opacity-95 pointer-events-none"
                />
              )}

              {/* LÍNEA 2: Trazo continuo visible del Precio de la Acción (Turquesa / Cyan) */}
              {priceSvgPath && (
                <path
                  d={priceSvgPath}
                  fill="none"
                  stroke="url(#priceLineGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow-price)"
                  className="transition-all duration-300 opacity-95 pointer-events-none"
                />
              )}

              {/* Nodos de la Línea de Precio de la Acción (Turquesa) */}
              {priceLinePoints.map((pt) => {
                const isItemHovered = hoveredItem?.key === pt.key;

                return (
                  <g key={`price-pt-${pt.key}`} className="pointer-events-none">
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isItemHovered ? '6.5' : '4.5'}
                      fill={pt.isProjection ? '#c084fc' : '#22d3ee'}
                      stroke="#020617"
                      strokeWidth="2"
                      className="transition-all duration-200"
                    />
                  </g>
                );
              })}

              {/* Nodos de la Línea de P/E Ratio Calendario Solar (Dorados) con Tooltip dinámico de Doble Indicador (P/E + Precio) */}
              {peLinePoints.map((pt) => {
                const isItemHovered = hoveredItem?.key === pt.key;
                const item = pt.item;

                return (
                  <g key={`pt-${pt.key}`} className="pointer-events-none">
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isItemHovered ? '7.5' : '5'}
                      fill={pt.isProjection ? '#c084fc' : '#fbbf24'}
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      className="transition-all duration-200"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isItemHovered ? '12' : '8.5'}
                      fill="none"
                      stroke={pt.isProjection ? '#a855f7' : '#f59e0b'}
                      strokeWidth="1.5"
                      strokeOpacity={isItemHovered ? '1' : '0.6'}
                      className="transition-all duration-200"
                    />

                    {/* Tooltip SVG contextual con dimensión dinámica mostrando P/E y Precio de la Acción al hacer Hover */}
                    {isItemHovered && (() => {
                      const priceVal = item.stockPrice !== null ? `$${item.stockPrice.toFixed(2)}` : 'N/A';
                      const peVal = item.peRatio !== null ? `${item.peRatio.toFixed(1)}x` : 'N/A';
                      const textStr = `P/E: ${peVal}  |  Precio: ${priceVal} (${item.label})`;
                      const pillWidth = Math.max(160, Math.ceil(textStr.length * 7.2 + 28));
                      const halfWidth = pillWidth / 2;

                      return (
                        <g transform={`translate(${pt.x}, ${pt.y - 30})`} className="pointer-events-none">
                          <rect
                            x={-halfWidth}
                            y="-14"
                            width={pillWidth}
                            height="24"
                            rx="7"
                            fill="#020617"
                            stroke="#f59e0b"
                            strokeWidth="1.5"
                            className="shadow-2xl shadow-amber-500/50"
                          />
                          <text
                            x="0"
                            y="2.5"
                            textAnchor="middle"
                            fontSize="10.5"
                            fontWeight="900"
                            fontFamily="monospace"
                            className="tracking-tight"
                          >
                            <tspan fill="#fef08a">P/E: {peVal}</tspan>
                            <tspan fill="#64748b"> | </tspan>
                            <tspan fill="#22d3ee">Precio: {priceVal}</tspan>
                            <tspan fill="#cbd5e1"> ({item.label})</tspan>
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
            </svg>

            {activeSeries.map((item, idx) => {
              // Escalado de altura de la barra (max 48% para mantener total independencia visual)
              const rawHeightPercent = Math.max(10, Math.min(100, (Math.abs(item.eps) / maxEps) * 100));
              const heightPercent = rawHeightPercent * 0.48;
              const isNegative = item.eps < 0;
              const isHovered = hoveredItem?.key === item.key;

              return (
                <div
                  key={item.key}
                  ref={(el) => (columnRefs.current[idx] = el)}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className="flex-none w-24 sm:w-28 flex flex-col items-center group relative cursor-pointer"
                >
                  {/* 1. Zona Superior: Badges + Valor EPS Flotante Sobresaliente + Barra Base (Altura 240px) */}
                  <div className="w-full flex flex-col items-center justify-end h-60 border-b border-slate-800/80 pb-0 z-10">
                    {/* Badge % Crecimiento EPS */}
                    <div className="mb-1 flex flex-col items-center h-5 justify-end">
                      {item.growthPercent !== null ? (
                        <div
                          className={`inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full border shadow-md transition-all ${
                            item.growthPercent >= 0
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                          title="Cambio % EPS vs periodo previo"
                        >
                          {item.growthPercent >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                          EPS {item.growthPercent >= 0 ? '+' : ''}{item.growthPercent}%
                        </div>
                      ) : (
                        <div className="text-[9px] font-semibold text-slate-500">—</div>
                      )}
                    </div>

                    {/* Valor nominal del EPS $X.XX flotante e íntegro justo encima de la barra (100% visible, sin recortes) */}
                    <span
                      className={`text-[11px] font-mono font-black mb-1 transition-colors ${
                        item.isProjection ? 'text-purple-300 group-hover:text-purple-200' : 'text-slate-200 group-hover:text-white'
                      }`}
                    >
                      ${item.eps.toFixed(2)}
                    </span>

                    {/* Barra de EPS perfectamente visible */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full max-w-[46px] min-h-[14px] rounded-t-lg transition-all duration-300 relative ${
                        item.isProjection
                          ? 'bg-gradient-to-t from-purple-900/80 via-purple-600/70 to-purple-400 border-2 border-dashed border-purple-300 shadow-lg shadow-purple-500/20 group-hover:from-purple-800 group-hover:to-purple-300'
                          : isNegative
                          ? 'bg-gradient-to-t from-rose-950 via-rose-700 to-rose-500 border border-rose-400/60 shadow-lg shadow-rose-500/10'
                          : 'bg-gradient-to-t from-emerald-950 via-emerald-600 to-emerald-400 border border-emerald-300/50 shadow-lg shadow-emerald-500/20 group-hover:brightness-125'
                      } ${isHovered ? 'scale-105 ring-2 ring-teal-400' : ''}`}
                    >
                      {item.isProjection && (
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.08)_75%,transparent_75%,transparent)] bg-[length:8px_8px] pointer-events-none rounded-t-lg" />
                      )}
                    </div>
                  </div>

                  {/* 2. Zona Inferior: Eje X (Etiqueta Año Solar + Precio Acción + PE Ratio Solar) */}
                  <div className="mt-2.5 flex flex-col items-center text-center w-full min-h-[110px]">
                    <span
                      className={`text-[11px] font-bold tracking-tight transition-colors ${
                        item.isProjection ? 'text-purple-400 font-black' : 'text-slate-300'
                      }`}
                    >
                      {item.label}
                    </span>

                    {/* Precio de la Acción (Histórico al 31 Dic Solar, Escenario Mix en Proyectados) */}
                    {item.stockPrice !== null && (
                      <div
                        className={`mt-1 flex flex-col items-center p-1 rounded-lg border text-[10px] font-mono transition-all w-full max-w-[85px] ${
                          item.isProjection
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                            : 'bg-slate-900/80 border-slate-800 text-teal-300'
                        }`}
                      >
                        <span className="font-extrabold text-[11px]">${item.stockPrice.toFixed(2)}</span>
                        {item.priceGrowthPercent !== null && (
                          <span
                            className={`text-[9px] font-bold ${
                              item.priceGrowthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.priceGrowthPercent >= 0 ? '+' : ''}{item.priceGrowthPercent}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* PE Ratio del Período Calendario Solar */}
                    {item.peRatio !== null && (
                      <span className="mt-1 text-[9px] font-mono font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <Activity size={9} className="text-amber-400" />
                        P/E Solar: {item.peRatio.toFixed(1)}x
                      </span>
                    )}

                    {item.isProjection && (
                      <span className="inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase tracking-widest text-purple-300 bg-purple-500/20 border border-purple-500/40 rounded px-1 mt-1">
                        <Sparkles size={8} /> {locale === 'es' ? 'MIX EST.' : 'MIX EST.'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Rich Info Box on Hover */}
      {hoveredItem ? (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 text-xs transition-all animate-fadeIn">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                hoveredItem.isProjection
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {hoveredItem.isProjection ? <Calculator size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div>
              <div className="font-extrabold text-white flex items-center gap-2 text-sm">
                <span>{hoveredItem.label}</span>
                <span className="text-xs text-slate-400 font-normal">({hoveredItem.subLabel})</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>{locale === 'es' ? 'Fuente:' : 'Source:'}</span>
                <strong className={hoveredItem.isProjection ? 'text-purple-300' : 'text-emerald-400'}>
                  {hoveredItem.source}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 font-mono">
            {/* Metricas EPS */}
            <div className="border-r border-slate-800 pr-6">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{locale === 'es' ? 'EPS Nominal' : 'Nominal EPS'}</span>
              <span className="text-base font-black text-white">${hoveredItem.eps.toFixed(2)}</span>
              {hoveredItem.growthPercent !== null && (
                <span
                  className={`text-[11px] font-bold block ${
                    hoveredItem.growthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  EPS {hoveredItem.growthPercent >= 0 ? '+' : ''}{hoveredItem.growthPercent}% vs prev
                </span>
              )}
            </div>

            {/* Metricas Precio Acción */}
            <div className="border-r border-slate-800 pr-6">
              <span className="text-[10px] text-teal-300 font-extrabold uppercase tracking-wider block">
                {hoveredItem.isProjection
                  ? (locale === 'es' ? 'Precio Proyectado (Escenario Mix)' : 'Projected Price (Mix Scenario)')
                  : (locale === 'es' ? 'Precio al Cierre Solar' : 'Solar Close Stock Price')}
              </span>
              <span className="text-base font-black text-teal-300">
                {hoveredItem.stockPrice !== null ? `$${hoveredItem.stockPrice.toFixed(2)}` : 'N/A'}
              </span>
              {hoveredItem.priceGrowthPercent !== null && (
                <span
                  className={`text-[11px] font-bold block ${
                    hoveredItem.priceGrowthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  Precio {hoveredItem.priceGrowthPercent >= 0 ? '+' : ''}{hoveredItem.priceGrowthPercent}% vs prev
                </span>
              )}
            </div>

            {/* Metricas PE Ratio Calendario Solar */}
            <div>
              <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider block">
                {locale === 'es' ? 'P/E Ratio (Calendario Solar)' : 'Solar Calendar P/E Ratio'}
              </span>
              <span className="text-base font-black text-amber-300">
                {hoveredItem.peRatio !== null ? `${hoveredItem.peRatio.toFixed(1)}x` : 'N/A'}
              </span>
              {hoveredItem.isProjection && (
                <span className="text-[10px] text-purple-300 block">
                  (P/E Mix Convergente)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Explanatory Footer Legend */
        <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-slate-900/30 border border-slate-900 rounded-xl text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-emerald-500 border border-emerald-400" />
              <span>{locale === 'es' ? 'EPS Real (SEC EDGAR)' : 'Real EPS (SEC EDGAR)'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-purple-500 border border-dashed border-purple-300" />
              <span>{locale === 'es' ? 'Proyección Futura (Wall St + Escenario Mix)' : 'Future Estimate (Wall St + Mix)'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-cyan-300 font-mono font-bold">
              <span className="h-0.5 w-4 bg-cyan-400 inline-block shadow-[0_0_8px_#06b6d4]" />
              <span>{locale === 'es' ? 'Línea del Precio de la Acción ($)' : 'Stock Price Trajectory ($)'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-300 font-mono font-bold">
              <span className="h-0.5 w-4 bg-amber-400 inline-block shadow-[0_0_8px_#f59e0b]" />
              <span>{locale === 'es' ? 'Línea P/E Ratio (Calendario Solar)' : 'Solar Calendar P/E Ratio Line'}</span>
            </div>
          </div>

          {viewMode === 'quarterly' && (
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
              <Info size={13} />
              <span>
                {locale === 'es'
                  ? 'Agrupación basada en el Año Calendario Solar (1 de Ene al 31 de Dic)'
                  : 'Grouped by Solar Calendar Year (Jan 1 to Dec 31)'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
