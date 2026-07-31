'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { Layers, Activity, TrendingUp, ShieldCheck, PieChart, Users, ChevronRight, Zap, Crown, Sliders, ArrowRightLeft, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';

interface FundamentalTablesTabProps {
  snapshot: any;
}

export const FundamentalTablesTab: React.FC<FundamentalTablesTabProps> = ({ snapshot }) => {
  const locale = useLocale();
  const { user, role } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Access Control: Se requiere rol PRO_USER o ADMIN para interactuar
  const hasAccess = role === 'PRO_USER' || role === 'ADMIN';

  if (!snapshot) return null;

  const tablesObj = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  const estimatesObj = snapshot.analystEstimates && typeof snapshot.analystEstimates === 'object' ? snapshot.analystEstimates : null;
  const scoresObj = snapshot.scores && typeof snapshot.scores === 'object' ? snapshot.scores : {};

  const [activeTab, setActiveTab] = useState<string>('all');

  // Define tab mapping with embedded Sub-Scores badges
  const tabs = [
    { 
      id: 'all', 
      label: locale === 'es' ? 'Todos los Datos' : 'All Data', 
      icon: Layers,
      score: null,
    },
    { 
      id: 'financialStrength', 
      label: locale === 'es' ? 'Fuerza Financiera' : 'Financial Strength', 
      icon: ShieldCheck,
      score: scoresObj.financialStrength ?? null,
    },
    { 
      id: 'profitability', 
      label: locale === 'es' ? 'Rentabilidad' : 'Profitability', 
      icon: Activity,
      score: scoresObj.profitability ?? null,
    },
    { 
      id: 'valuation', 
      label: locale === 'es' ? 'Valuación' : 'Valuation', 
      icon: PieChart,
      score: scoresObj.valuation ?? null,
    },
    { 
      id: 'growth', 
      label: locale === 'es' ? 'Crecimiento' : 'Growth', 
      icon: TrendingUp,
      score: scoresObj.growth ?? null,
    },
    { 
      id: 'momentum', 
      label: locale === 'es' ? 'Momento' : 'Momentum', 
      icon: Zap,
      score: scoresObj.momentum ?? null,
    },
    { 
      id: 'estimates', 
      label: locale === 'es' ? 'Proyecciones Wall St.' : 'Wall St. Forecasts', 
      icon: Users,
      score: null,
    },
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
    momentum: {
      title: locale === 'es' ? 'Momento Técnico (Momentum)' : 'Technical Momentum',
      keys: ['momentum'],
    },
  };

  const parsePercent = (val: string | undefined): number | null => {
    if (!val) return null;
    const num = parseFloat(val.replace('%', ''));
    return isNaN(num) ? null : num;
  };

  const renderIndicatorTable = (title: string, rows: any[]) => {
    if (!rows || rows.length === 0) return null;

    return (
      <div key={title} className="flex flex-col gap-3">
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

  const renderAnalystEstimatesTable = () => {
    if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) {
      return (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-500 text-xs">
          {locale === 'es' ? 'No se encontraron proyecciones futuras de analistas para esta acción.' : 'No analyst projections available for this stock.'}
        </div>
      );
    }

    const years: string[] = estimatesObj.years;
    const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;

    return (
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-l-4 border-emerald-400 pl-2.5 py-0.5">
          {locale === 'es' ? 'Proyecciones Futuras de Wall Street (Multi-Year Forecasts)' : 'Wall Street Multi-Year Financial Forecasts'}
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

  // VISTA DE BLOQUEO PARA USUARIOS SIN ACCESO (FREE USER O NO LOGUEADOS)
  if (!hasAccess) {
    return (
      <>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-8 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center text-center max-w-xl mx-auto py-6 gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 shadow-lg shadow-purple-500/10">
              <Crown size={32} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-purple-400">
                {locale === 'es' ? 'Tablas de Fundamentos Protegidas' : 'Protected Fundamental Tables'}
              </span>
              <h3 className="text-2xl font-extrabold text-white tracking-tight">
                {locale === 'es' ? 'Análisis de Fuerza Financiera, Valuación y Rentabilidad' : 'Financial Strength, Valuation & Profitability Breakdown'}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {locale === 'es'
                  ? 'Explora las métricas fundamentales detalladas: Fuerza Financiera, Rentabilidad, Valuación, Crecimiento, Momento Técnico y Proyecciones Futuras de Wall Street.'
                  : 'Unlock detailed fundamental matrices: Financial Strength, Profitability, Valuation Multiples, Growth, Momentum, and Wall Street Forecasts.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full my-2 text-left">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-teal-400" />
                  {locale === 'es' ? 'Fuerza & Solvencia' : 'Strength & Solvency'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Ratings de deuda y liquidez' : 'Debt & liquidity ratings'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <PieChart size={14} className="text-purple-400" />
                  {locale === 'es' ? 'Múltiples de Valuación' : 'Valuation Ratios'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Comparación frente a industria' : 'Industry rank comparison'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-400" />
                  {locale === 'es' ? 'Estimados Wall St.' : 'Wall St. Forecasts'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Proyecciones multi-año de analistas' : 'Multi-year analyst forecasts'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full mt-2">
              {!user ? (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 via-teal-400 to-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider hover:opacity-90 transition shadow-xl shadow-purple-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn size={16} />
                  <span>{locale === 'es' ? 'Iniciar Sesión para Obtener Premium' : 'Sign In to Access Premium'}</span>
                </button>
              ) : (
                <button
                  onClick={() => alert(locale === 'es' ? 'Ponte en contacto con administración o actualiza a plan Premium para habilitar acceso.' : 'Contact admin or upgrade your account to Premium.')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-500 text-white font-black text-xs uppercase tracking-widest hover:brightness-110 transition shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Crown size={16} />
                  <span>{locale === 'es' ? 'UPGRADE A PREMIUM USER' : 'UPGRADE TO PREMIUM USER'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // VISTA COMPLETA (ADMIN & PRO_USER)
  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col gap-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
          {locale === 'es' ? 'Explorar Tablas Fundamentales BHT' : 'Explore BHT Fundamental Tables'}
        </span>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800 border-b border-slate-900">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 text-slate-400 border-slate-900 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                <span>{tab.label}</span>
                {tab.score && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono transition-colors ${
                    isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-teal-400'
                  }`}>
                    {tab.score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        {renderTabContent()}
      </div>
    </div>
  );
};

