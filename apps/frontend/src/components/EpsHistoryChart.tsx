'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart3, TrendingUp, Sparkles, CheckCircle2, Calendar, HelpCircle, Layers, ArrowUpRight, ArrowDownRight, Info, ChevronLeft, ChevronRight } from 'lucide-react';
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

interface EpsHistoryChartProps {
  ticker: any;
  quarters: QuarterData[] | null | undefined;
  snapshot?: any;
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
}

export const EpsHistoryChart: React.FC<EpsHistoryChartProps> = ({ ticker, quarters, snapshot }) => {
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
  const [hoveredItem, setHoveredItem] = useState<ChartItem | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 1. Extraer estimaciones anuales futuras de analistas desde el snapshot
  const analystEstimates = useMemo(() => {
    const estimatesObj = snapshot?.analystEstimates;
    if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) return [];

    const years: string[] = estimatesObj.years;
    const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;

    // Buscar la fila de EPS
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

  // 2. Procesar TODOS los datos Anuales (EDGAR reales completicos + Proyecciones futuras)
  const annualData = useMemo<ChartItem[]>(() => {
    const validQuarters = (quarters || []).filter((q) => q && q.fiscalYear && !isNaN(Number(q.fiscalYear)));

    // Agrupar trimestres por año fiscal
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
        });
      }
    });

    const lastHistoricalFY = historicalAnnualItems.length > 0
      ? historicalAnnualItems[historicalAnnualItems.length - 1].fiscalYear
      : 2024;

    const futureAnnualItems: ChartItem[] = analystEstimates
      .filter((est) => est.fiscalYear > lastHistoricalFY)
      .map((est) => ({
        key: `fy-est-${est.fiscalYear}`,
        label: `FY${est.fiscalYear}`,
        subLabel: locale === 'es' ? 'Proyección Wall St' : 'Wall St Forecast',
        fiscalYear: est.fiscalYear,
        periodName: `FY${est.fiscalYear}`,
        eps: est.eps,
        isProjection: true,
        source: 'Wall Street Analysts',
        growthPercent: null,
      }));

    // Incluir TODO el historial sin recortes rígidos
    const combined = [...historicalAnnualItems, ...futureAnnualItems];

    // Calcular crecimiento % periodo a periodo
    combined.forEach((item, idx) => {
      if (idx > 0) {
        const prev = combined[idx - 1].eps;
        if (prev !== 0) {
          item.growthPercent = parseFloat((((item.eps - prev) / Math.abs(prev)) * 100).toFixed(1));
        }
      }
    });

    return combined;
  }, [quarters, analystEstimates, locale]);

  // 3. Procesar TODOS los datos Trimestrales (EDGAR reales completicos + Proyecciones)
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

    const historicalQuarterlyItems: ChartItem[] = validQuarters.map((q) => ({
      key: `q-${q.fiscalYear}-${q.period}`,
      label: `${q.period} ${q.fiscalYear}`,
      subLabel: locale === 'es' ? 'Trimestre Confirmado' : 'Confirmed Quarter',
      fiscalYear: parseInt(q.fiscalYear, 10),
      periodName: q.period,
      eps: parseFloat((q.epsDiluted ?? q.eps ?? 0).toFixed(2)),
      isProjection: false,
      source: 'SEC EDGAR',
      growthPercent: null,
    }));

    const lastHistQuarter = validQuarters[validQuarters.length - 1];
    const lastHistFY = parseInt(lastHistQuarter.fiscalYear, 10);

    const futureQuarterlyItems: ChartItem[] = [];
    const futureAnnuals = analystEstimates.filter((est) => est.fiscalYear >= lastHistFY);

    futureAnnuals.forEach((est) => {
      const periods = ['Q1', 'Q2', 'Q3', 'Q4'];
      periods.forEach((p) => {
        const existsInHist = validQuarters.some((q) => parseInt(q.fiscalYear, 10) === est.fiscalYear && q.period === p);
        if (!existsInHist) {
          const weight = seasonalityWeights[p] || 0.25;
          const estimatedQEps = parseFloat((est.eps * weight).toFixed(2));

          futureQuarterlyItems.push({
            key: `q-est-${est.fiscalYear}-${p}`,
            label: `${p} ${est.fiscalYear}`,
            subLabel: locale === 'es' ? 'Est. Fórmula Estacional' : 'Seasonal Formula Est.',
            fiscalYear: est.fiscalYear,
            periodName: p,
            eps: estimatedQEps,
            isProjection: true,
            source: 'Formula Estacional (Wall St)',
            growthPercent: null,
            seasonalityWeight: parseFloat((weight * 100).toFixed(1)),
          });
        }
      });
    });

    // Incluir TODO el historial sin recortes
    const combined = [...historicalQuarterlyItems, ...futureQuarterlyItems];

    // Calcular crecimiento % periodo a periodo
    combined.forEach((item, idx) => {
      if (idx > 0) {
        const prev = combined[idx - 1].eps;
        if (prev !== 0) {
          item.growthPercent = parseFloat((((item.eps - prev) / Math.abs(prev)) * 100).toFixed(1));
        }
      }
    });

    return combined;
  }, [quarters, analystEstimates, locale]);

  const activeSeries = viewMode === 'annual' ? annualData : quarterlyData;

  // Auto-scroll inicial a la vista de años o trimestres recientes / proyecciones al cambiar el modo
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Posicionar el scroll hacia el 75% o final para mostrar el presente y proyecciones por default
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

  // Determinar max EPS para escalar la altura de las barras
  const maxEps = useMemo(() => {
    if (activeSeries.length === 0) return 1;
    const maxVal = Math.max(...activeSeries.map((d) => Math.abs(d.eps)));
    return maxVal > 0 ? maxVal * 1.25 : 1;
  }, [activeSeries]);

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
              {locale === 'es' ? 'Histórico y Proyecciones de EPS' : 'EPS Historical & Growth Forecasts'}
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={10} /> SEC EDGAR + Wall St
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {locale === 'es'
                ? 'Navega deslizando horizontalmente hacia la izquierda (pasado) o derecha (futuro proyectado).'
                : 'Scroll horizontally left (past history) or right (future projections).'}
            </p>
          </div>
        </div>

        {/* Action Controls: Scroll Arrows & Mode Switcher */}
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          {/* Scroll Arrows */}
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

          {/* View Mode Toggle */}
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
        {/* Left Scroll Gradient Cue */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none z-10 opacity-70" />
        {/* Right Scroll Gradient Cue */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none z-10 opacity-70" />

        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent pt-6 pb-4 px-4 scroll-smooth"
        >
          <div className="flex items-end gap-3 h-64 border-b border-slate-800/80 pb-2 w-max min-w-full">
            {activeSeries.map((item) => {
              const heightPercent = Math.max(8, Math.min(100, (Math.abs(item.eps) / maxEps) * 100));
              const isNegative = item.eps < 0;
              const isHovered = hoveredItem?.key === item.key;

              return (
                <div
                  key={item.key}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className="flex-none w-20 sm:w-24 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                >
                  {/* Badge de % Crecimiento Periodo a Periodo */}
                  {item.growthPercent !== null ? (
                    <div
                      className={`mb-2 inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full border shadow-md transition-all ${
                        item.growthPercent >= 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 group-hover:scale-110'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30 group-hover:scale-110'
                      }`}
                    >
                      {item.growthPercent >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {item.growthPercent >= 0 ? '+' : ''}
                      {item.growthPercent}%
                    </div>
                  ) : (
                    <div className="mb-2 text-[10px] font-semibold text-slate-500">—</div>
                  )}

                  {/* Valor nominal sobre la barra */}
                  <span
                    className={`text-xs font-mono font-black mb-1 transition-colors ${
                      item.isProjection ? 'text-purple-300 group-hover:text-purple-200' : 'text-slate-200 group-hover:text-white'
                    }`}
                  >
                    ${item.eps.toFixed(2)}
                  </span>

                  {/* Barra interactiva */}
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
                    {/* Patrón rayado en diagonal para resaltar barras proyectadas no materializadas */}
                    {item.isProjection && (
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.08)_75%,transparent_75%,transparent)] bg-[length:8px_8px] pointer-events-none" />
                    )}
                  </div>

                  {/* Etiqueta de Período en el Eje X */}
                  <div className="mt-2 flex flex-col items-center text-center">
                    <span
                      className={`text-[11px] font-bold tracking-tight transition-colors ${
                        item.isProjection ? 'text-purple-400 font-black' : 'text-slate-300'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.isProjection && (
                      <span className="inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase tracking-widest text-purple-300 bg-purple-500/20 border border-purple-500/40 rounded px-1 mt-0.5">
                        <Sparkles size={8} /> {locale === 'es' ? 'PROYECTADO' : 'ESTIMATE'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Rich Info Box on Hover / Selected Item */}
      {hoveredItem ? (
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 text-xs transition-all animate-fadeIn">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg border ${
                hoveredItem.isProjection
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {hoveredItem.isProjection ? <Sparkles size={16} /> : <CheckCircle2 size={16} />}
            </div>
            <div>
              <div className="font-extrabold text-white flex items-center gap-2">
                <span>{hoveredItem.label}</span>
                <span className="text-[10px] text-slate-400 font-normal">({hoveredItem.subLabel})</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>{locale === 'es' ? 'Fuente:' : 'Source:'}</span>
                <strong className={hoveredItem.isProjection ? 'text-purple-300' : 'text-emerald-400'}>
                  {hoveredItem.source}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{locale === 'es' ? 'EPS Nominal' : 'Nominal EPS'}</span>
              <span className="text-base font-black text-white">${hoveredItem.eps.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{locale === 'es' ? 'Crecimiento %' : 'Growth %'}</span>
              <span
                className={`text-base font-black ${
                  (hoveredItem.growthPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {hoveredItem.growthPercent !== null ? `${hoveredItem.growthPercent >= 0 ? '+' : ''}${hoveredItem.growthPercent}%` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Explanatory Footer Legend */
        <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-900/30 border border-slate-900 rounded-xl text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-emerald-500 border border-emerald-400" />
              <span>{locale === 'es' ? 'Histórico Real (SEC EDGAR)' : 'Real Historical (SEC EDGAR)'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-purple-500 border border-dashed border-purple-300" />
              <span>{locale === 'es' ? 'Proyección Futura (Wall Street)' : 'Future Estimate (Wall Street)'}</span>
            </div>
          </div>

          {viewMode === 'quarterly' && (
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
              <Info size={13} />
              <span>
                {locale === 'es'
                  ? 'Fórmula: EPS Trimestral Est. = EPS Anual Proyectado × % Estacionalidad Histórica'
                  : 'Formula: Qtr Est. EPS = Annual Projected EPS × Historical Seasonality %'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
