'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { BarChart2, Activity, TrendingUp, ShieldCheck, PieChart, Users, ChevronRight, Zap, Crown, LogIn, Layers, Percent, HelpCircle, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { formatMetricValue, isCuratedSection, metricDef, metricLabel, sectionRows } from '@/lib/fundamentalMetrics';

/** Fila de una tabla de fundamentos (snapshot del GuruFocus Scrapper). */
interface IndicatorRow {
  name: string;
  current?: string | number | null;
  vsIndustry?: string;
  vsHistory?: string;
}

interface FundamentalTablesTabProps {
  snapshot: any;
}

export const FundamentalTablesTab: React.FC<FundamentalTablesTabProps> = ({ snapshot }) => {
  const locale = useLocale();
  const { user, role } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Access Control: Se requiere rol PRO_USER o ADMIN para interactuar
  const hasAccess = role === 'PRO_USER' || role === 'ADMIN';
  const isAdmin = role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<string>('all');
  // Rangos frente a la industria y a su historia (barras): solo administradores, que pueden cambiar a la vista
  // simplificada que ven los demás usuarios.
  const [adminBars, setAdminBars] = useState(true);
  const showRanks = isAdmin && adminBars;

  if (!snapshot) return null;

  const tablesObj = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  const estimatesObj = snapshot.analystEstimates && typeof snapshot.analystEstimates === 'object' ? snapshot.analystEstimates : null;
  const scoresObj = snapshot.scores && typeof snapshot.scores === 'object' ? snapshot.scores : {};

  // Orden exacto de tabs solicitado
  const tabs = [
    {
      id: 'all',
      label: locale === 'es' ? 'Todos' : 'All',
      icon: Layers,
      score: null,
    },
    {
      id: 'keyMetrics',
      label: locale === 'es' ? 'Métricas clave' : 'Key Metrics',
      icon: BarChart2,
      score: null,
    },
    {
      id: 'estimates',
      label: locale === 'es' ? 'Proyecciones Wall St.' : 'Wall St. Forecasts',
      icon: Users,
      score: null,
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
      id: 'profitability',
      label: locale === 'es' ? 'Rentabilidad' : 'Profitability',
      icon: Activity,
      score: scoresObj.profitability ?? null,
    },
    {
      id: 'financialStrength',
      label: locale === 'es' ? 'Fuerza Financiera' : 'Financial Strength',
      icon: ShieldCheck,
      score: scoresObj.financialStrength ?? null,
    },
    {
      id: 'momentum',
      label: locale === 'es' ? 'Momento' : 'Momentum',
      icon: Zap,
      score: scoresObj.momentum ?? null,
    },
    {
      id: 'dividends',
      label: locale === 'es' ? 'Dividendos' : 'Dividends',
      icon: Percent,
      score: null,
    },
  ];

  // Orden de claves para el tab "Todos" y mapa por tab individual
  // (la liquidez del snapshot se publica dentro de Fuerza financiera)
  const ALLOWED_KEYS_ORDERED = ['keyMetrics', 'valuation', 'growth', 'profitability', 'financialStrength', 'momentum', 'dividends'];

  const sectionMapping: Record<string, { title: string; keys: string[] }> = {
    keyMetrics: {
      title: locale === 'es' ? 'Métricas clave' : 'Key Metrics',
      keys: ['keyMetrics'],
    },
    valuation: {
      title: locale === 'es' ? 'Múltiples & Valuación' : 'Valuation Multiples',
      keys: ['valuation'],
    },
    growth: {
      title: locale === 'es' ? 'Crecimiento' : 'Growth',
      keys: ['growth'],
    },
    profitability: {
      title: locale === 'es' ? 'Rentabilidad & Eficiencia' : 'Profitability & Efficiency',
      keys: ['profitability'],
    },
    financialStrength: {
      title: locale === 'es' ? 'Fuerza Financiera & Liquidez' : 'Financial Strength & Liquidity',
      keys: ['financialStrength'],
    },
    momentum: {
      title: locale === 'es' ? 'Momento' : 'Momentum',
      keys: ['momentum'],
    },
    dividends: {
      title: locale === 'es' ? 'Dividendos' : 'Dividends',
      keys: ['dividends'],
    },
  };


  const parsePercent = (val: string | undefined): number | null => {
    if (!val) return null;
    const num = parseFloat(val.replace('%', ''));
    return isNaN(num) ? null : num;
  };

  const formatNumberWithCommas = (val: any): string => {
    if (val === null || val === undefined || val === '') return 'N/A';
    const strVal = String(val).trim();
    const match = strVal.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) return strVal;
    const [, prefix, numStr, suffix] = match;
    const num = parseFloat(numStr);
    if (isNaN(num)) return strVal;

    const parts = numStr.split('.');
    const integerPart = Math.abs(parseInt(parts[0], 10)).toLocaleString('en-US');
    const decimalPart = parts[1] !== undefined ? `.${parts[1]}` : '';
    const sign = num < 0 ? '-' : '';

    return `${prefix}${sign}${integerPart}${decimalPart}${suffix}`;
  };

  // Nombre y valor de cada fila: del diccionario de métricas publicadas (src/lib/fundamentalMetrics); si el valor no
  // se puede leer, el formato genérico.
  const rowLabel = (row: IndicatorRow) => metricLabel(row.name, locale);
  const rowValue = (row: IndicatorRow) => formatMetricValue(row.name, row.current, locale) ?? formatNumberWithCommas(row.current);

  // Explicación del indicador al pasar sobre la (i). En la vista compacta se ancla a la tarjeta (arriba, a su ancho: abajo la taparía la sección siguiente)
  // para no salirse de la pantalla en la columna derecha.
  // Todas las métricas publicadas tienen explicación revisada en ES y EN (src/lib/fundamentalMetrics; lo verifica su prueba).
  const renderTooltip = (row: IndicatorRow, compact: boolean) => {
    const exp = metricDef(row.name);
    if (!exp) return null;
    const desc = locale === 'es' ? exp.descEs : exp.descEn;
    const pos = locale === 'es' ? exp.positiveEs : exp.positiveEn;
    const neg = locale === 'es' ? exp.negativeEs : exp.negativeEn;
    return (
      <div className={`group/tooltip inline-block ml-1 ${compact ? '' : 'relative'}`}>
        <Info size={14} className="text-slate-500 hover:text-accent-400 cursor-pointer transition-colors shrink-0" />
        <div className={`pointer-events-none absolute hidden group-hover/tooltip:block z-[999] rounded-xl border border-slate-700 bg-slate-950 p-3.5 shadow-2xl backdrop-blur-2xl transition-all ${
          compact ? 'left-0 right-0 bottom-full mb-1 min-w-[16rem]' : 'left-6 top-1/2 -translate-y-1/2 w-72 sm:w-80'
        }`}>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-2">
            <HelpCircle size={14} className="text-accent-400 shrink-0" />
            <span className="font-bold text-xs text-white uppercase tracking-wider">{rowLabel(row)}</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed mb-2.5 whitespace-normal">
            {desc}
          </p>
          <div className="flex flex-col gap-1.5 text-[10px] bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-sans whitespace-normal">
            <div className="text-favorable-300 leading-snug">{pos}</div>
            <div className="text-risk-300 leading-snug">{neg}</div>
          </div>
          {row.current && (
            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px]">
              <span className="text-slate-400">{locale === 'es' ? 'Valor actual:' : 'Current value:'}</span>
              <span className="font-mono font-bold text-accent-300">{rowValue(row)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Vista simplificada (usuarios no admin, o admin con el switch): solo indicador y valor, en una cuadrícula de
  // 1–3 columnas que ocupa mucho menos alto que la tabla de ancho completo.
  const renderCompactGrid = (title: string, rows: IndicatorRow[]) => (
    <div key={title} className="flex flex-col gap-3">
      <h4 className="text-sm font-black uppercase tracking-wider text-favorable-400 flex items-center gap-2 border-l-4 border-favorable-400 pl-2.5 py-0.5">
        {title}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {rows.map((row, idx) => (
          <div
            key={row.name ? `cell-${row.name}-${idx}` : `cell-${idx}`}
            className="relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-900 bg-slate-950/40 hover:bg-slate-900/30 transition-colors"
          >
            <div className="flex items-center gap-1 min-w-0 text-xs font-semibold text-slate-200">
              <span className="truncate" title={rowLabel(row)}>{rowLabel(row)}</span>
              {renderTooltip(row, true)}
            </div>
            <span className="font-mono font-black text-white text-sm whitespace-nowrap">
              {rowValue(row)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderIndicatorTable = (title: string, rows: any[], sectionKey?: string) => {
    if (!rows || rows.length === 0) return null;

    const isKeyMetrics = sectionKey === 'keyMetrics';
    if (!showRanks) return renderCompactGrid(title, rows);

    return (
      <div key={title} className="flex flex-col gap-3">
        <h4 className="text-sm font-black uppercase tracking-wider text-favorable-400 flex items-center gap-2 border-l-4 border-favorable-400 pl-2.5 py-0.5">
          {title}
        </h4>

        <div className="overflow-x-visible border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[200px]">{locale === 'es' ? 'Indicador' : 'Indicator'}</th>
                <th className="p-3.5 text-right w-32">{locale === 'es' ? 'Valor' : 'Value'}</th>
                {!isKeyMetrics && (
                  <>
                    <th className="p-3.5 w-48">{locale === 'es' ? 'Comparación Industria' : 'Industry Rank'}</th>
                    <th className="p-3.5 w-48">{locale === 'es' ? 'Historial' : 'Historical Rank'}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-sans">
              {rows.map((row: any, idx: number) => {
                const vsIndNum = parsePercent(row.vsIndustry);
                const vsHistNum = parsePercent(row.vsHistory);
                const rowKey = row.name ? `row-${row.name}-${idx}` : `row-${idx}`;

                return (
                  <tr key={rowKey} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="p-3.5 pl-4 font-semibold text-slate-200 flex items-center gap-1.5">
                      <ChevronRight size={12} className="text-slate-600 group-hover:text-favorable-400 transition-colors shrink-0" />
                      <span>{rowLabel(row)}</span>
                      
                      {renderTooltip(row, false)}
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-white text-sm whitespace-nowrap">
                      {rowValue(row)}
                    </td>
                    {!isKeyMetrics && (
                      <>
                        <td className="p-3.5 font-mono">
                          {vsIndNum !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className="h-full bg-favorable-400 rounded-full transition-all duration-500"
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
                      </>
                    )}
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
        <h4 className="text-sm font-black uppercase tracking-wider text-favorable-400 flex items-center gap-2 border-l-4 border-favorable-400 pl-2.5 py-0.5">
          {locale === 'es' ? 'Proyecciones Futuras de Wall Street (Multi-Year Forecasts)' : 'Wall Street Multi-Year Financial Forecasts'}
        </h4>
        <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[180px]">{locale === 'es' ? 'Métrica Promedio' : 'Forecast Metric'}</th>
                {years.map((y) => (
                  <th key={y} className="p-3.5 text-right font-mono text-accent-300">{y}</th>
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
                        {formatNumberWithCommas(val)}
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

    let keysToRender: string[];
    if (activeTab === 'all') {
      // Todos: muestra todas las tablas en el orden permitido
      keysToRender = ALLOWED_KEYS_ORDERED;
    } else {
      const mapping = sectionMapping[activeTab];
      if (!mapping) return null;
      keysToRender = mapping.keys;
    }

    const sectionsToDisplay = keysToRender
      .map((key) => {
        let rows: any[] = tablesObj[key] || [];
        // Fuerza financiera incluye las filas de liquidez (en el snapshot vienen en otra sección)
        if (key === 'financialStrength') {
          rows = [...rows, ...(tablesObj.liquidity || [])];
        }
        // Bloques ya migrados (Métricas clave, Valuación, Crecimiento, Rentabilidad, Fuerza financiera, Momento, Dividendos): solo las métricas publicadas y en su orden
        // (src/lib/fundamentalMetrics)
        if (isCuratedSection(key)) {
          rows = sectionRows(key, rows);
        }
        const title =
          activeTab === 'all'
            ? (sectionMapping[key]?.title ?? (key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')))
            : (sectionMapping[activeTab]?.title ?? key);
        return { key, title, rows };
      })
      .filter((s) => s.rows.length > 0);

    // Switch solo para administradores: vista con barras de rango o la simplificada que ven los demás usuarios.
    const viewSwitch = isAdmin ? (
      <div className="flex items-center justify-end gap-2 -mb-4 text-[11px]">
        <span className="text-slate-500 font-bold uppercase tracking-wider">{locale === 'es' ? 'Vista (solo admin)' : 'View (admin only)'}</span>
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          {[
            { on: true, label: locale === 'es' ? 'Con barras' : 'With bars' },
            { on: false, label: locale === 'es' ? 'Simplificada' : 'Simplified' },
          ].map((o) => (
            <button
              key={String(o.on)}
              type="button"
              onClick={() => setAdminBars(o.on)}
              aria-pressed={adminBars === o.on}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                adminBars === o.on ? 'bg-favorable-500/15 text-favorable-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    ) : null;

    if (activeTab === 'all') {
      const analystTable = renderAnalystEstimatesTable();
      return (
        <div className="flex flex-col gap-8">
          {viewSwitch}
          {sectionsToDisplay.map((sec) => (
            <React.Fragment key={sec.key}>
              {renderIndicatorTable(sec.title, sec.rows, sec.key)}
              {sec.key === 'keyMetrics' && analystTable}
            </React.Fragment>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8">
        {viewSwitch}
        {sectionsToDisplay.map((sec) => renderIndicatorTable(sec.title, sec.rows, sec.key))}
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
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent-500/10 blur-3xl" />

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
                  <ShieldCheck size={14} className="text-accent-400" />
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
                  <Users size={14} className="text-favorable-400" />
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
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 via-accent-400 to-favorable-400 text-slate-950 font-black text-xs uppercase tracking-wider hover:opacity-90 transition shadow-xl shadow-purple-500/10 flex items-center justify-center gap-2 cursor-pointer"
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
                    ? 'bg-favorable-500/10 text-favorable-400 border-favorable-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 text-slate-400 border-slate-900 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-favorable-400' : 'text-slate-500'} />
                <span>{tab.label}</span>
                {isAdmin && tab.score && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono transition-colors ${
                    isActive ? 'bg-favorable-500/20 text-favorable-300' : 'bg-slate-800 text-accent-400'
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

