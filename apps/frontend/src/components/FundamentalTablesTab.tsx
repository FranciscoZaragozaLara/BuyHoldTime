'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { Layers, Activity, TrendingUp, ShieldCheck, PieChart, Users, ChevronRight } from 'lucide-react';

interface FundamentalTablesTabProps {
  snapshot: any;
}

export const FundamentalTablesTab: React.FC<FundamentalTablesTabProps> = ({ snapshot }) => {
  const locale = useLocale();

  if (!snapshot) return null;

  const tablesObj = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  const estimatesObj = snapshot.analystEstimates && typeof snapshot.analystEstimates === 'object' ? snapshot.analystEstimates : null;

  const [activeTab, setActiveTab] = useState<string>('all');

  // Define tab mapping
  const tabs = [
    { id: 'all', label: locale === 'es' ? 'Todos los Datos' : 'All Data', icon: Layers },
    { id: 'financialStrength', label: locale === 'es' ? 'Fuerza Financiera' : 'Financial Strength', icon: ShieldCheck },
    { id: 'profitability', label: locale === 'es' ? 'Rentabilidad' : 'Profitability', icon: Activity },
    { id: 'valuation', label: locale === 'es' ? 'Valuación' : 'Valuation', icon: PieChart },
    { id: 'growth', label: locale === 'es' ? 'Crecimiento' : 'Growth', icon: TrendingUp },
    { id: 'estimates', label: locale === 'es' ? 'Estimaciones Analistas' : 'Analyst Estimates', icon: Users },
  ];

  // Map category IDs to display names and keys inside tablesObj
  const sectionMapping: Record<string, { title: string; keys: string[] }> = {
    financialStrength: {
      title: locale === 'es' ? 'Fuerza Financiera & Liquidez' : 'Financial Strength & Liquidity',
      keys: ['financialStrength', 'liquidity'],
    },
    profitability: {
      title: locale === 'es' ? 'Rentabilidad & Eficiencia' : 'Profitability & Efficiency',
      keys: ['profitability'],
    },
    valuation: {
      title: locale === 'es' ? 'Múltiples & Valuación' : 'Valuation Multiples',
      keys: ['valuation'],
    },
    growth: {
      title: locale === 'es' ? 'Crecimiento (Growth Rank)' : 'Growth Rank',
      keys: ['growth'],
    },
  };

  // Helper to parse percentage strings like "61.81%" -> 61.81
  const parsePercent = (val: string | undefined): number | null => {
    if (!val) return null;
    const num = parseFloat(val.replace('%', ''));
    return isNaN(num) ? null : num;
  };

  // Helper to render a table for a set of rows
  const renderIndicatorTable = (title: string, rows: any[]) => {
    if (!rows || rows.length === 0) return null;

    return (
      <div key={title} className="flex flex-col gap-3">
        {/* Title Header with Left Green Accent Bar */}
        <h4 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-l-4 border-emerald-400 pl-2.5 py-0.5">
          {title}
        </h4>

        <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[200px]">{locale === 'es' ? 'Indicador' : 'Indicator'}</th>
                <th className="p-3.5 text-right w-32">{locale === 'es' ? 'Valor Extraído' : 'Extracted Value'}</th>
                <th className="p-3.5 w-48">{locale === 'es' ? 'Comparación Industria' : 'Industry Rank'}</th>
                <th className="p-3.5 w-48">{locale === 'es' ? 'Historial' : 'Historical Rank'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-sans">
              {rows.map((row: any, idx: number) => {
                const vsIndNum = parsePercent(row.vsIndustry);
                const vsHistNum = parsePercent(row.vsHistory);

                return (
                  <tr key={idx} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="p-3.5 pl-4 font-semibold text-slate-200 flex items-center gap-1.5">
                      <ChevronRight size={12} className="text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0" />
                      <span>{row.name}</span>
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-white text-sm">
                      {row.current ?? 'N/A'}
                    </td>
                    {/* Industry Comparison Bar (Green) */}
                    <td className="p-3.5 font-mono">
                      {vsIndNum !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(0, vsIndNum))}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-300 w-12 text-right">
                            {row.vsIndustry}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </td>
                    {/* History Comparison Bar (Blue) */}
                    <td className="p-3.5 font-mono">
                      {vsHistNum !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(0, vsHistNum))}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-300 w-12 text-right">
                            {row.vsHistory}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render Analyst Estimates matrix table
  const renderAnalystEstimatesTable = () => {
    if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) {
      return (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-500 text-xs">
          {locale === 'es' ? 'No se encontraron estimaciones futuras de analistas para esta acción.' : 'No analyst projections available for this stock.'}
        </div>
      );
    }

    const years: string[] = estimatesObj.years;
    const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;

    return (
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-l-4 border-emerald-400 pl-2.5 py-0.5">
          {locale === 'es' ? 'Proyecciones Futuras de Analistas (Wall Street)' : 'Wall Street Financial Projections'}
        </h4>
        <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[180px]">{locale === 'es' ? 'Métrica Promedio' : 'Forecast Metric'}</th>
                {years.map((y) => (
                  <th key={y} className="p-3.5 text-right font-mono text-teal-300">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-mono">
              {estimatesList.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                  <td className="p-3.5 pl-4 font-sans font-extrabold text-slate-200">
                    {row.metric}
                  </td>
                  {years.map((_, yearIdx) => {
                    const val = row.values[yearIdx] ?? '—';
                    return (
                      <td key={yearIdx} className="p-3.5 text-right font-bold text-white">
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Determine sections to show based on active tab
  const renderTabContent = () => {
    if (activeTab === 'estimates') {
      return renderAnalystEstimatesTable();
    }

    let keysToRender: string[] = [];
    if (activeTab === 'all') {
      keysToRender = Object.keys(tablesObj);
    } else if (sectionMapping[activeTab]) {
      keysToRender = sectionMapping[activeTab].keys;
    }

    const sectionsToDisplay = keysToRender.map((key) => {
      const rows = tablesObj[key] || [];
      const title = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      return { key, title, rows };
    }).filter((s) => s.rows.length > 0);

    if (sectionsToDisplay.length === 0) {
      return (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-500 text-xs">
          {locale === 'es' ? 'No hay datos disponibles para esta categoría.' : 'No data available for this category.'}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8">
        {sectionsToDisplay.map((sec) => renderIndicatorTable(sec.title, sec.rows))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      {/* Navigation Tabs Header */}
      <div className="flex flex-col gap-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
          {locale === 'es' ? 'Explorar Tablas Fundamentales' : 'Explore Fundamental Tables'}
        </span>

        {/* Tab Buttons (Scrollable) */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800 border-b border-slate-900">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 text-slate-400 border-slate-900 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="pt-2">
        {renderTabContent()}
      </div>
    </div>
  );
};
