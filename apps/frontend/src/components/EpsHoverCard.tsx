'use client';

import { CheckCircle2, Info, Calculator } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ChartItem } from '@/lib/epsChartData';

// Cuadro de detalle del periodo bajo el mouse (EPS, crecimiento, precio y P/E; proyección Mix si aplica).
export function EpsHoverCard({ hoveredItem, viewMode }: { hoveredItem: ChartItem | null; viewMode: 'annual' | 'quarterly' }) {
  const locale = useLocale();
  const tt = useTranslations('Terms');
  return (
      hoveredItem ? (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 text-xs transition-all animate-fadeIn">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                hoveredItem.isProjection
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                  : 'bg-favorable-500/10 border-favorable-500/30 text-favorable-400'
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
                <strong className={hoveredItem.isProjection ? 'text-purple-300' : 'text-favorable-400'}>
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
                    hoveredItem.growthPercent >= 0 ? 'text-favorable-400' : 'text-risk-400'
                  }`}
                >
                  EPS {hoveredItem.growthPercent >= 0 ? '+' : ''}{hoveredItem.growthPercent}% vs prev
                </span>
              )}
            </div>

            {/* Metricas Precio Acción */}
            <div className="border-r border-slate-800 pr-6">
              <span className="text-[10px] text-accent-300 font-extrabold uppercase tracking-wider block">
                {hoveredItem.isProjection
                  ? (locale === 'es' ? 'Precio Proyectado (Escenario Mix)' : 'Projected Price (Mix Scenario)')
                  : (locale === 'es' ? 'Precio al Cierre Solar' : 'Solar Close Stock Price')}
              </span>
              <span className="text-base font-black text-accent-300">
                {hoveredItem.stockPrice !== null ? `$${hoveredItem.stockPrice.toFixed(2)}` : 'N/A'}
              </span>
              {hoveredItem.priceGrowthPercent !== null && (
                <span
                  className={`text-[11px] font-bold block ${
                    hoveredItem.priceGrowthPercent >= 0 ? 'text-favorable-400' : 'text-risk-400'
                  }`}
                >
                  Precio {hoveredItem.priceGrowthPercent >= 0 ? '+' : ''}{hoveredItem.priceGrowthPercent}% vs prev
                </span>
              )}
            </div>

            {/* Metricas PE Ratio Calendario Solar */}
            <div>
              <span className="text-[10px] text-caution-300 font-extrabold uppercase tracking-wider block">
                {locale === 'es' ? 'P/E Ratio (Calendario Solar)' : 'Solar Calendar P/E Ratio'}
              </span>
              <span className="text-base font-black text-caution-300">
                {hoveredItem.peRatio !== null ? `${hoveredItem.peRatio.toFixed(1)}x` : 'N/A'}
              </span>
              {hoveredItem.isProjection && (
                <span className="text-[10px] text-purple-300 block">
                  {tt('mixPe')}
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
              <span className="h-3 w-3 rounded bg-favorable-500 border border-favorable-400" />
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
            <div className="flex items-center gap-1.5 text-caution-300 font-mono font-bold">
              <span className="h-0.5 w-4 bg-caution-400 inline-block shadow-[0_0_8px_var(--color-caution-500)]" />
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
      )
  );
}
