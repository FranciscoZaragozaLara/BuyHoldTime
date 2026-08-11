'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart3, TrendingUp, Sparkles, CheckCircle2, Calendar, HelpCircle, Layers, ArrowUpRight, ArrowDownRight, Info, ChevronLeft, ChevronRight, DollarSign, Calculator, Activity } from 'lucide-react';
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
  fiscalYear: number;
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

  // Helper para obtener el precio histórico más cercano a una fecha dada
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

  // Helper para obtener el precio histórico al cierre de un año fiscal
  const getHistoricalPriceForYear = (fy: number): number | null => {
    if (!historicalPrices || historicalPrices.length === 0) return null;
    const pricesInYear = historicalPrices.filter((p) => new Date(p.date).getFullYear() === fy);
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

    const results: { fiscalYear: number; label: string; eps: number }[] = [];

    years.forEach((yStr, idx) => {
      const match = yStr.match(/\d{4}/);
      if (match) {
        const fy = parseInt(match[0], 10);
        const valStr = epsRow.values[idx];
        const epsVal = parseFloat(valStr);
        if (!isNaN(epsVal) && valStr !== '—') {
          results.push({ fiscalYear: fy, label: yStr, eps: epsVal });
        }
      }
    });

    return results;
  }, [snapshot]);

  const totalHorizonYears = Math.max(4, analystEstimates.length);

  const calculateMixScenarioPrice = (fy: number, epsVal: number) => {
    const yearsDiff = Math.max(1, fy - currentYearNum);
    const decayRatio = Math.min(1, yearsDiff / totalHorizonYears);
    const peFutureMix = peMix - (peMix - terminalPe) * decayRatio;
    const projectedPriceMix = parseFloat((epsVal * peFutureMix).toFixed(2));
    return { projectedPriceMix, peFutureMix: parseFloat(peFutureMix.toFixed(1)) };
  };

  // 3. Procesar datos Anuales
  const annualData = useMemo<ChartItem[]>(() => {
    const validQuarters = (quarters || []).filter((q) => q && q.fiscalYear && !isNaN(Number(q.fiscalYear)));

    const fyMap = new Map<number, QuarterData[]>();
    validQuarters.forEach((q) => {
      const fy = parseInt(q.fiscalYear, 10);
      if (!fyMap.has(fy)) fyMap.set(fy, []);
      fyMap.get(fy)!.push(q);
    });

    const sortedFYs = Array.from(fyMap.keys()).sort((a, b) => a - b);
    const historicalAnnualItems: ChartItem[] = [];

    sortedFYs.forEach((fy) => {
      const qList = fyMap.get(fy)!;
      const hasQ4 = qList.some((q) => q.period === 'Q4');
      if (qList.length >= 4 || hasQ4) {
        const sumEps = qList.reduce((acc, q) => acc + (q.epsDiluted ?? q.eps ?? 0), 0);
        const roundedEps = parseFloat(sumEps.toFixed(2));
        const priceForFy = getHistoricalPriceForYear(fy);
        const peVal = priceForFy && roundedEps > 0 ? parseFloat((priceForFy / roundedEps).toFixed(1)) : null;

        historicalAnnualItems.push({
          key: `fy-${fy}`,
          label: `FY${fy}`,
          subLabel: locale === 'es' ? 'Año Fiscal Completo' : 'Full Fiscal Year',
          fiscalYear: fy,
          periodName: `FY${fy}`,
          eps: roundedEps,
          isProjection: false,
          source: 'SEC EDGAR',
          growthPercent: null,
          stockPrice: priceForFy,
          priceGrowthPercent: null,
          peRatio: peVal,
        });
      }
    });

    const lastHistoricalFY = historicalAnnualItems.length > 0
      ? historicalAnnualItems[historicalAnnualItems.length - 1].fiscalYear
      : currentYearNum - 1;

    const futureAnnualItems: ChartItem[] = analystEstimates
      .filter((est) => est.fiscalYear > lastHistoricalFY)
      .map((est) => {
        const { projectedPriceMix, peFutureMix } = calculateMixScenarioPrice(est.fiscalYear, est.eps);
        return {
          key: `fy-est-${est.fiscalYear}`,
          label: `FY${est.fiscalYear}`,
          subLabel: locale === 'es' ? 'Proyección Wall St + Mix' : 'Wall St + Mix Forecast',
          fiscalYear: est.fiscalYear,
          periodName: `FY${est.fiscalYear}`,
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
  }, [quarters, analystEstimates, locale, historicalPrices, peMix, terminalPe, currentYearNum, totalHorizonYears]);

  // 4. Procesar datos Trimestrales
  const quarterlyData = useMemo<ChartItem[]>(() => {
    const validQuarters = (quarters || [])
      .filter((q) => q && q.period && q.fiscalYear && !isNaN(Number(q.fiscalYear)))
      .sort((a, b) => {
        if (a.fiscalYear !== b.fiscalYear) return parseInt(a.fiscalYear, 10) - parseInt(b.fiscalYear, 10);
        const pMap: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
        return (pMap[a.period] || 0) - (pMap[b.period] || 0);
      });

    if (validQuarters.length === 0) return [];

    const fyMap = new Map<number, QuarterData[]>();
    validQuarters.forEach((q) => {
      const fy = parseInt(q.fiscalYear, 10);
      if (!fyMap.has(fy)) fyMap.set(fy, []);
      fyMap.get(fy)!.push(q);
    });

    const fullFYs = Array.from(fyMap.entries())
      .filter(([, list]) => list.length === 4)
      .map(([fy]) => fy)
      .sort((a, b) => b - a);

    const baseFY = fullFYs.length > 0 ? fullFYs[0] : parseInt(validQuarters[validQuarters.length - 1].fiscalYear, 10);
    const baseQuarters = fyMap.get(baseFY) || [];

    const baseSum = baseQuarters.reduce((acc, q) => acc + Math.abs(q.epsDiluted ?? q.eps ?? 0), 0);
    const seasonalityWeights: Record<string, number> = { Q1: 0.25, Q2: 0.25, Q3: 0.25, Q4: 0.25 };

    if (baseSum > 0 && baseQuarters.length === 4) {
      baseQuarters.forEach((q) => {
        seasonalityWeights[q.period] = (Math.abs(q.epsDiluted ?? q.eps ?? 0)) / baseSum;
      });
    }

    const historicalQuarterlyItems: ChartItem[] = validQuarters.map((q) => {
      const qPrice = getHistoricalPriceForDate(q.date);
      const epsVal = q.epsDiluted ?? q.eps ?? 0;
      const annualizedEps = epsVal * 4;
      const peVal = qPrice && annualizedEps > 0 ? parseFloat((qPrice / annualizedEps).toFixed(1)) : null;

      return {
        key: `q-${q.fiscalYear}-${q.period}`,
        label: `${q.period} ${q.fiscalYear}`,
        subLabel: locale === 'es' ? 'Trimestre Confirmado' : 'Confirmed Quarter',
        fiscalYear: parseInt(q.fiscalYear, 10),
        periodName: q.period,
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
    const lastHistFY = parseInt(lastHistQuarter.fiscalYear, 10);

    const futureQuarterlyItems: ChartItem[] = [];
    const futureAnnuals = analystEstimates.filter((est) => est.fiscalYear >= lastHistFY);

    futureAnnuals.forEach((est) => {
      const periods = ['Q1', 'Q2', 'Q3', 'Q4'];
      const { projectedPriceMix, peFutureMix } = calculateMixScenarioPrice(est.fiscalYear, est.eps);

      periods.forEach((p) => {
        const existsInHist = validQuarters.some((q) => parseInt(q.fiscalYear, 10) === est.fiscalYear && q.period === p);
        if (!existsInHist) {
          const weight = seasonalityWeights[p] || 0.25;
          const estimatedQEps = parseFloat((est.eps * weight).toFixed(2));

          futureQuarterlyItems.push({
            key: `q-est-${est.fiscalYear}-${p}`,
            label: `${p} ${est.fiscalYear}`,
            subLabel: locale === 'es' ? 'Est. Estacional + Mix' : 'Seasonal Est. + Mix',
            fiscalYear: est.fiscalYear,
            periodName: p,
            eps: estimatedQEps,
            isProjection: true,
            source: 'Escenario Mix (Valuation)',
            growthPercent: null,
            seasonalityWeight: parseFloat((weight * 100).toFixed(1)),
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
  }, [quarters, analystEstimates, locale, historicalPrices, peMix, terminalPe, currentYearNum, totalHorizonYears]);

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

  // Rango de P/E Ratio (min y max) para escalar la línea Y con precisión
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

  // Generar puntos exactos (X, Y) mapeando la posición DOM y el valor de P/E Ratio
  const peLinePoints = useMemo(() => {
    const chartHeight = 240; // h-60 = 240px
    const peRange = Math.max(1, maxPe - minPe);

    return activeSeries.map((item, idx) => {
      const x = columnCenterX[idx] ?? (idx * 116 + 58);
      const pe = item.peRatio ?? 0;
      // Escalar Y dejando margen holgado arriba (25px) y abajo (25px)
      const normalizedPe = Math.max(0, Math.min(1, (pe - minPe) / peRange));
      const y = chartHeight - normalizedPe * (chartHeight - 50) - 25;

      return {
        x,
        y: parseFloat(y.toFixed(1)),
        pe,
        isProjection: item.isProjection,
        key: item.key,
      };
    });
  }, [activeSeries, columnCenterX, minPe, maxPe]);

  const peSvgPath = useMemo(() => {
    if (peLinePoints.length === 0) return '';
    return peLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [peLinePoints]);

  if (activeSeries.length === 0) return null;

  return (
    <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6 w-full">
      {/* Header Block with Title & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-400">
            <BarChart3 size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              {locale === 'es' ? 'Histórico de EPS y Línea de P/E Ratio (Escenario Mix)' : 'EPS & P/E Ratio Trajectory Line (Mix Scenario)'}
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={10} /> SEC EDGAR + Mix Valuation
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {locale === 'es'
                ? 'Barras de EPS nominal combinadas con la línea dorada exacta del P/E Ratio en cada período.'
                : 'Nominal EPS bars overlaid with exact golden P/E ratio trajectory line for each period.'}
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
                  ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar size={13} />
              {locale === 'es' ? 'Anual' : 'Annual'}
            </button>
            <button
              onClick={() => setViewMode('quarterly')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'quarterly'
                  ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
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
            
            {/* SVG OVERLAY: Línea de P/E Ratio superpuesta con precisión absoluta a los centros DOM */}
            <svg
              className="absolute left-0 top-0 h-60 pointer-events-none z-30 overflow-visible"
              style={{ width: `${Math.max(svgTotalWidth, activeSeries.length * 116)}px` }}
            >
              <defs>
                <filter id="glow-pe" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="peLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Trazo continuo de la línea P/E Ratio */}
              {peSvgPath && (
                <path
                  d={peSvgPath}
                  fill="none"
                  stroke="url(#peLineGradient)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow-pe)"
                  className="transition-all duration-300 opacity-95"
                />
              )}

              {/* Puntos / Nodos sobre cada barra con Cápsula aislante de fondo sin empalmes */}
              {peLinePoints.map((pt) => {
                // Inteligencia de posición Y para la cápsula de P/E (arriba o abajo del nodo)
                const isNearTop = pt.y < 55;
                const pillY = isNearTop ? pt.y + 12 : pt.y - 20;

                return (
                  <g key={`pt-${pt.key}`}>
                    {/* Cápsula SVG aislante con fondo sólido #090d16 para evitar empalmes de texto */}
                    {pt.pe > 0 && (
                      <g transform={`translate(${pt.x}, ${pillY})`}>
                        <rect
                          x="-22"
                          y="-9"
                          width="44"
                          height="15"
                          rx="4"
                          fill="#090d16"
                          stroke={pt.isProjection ? '#c084fc' : '#f59e0b'}
                          strokeWidth="1.2"
                          className="shadow-lg"
                        />
                        <text
                          x="0"
                          y="2.5"
                          textAnchor="middle"
                          fill={pt.isProjection ? '#e9d5ff' : '#fef08a'}
                          fontSize="9.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {pt.pe.toFixed(1)}x
                        </text>
                      </g>
                    )}

                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="5"
                      fill={pt.isProjection ? '#c084fc' : '#fbbf24'}
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}
            </svg>

            {activeSeries.map((item, idx) => {
              const heightPercent = Math.max(8, Math.min(100, (Math.abs(item.eps) / maxEps) * 100));
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
                  {/* 1. Zona Superior: Badges + Valor EPS + Barra (Altura Fija de 240px alineada al fondo) */}
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

                    {/* Valor nominal del EPS */}
                    <span
                      className={`text-xs font-mono font-black mb-1 transition-colors ${
                        item.isProjection ? 'text-purple-300 group-hover:text-purple-200' : 'text-slate-200 group-hover:text-white'
                      }`}
                    >
                      ${item.eps.toFixed(2)}
                    </span>

                    {/* Barra alineada matemática y físicamente en la misma línea base */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full max-w-[44px] rounded-t-lg transition-all duration-300 relative overflow-hidden ${
                        item.isProjection
                          ? 'bg-gradient-to-t from-purple-900/60 via-purple-600/50 to-purple-400/80 border-2 border-dashed border-purple-400/80 shadow-lg shadow-purple-500/20 group-hover:from-purple-800/80 group-hover:to-purple-300'
                          : isNegative
                          ? 'bg-gradient-to-t from-rose-900/60 via-rose-600/60 to-rose-400 border border-rose-500/50 shadow-lg shadow-rose-500/10'
                          : 'bg-gradient-to-t from-emerald-950 via-emerald-600/70 to-emerald-400 border border-emerald-400/40 shadow-lg shadow-emerald-500/20 group-hover:brightness-125'
                      } ${isHovered ? 'scale-105 ring-2 ring-teal-400' : ''}`}
                    >
                      {item.isProjection && (
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.08)_75%,transparent_75%,transparent)] bg-[length:8px_8px] pointer-events-none" />
                      )}
                    </div>
                  </div>

                  {/* 2. Zona Inferior: Eje X (Etiqueta Período + Precio Acción + PE Ratio) */}
                  <div className="mt-2.5 flex flex-col items-center text-center w-full min-h-[110px]">
                    <span
                      className={`text-[11px] font-bold tracking-tight transition-colors ${
                        item.isProjection ? 'text-purple-400 font-black' : 'text-slate-300'
                      }`}
                    >
                      {item.label}
                    </span>

                    {/* Precio de la Acción */}
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

                    {/* PE Ratio del Período */}
                    {item.peRatio !== null && (
                      <span className="mt-1 text-[9px] font-mono font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <Activity size={9} className="text-amber-400" />
                        P/E: {item.peRatio.toFixed(1)}x
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
              <span className="text-[10px] text-purple-300 font-extrabold uppercase tracking-wider block">
                {hoveredItem.isProjection
                  ? (locale === 'es' ? 'Precio Proyectado (Mix)' : 'Projected Price (Mix)')
                  : (locale === 'es' ? 'Precio de la Acción' : 'Stock Price')}
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

            {/* Metricas PE Ratio */}
            <div>
              <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider block">
                {locale === 'es' ? 'P/E Ratio del Período' : 'Period P/E Ratio'}
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
            <div className="flex items-center gap-1.5 text-amber-300 font-mono font-bold">
              <span className="h-0.5 w-4 bg-amber-400 inline-block shadow-[0_0_8px_#f59e0b]" />
              <span>{locale === 'es' ? 'Línea de Tendencia P/E Ratio' : 'P/E Ratio Line Trajectory'}</span>
            </div>
          </div>

          {viewMode === 'quarterly' && (
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
              <Info size={13} />
              <span>
                {locale === 'es'
                  ? 'La línea dorada conecta la trayectoria del P/E Ratio atravesando las barras de EPS'
                  : 'Golden line tracks P/E Ratio trajectory across EPS bars'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
