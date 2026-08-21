'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Clock, ArrowLeftRight, Layers, Download } from 'lucide-react';
import { useLocale } from 'next-intl';
import { getStrategyColor } from '@/lib/strategyColors';
import { exportToExcel } from '@/lib/exportExcel';

interface EquityPoint { date: string; value: number }
interface CapePoint { date: string; cape: number | null; capeRatio: number | null }
type Props = { equity: Record<string, EquityPoint[]>; startDate?: string; capeData?: CapePoint[] };
type PeriodTab = 'annual' | 'monthly' | 'daily';

const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const capeRatioColor = (r: number | null | undefined) => {
  if (r == null) return 'text-slate-500';
  if (r < 1.0) return 'text-emerald-400';
  if (r < 1.15) return 'text-yellow-400';
  if (r < 1.30) return 'text-orange-400';
  return 'text-red-400';
};

export const PerformanceTable: React.FC<Props> = ({ equity, startDate, capeData }) => {
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<PeriodTab>('annual');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(15);
  const observerRef = useRef<HTMLTableRowElement | null>(null);

  const strategies = useMemo(() => Object.keys(equity).sort(), [equity]);

  const capeMap = useMemo(() => {
    const m = new Map<string, { cape: number | null; capeRatio: number | null }>();
    if (!capeData) return m;
    for (const p of capeData) {
      const d = (p.date || '').slice(0, 10);
      if (d) m.set(d, { cape: p.cape ?? null, capeRatio: p.capeRatio ?? null });
    }
    return m;
  }, [capeData]);
  const capeSortedDates = useMemo(() => Array.from(capeMap.keys()).sort(), [capeMap]);
  const getCapeForDate = (dateStr: string) => {
    if (capeMap.has(dateStr)) return capeMap.get(dateStr)!;
    // fallback a fecha anterior más cercana
    let lo = 0, hi = capeSortedDates.length - 1, best = -1;
    for (let i = 0; i < capeSortedDates.length; i++) if (capeSortedDates[i] <= dateStr) best = i; else break;
    if (best >= 0) return capeMap.get(capeSortedDates[best])!;
    return null;
  };

  // Normalize equity: map date -> value per strategy, sorted asc
  const normalized = useMemo(() => {
    const map: Record<string, Map<string, number>> = {};
    const allDates = new Set<string>();
    for (const [k, arr] of Object.entries(equity)) {
      const m = new Map<string, number>();
      for (const p of arr) {
        const d = new Date(p.date).toISOString().split('T')[0];
        m.set(d, p.value);
        allDates.add(d);
      }
      map[k] = m;
    }
    const sortedDates = Array.from(allDates).sort();
    return { map, sortedDates };
  }, [equity]);

  const buildAggregated = (groupFn: (d: string) => string) => {
    const { map, sortedDates } = normalized;
    const groups: Record<string, string[]> = {};
    for (const d of sortedDates) {
      const key = groupFn(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    const labels = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return labels.map((label) => {
      const dates = groups[label].sort();
      const last = dates[dates.length - 1];
      const values: Record<string, number> = {};
      for (const k of strategies) {
        const v = map[k].get(last);
        if (v !== undefined) values[k] = v;
        else {
          // fallback to last available before last
          let fallback: number | undefined;
          for (let i = dates.length - 1; i >= 0; i--) {
            const vv = map[k].get(dates[i]);
            if (vv !== undefined) { fallback = vv; break; }
          }
          if (fallback !== undefined) values[k] = fallback;
        }
      }
      return { dateLabel: label, values, sortKey: last };
    });
  };

  const dailyData = useMemo(() => {
    const { map, sortedDates } = normalized;
    return [...sortedDates].sort((a, b) => b.localeCompare(a)).map((d) => {
      const values: Record<string, number> = {};
      for (const k of strategies) {
        const v = map[k].get(d);
        if (v !== undefined) values[k] = v;
      }
      return { dateLabel: d, values, sortKey: d };
    });
  }, [normalized, strategies]);

  const monthlyData = useMemo(() => buildAggregated((d) => d.substring(0, 7)), [normalized, strategies]);
  const annualData = useMemo(() => buildAggregated((d) => d.substring(0, 4)), [normalized, strategies]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const r of [...annualData, ...monthlyData, ...dailyData]) years.add(r.dateLabel.substring(0, 4));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [annualData, monthlyData, dailyData]);

  const activeList = useMemo(() => {
    let base: typeof monthlyData;
    if (activeTab === 'monthly') base = monthlyData;
    else if (activeTab === 'annual') base = annualData;
    else base = dailyData;
    if (selectedYear !== 'all') return base.filter(r => r.dateLabel.startsWith(selectedYear));
    return base;
  }, [activeTab, dailyData, monthlyData, annualData, selectedYear]);

  const activeListWithInicio = useMemo(() => {
    if (!startDate || selectedYear !== 'all') return activeList;
    const inicioDate = startDate.slice(0, 10);
    // evitar duplicado si ya existe fila con ese sortKey
    if (activeList.some(r => r.sortKey === inicioDate)) return activeList;
    const inicioValues: Record<string, number> = {};
    for (const k of strategies) inicioValues[k] = 100000;
    // para annual, usar label "Inicio YYYY-MM-DD" para no colisionar con "2010"
    const dateLabel = `Inicio ${inicioDate}`;
    return [...activeList, { dateLabel, values: inicioValues, sortKey: inicioDate }];
  }, [activeList, startDate, strategies, selectedYear]);

  const paginatedList = useMemo(() => {
    if (activeTab === 'annual') return activeListWithInicio;
    return activeListWithInicio.slice(0, visibleCount);
  }, [activeListWithInicio, activeTab, visibleCount]);

  useEffect(() => { setVisibleCount(15); }, [selectedYear]);

  useEffect(() => {
    if (activeTab === 'annual') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < activeListWithInicio.length) {
          setVisibleCount((prev) => Math.min(activeListWithInicio.length, prev + 15));
        }
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [activeTab, visibleCount, activeListWithInicio.length]);

  const handleTabChange = (tab: PeriodTab) => {
    setActiveTab(tab);
    setSelectedYear('all');
    setVisibleCount(15);
  };

  const formatDate = (label: string) => {
    if (label.startsWith('Inicio ')) return label;
    if (activeTab === 'monthly') {
      const [y, m] = label.split('-');
      const names = locale === 'es'
        ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${names[parseInt(m, 10) - 1]} ${y}`;
    }
    if (activeTab === 'annual') return label;
    const d = new Date(label + 'T12:00:00');
    return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  if (strategies.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl">
        <p className="text-sm text-slate-400">Sin datos de equity para mostrar.</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900/60 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers size={18} className="text-teal-400" />
            {locale === 'es' ? 'Performance por Periodo' : 'Performance by Period'}{startDate ? ` — ${startDate}` : ''}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {locale === 'es' ? 'Valor actualizado, variación y rendimiento acumulado por estrategia' : 'Updated value, change and cumulative return by strategy'}
            {' · '} {activeListWithInicio.length} {activeTab === 'annual' ? 'años' : activeTab === 'monthly' ? 'meses' : 'días'}{startDate ? ` · desde ${startDate}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>{
            const buildRows = (list: typeof activeListWithInicio, useFormatDate: (label:string)=>string) => {
              return list.map(row=>{
                const cape = getCapeForDate(row.sortKey);
                const dateLabel = useFormatDate(row.dateLabel);
                const capeCell = cape?.cape != null ? `${cape.cape.toFixed(2)} ·${cape.capeRatio!=null?cape.capeRatio.toFixed(2)+'x':''}` : '';
                const vals = strategies.map(k=> row.values[k] != null ? row.values[k] : '');
                const idx = list.findIndex(r=>r.dateLabel===row.dateLabel);
                const nextRow = list[idx+1];
                const isInicio = row.dateLabel.startsWith('Inicio ');
                const isEarliest = !nextRow;
                const varVals = strategies.map(k=>{
                  if(isInicio) return '';
                  const cur=row.values[k];
                  let prev=nextRow?.values[k];
                  if(prev===undefined && isEarliest){
                    const earliestDate = normalized.sortedDates[0];
                    const initial = earliestDate ? normalized.map[k]?.get(earliestDate) : undefined;
                    prev = initial !== undefined ? initial : 100000;
                  }
                  if(cur!==undefined && prev!==undefined && prev!==0) return ((cur-prev)/prev*100).toFixed(2)+'%';
                  return '';
                });
                const best = (()=>{ let b:string='', bp=-Infinity; for(let i=0;i<strategies.length;i++){ const v=varVals[i]; const n=parseFloat(v); if(!isNaN(n) && n>bp){bp=n; b=strategies[i];}} return b;})();
                return [dateLabel, capeCell, ...vals.map(v=> v===''?'':`$${Number(v).toFixed(2)}`), ...varVals, best] as (string|number)[];
              });
            };
            const headers = ['Fecha','CAPE', ...strategies, ...strategies.map(s=>s+' Var %'), 'Mejor'];
            const formatAnnual = (label:string)=> label.startsWith('Inicio ') ? label : label;
            const formatMonthly = (label:string)=> {
              if(label.startsWith('Inicio ')) return label;
              const [y,m]=label.split('-');
              const names = locale==='es'?['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              return `${names[parseInt(m,10)-1]} ${y}`;
            };
            const formatDaily = (label:string)=> {
              if(label.startsWith('Inicio ')) return label;
              const d=new Date(label+'T12:00:00');
              return d.toLocaleDateString(locale==='es'?'es-MX':'en-US', {year:'numeric', month:'short', day:'numeric', timeZone:'UTC'});
            };
            // respetar filtro de año si está activo
            const filterByYear = (list: typeof annualData, year:string)=> year==='all' ? list : list.filter(r=> r.dateLabel.startsWith(year));
            const annualRows = buildRows(selectedYear==='all' ? annualData : filterByYear(annualData, selectedYear), formatAnnual);
            const monthlyRows = buildRows(selectedYear==='all' ? monthlyData : filterByYear(monthlyData, selectedYear), formatMonthly);
            const dailyRows = buildRows(selectedYear==='all' ? dailyData : filterByYear(dailyData, selectedYear), formatDaily);
            // incluir fila Inicio si aplica (para Annual ya está en activeListWithInicio, pero para export completo la generamos)
            const yearSuffix = selectedYear==='all' ? 'todos' : selectedYear;
            exportToExcel(`Performance-Completo-${yearSuffix}-${new Date().toISOString().slice(0,10)}.xlsx`, [
              { name: 'Annual', headers, rows: annualRows },
              { name: 'Monthly', headers, rows: monthlyRows },
              { name: 'Daily', headers, rows: dailyRows },
            ]);
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition">
            <Download size={14} /> Excel (3 pestañas)
          </button>
          <select value={selectedYear} onChange={e=>{ setSelectedYear(e.target.value); setVisibleCount(15); }} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer">
            <option value="all">{locale==='es' ? 'Todos los años' : 'All years'}</option>
            {availableYears.map(y=> <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg p-0.5">
            <button onClick={() => handleTabChange('annual')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${activeTab === 'annual' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
              <Calendar size={14} /> {locale === 'es' ? 'Anual' : 'Annual'}
            </button>
            <button onClick={() => handleTabChange('monthly')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${activeTab === 'monthly' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
              <Clock size={14} /> {locale === 'es' ? 'Mensual' : 'Monthly'}
            </button>
            <button onClick={() => handleTabChange('daily')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${activeTab === 'daily' ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:text-slate-200'}`}>
              <ArrowLeftRight size={14} /> {locale === 'es' ? 'Diario' : 'Daily'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">
        <table className="w-full text-left text-xs relative">
          <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
            <tr>
              <th className="px-2 py-2 text-[11px] leading-tight whitespace-nowrap">{locale === 'es' ? 'Fecha' : 'Date'}</th>
              <th className="px-2 py-2 text-[11px] leading-tight whitespace-nowrap text-center" title="CAPE al cierre del periodo">CAPE</th>
              {strategies.map((k) => (
                <th key={k} className="px-2 py-2 text-[11px] leading-tight whitespace-normal break-words max-w-[110px] text-right align-bottom"><span className="inline-flex items-center justify-end gap-1 flex-wrap text-right" title={k}><span className="w-2 h-2 rounded-full shrink-0" style={{background: getStrategyColor(k)}}/><span className="break-all">{k}</span></span></th>
              ))}
              {strategies.map((k) => (
                <th key={`var-${k}`} className="px-2 py-2 text-[11px] leading-tight whitespace-normal break-words max-w-[90px] text-right align-bottom"><span className="inline-flex items-center justify-end gap-1 flex-wrap text-right" title={`${k} Var.`}><span className="w-2 h-2 rounded-full shrink-0 opacity-60" style={{background: getStrategyColor(k)}}/><span className="break-all">{k}<br/>Var.</span></span></th>
              ))}
              <th className="px-2 py-2 text-[11px] leading-tight whitespace-nowrap text-right">{locale === 'es' ? 'Mejor' : 'Best'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
            {paginatedList.map((row, idx) => {
              const nextRow = activeListWithInicio[idx + 1];
              const isInicio = row.dateLabel.startsWith('Inicio ');
              const isEarliest = !nextRow;
              const vars: Record<string, { abs: number; pct: number }> = {};
              let best: string | null = null;
              let bestPct = -Infinity;
              if (!isInicio) {
                for (const k of strategies) {
                  const cur = row.values[k];
                  let prev = nextRow?.values[k];
                  // Para el periodo más antiguo antes del Inicio, si no hay nextRow usar 100k
                  if (prev === undefined && isEarliest) {
                    const earliestDate = normalized.sortedDates[0];
                    const initial = earliestDate ? normalized.map[k]?.get(earliestDate) : undefined;
                    prev = initial !== undefined ? initial : 100000;
                  }
                  if (cur !== undefined && prev !== undefined && prev !== 0) {
                    const abs = cur - prev;
                    const pct = (abs / prev) * 100;
                    vars[k] = { abs, pct };
                    if (pct > bestPct) { bestPct = pct; best = k; }
                  }
                }
              }
              const isLast = idx === paginatedList.length - 1;
              const cape = getCapeForDate(row.sortKey);
              return (
                <tr key={row.dateLabel} ref={isLast ? observerRef : null} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-2 py-2 font-semibold text-slate-200 whitespace-nowrap text-xs">{formatDate(row.dateLabel)}</td>
                  <td className={`px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap font-bold ${cape ? capeRatioColor(cape.capeRatio) : 'text-slate-500'}`} title={cape ? `CAPE ${cape.cape?.toFixed(2)} · ratio ${cape.capeRatio?.toFixed(2)}` : ''}>
                    {cape?.cape != null ? `${cape.cape.toFixed(2)} ·${cape.capeRatio != null ? cape.capeRatio.toFixed(2) + '×' : '—'}` : '—'}
                  </td>
                  {strategies.map((k) => {
                    const v = row.values[k];
                    return <td key={k} className="px-2 py-2 text-right text-slate-100 text-xs tabular-nums whitespace-nowrap">{v !== undefined ? fmtMoney(v) : '—'}</td>;
                  })}
                  {strategies.map((k) => {
                    const v = vars[k];
                    if (!v) return <td key={`v-${k}`} className="px-2 py-2 text-right text-slate-500 text-xs">—</td>;
                    const color = v.pct > 0 ? 'text-emerald-400' : v.pct < 0 ? 'text-rose-400' : 'text-slate-400';
                    return <td key={`v-${k}`} className={`px-2 py-2 text-right font-semibold text-xs tabular-nums whitespace-nowrap ${color}`}>{fmtPct(v.pct)}</td>;
                  })}
                  <td className="px-2 py-2 text-right">
                    {best ? <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border bg-teal-500/10 text-teal-400 border-teal-500/20 max-w-[110px] truncate" title={best}>{best}</span> : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Scroll para cargar más · Valores al cierre del periodo · Var. vs periodo anterior · Montos en $ con coma (en-US)</p>
    </div>
  );
};
