'use client';
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { capeScoreColor } from './bhtBands';
import { useBhtDetail, bhtLeaveGuard, BhtDetailPopover } from './BhtDetail';

// Tabla BHT Forward: BHT Index + precios y retornos forward maduros 1/2/3/5Y.
// Solo pinta horizontes con fecha objetivo ya cumplida (el resto es '—').
export function BhtForwardTable({ live }: { live: { current: { v: number | null; d: string | null } } }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const liveBht = live.current.v;
  const [rows, setRows] = useState<any[]>([]);
  const [view, setView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Estándar de tablas: scroll infinito (ver tabla CAPE). Sin botón "Ver más".
  const [visibleCount, setVisibleCount] = useState(60);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null) as any;
  const bhtDet = useBhtDetail();
  const loadRows = useCallback(async () => {
    try {
      const r = await fetch(`${getApiBase()}/api/backtesting/bht-forward?from=1993-01-01`, { cache: 'no-store' });
      if (r.ok) setRows(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    loadRows();
    const onSync = () => loadRows();
    window.addEventListener('bht:synced', onSync);
    return () => window.removeEventListener('bht:synced', onSync);
  }, [loadRows]);
  useEffect(() => { setVisibleCount(60); setSortCol('date'); setSortDir('desc'); }, [view]);
  // Scroll infinito: al acercarse al fondo (+60 filas). Sentinela como fallback.
  useEffect(() => {
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((prev: number) => Math.min(prev + 60, 10000));
    }, { threshold: 0.1 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, view, rows.length, sortCol, sortDir]);
  if (!rows.length) return null;
  let list = rows;
  if (view === 'monthly') { const m = new Map<string, any>(); for (const r of rows) m.set((r.date || '').slice(0, 7), r); list = Array.from(m.values()); }
  if (view === 'yearly') { const m = new Map<string, any>(); for (const r of rows) m.set((r.date || '').slice(0, 4), r); list = Array.from(m.values()); }
  const maxDate = list.reduce((mm: any, r: any) => r.date > mm ? r.date : mm, list[0].date);
  const sorted = [...list].sort((a: any, b: any) => {
    if (sortCol === 'date') return sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    const av = a[sortCol] ?? -Infinity, bv = b[sortCol] ?? -Infinity;
    if (av === bv) return b.date.localeCompare(a.date);
    return sortDir === 'desc' ? bv - av : av - bv;
  });
  const cols: { k: string; label: string; cls: string }[] = [
    { k: 'date', label: view === 'monthly' ? 'Mes' : view === 'yearly' ? 'Año' : 'Fecha', cls: 'text-left w-[92px] min-w-[92px] max-w-[92px] sticky left-0 bg-slate-900 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]' },
    { k: 'bhtValue', label: 'BHT', cls: 'text-right' },
    { k: 'spx', label: 'SP500', cls: 'text-right text-sky-300' },
    { k: 'ndx', label: 'Nasdaq', cls: 'text-right text-sky-300' },
    { k: 'tqqq', label: 'TQQQ', cls: 'text-right text-sky-300' },
    ...['spx', 'ndx', 'tqqq'].flatMap((p) => [1, 2, 3, 5].map((y) => ({ k: `${p}${y}y`, label: `${p.toUpperCase()} ${y}Y`, cls: 'text-right' }))),
  ];
  const retTd = (v: number | null, key: string) => v == null
    ? <td key={key} className="p-2 text-right font-mono text-slate-600 whitespace-nowrap">—</td>
    : <td key={key} className={`p-2 text-right font-mono font-semibold whitespace-nowrap rounded ${v >= 0 ? 'text-favorable-400 bg-favorable-500/10' : 'text-risk-400 bg-risk-500/10'}`}>{v >= 0 ? '▲ ' : '▼ '}{Math.abs(v).toFixed(1)}%</td>;
  const toggle = (k: string) => {
    if (sortCol === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(k); setSortDir('desc'); }
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-slate-100">{ti('fwdTitle')}</h3>
        <div className="flex items-center gap-1">
          {(['daily', 'monthly', 'yearly'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${view === v ? 'bg-slate-700 text-accent-300 border border-slate-600' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'daily' ? 'Daily' : v === 'monthly' ? 'Monthly' : 'Yearly'}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} onScroll={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
              setVisibleCount((prev) => Math.min(prev + 60, 10000));
            }
          }} className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">
        <table className="w-full text-xs relative">
          <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
            <tr>
              {cols.map((col) => (
                <th key={col.k} onClick={() => toggle(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-accent-300 ${sortCol === col.k ? 'text-accent-300' : ''}`}>
                  {col.label} <span className="text-[10px]">{sortCol === col.k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
            {sorted.slice(0, visibleCount).map((r: any, idx: number) => {
              const d = (r.date || '').slice(0, 10);
              const isCurrent = sortCol === 'date' && sortDir === 'desc' && r.date === maxDate;
              const isLast = idx === Math.min(visibleCount, sorted.length) - 1 && visibleCount < sorted.length;
              return (
                <tr key={r.date} ref={isLast ? sentinelRef : null} className={`${isCurrent ? 'bg-accent-500/[0.08] border-l-2 border-l-accent-500 ring-1 ring-accent-500/15' : 'hover:bg-slate-900/40'} transition-colors`}>
                  <td className={`p-1.5 px-2 font-mono whitespace-nowrap w-[92px] min-w-[92px] max-w-[92px] align-top sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.25)] ${isCurrent ? 'bg-slate-900' : 'bg-slate-950 group-hover:bg-slate-900'}`}><div className="flex flex-col items-start leading-none gap-0.5"><span className={`${isCurrent ? 'text-accent-300 font-bold' : 'text-slate-200'} text-xs`}>{view === 'yearly' ? d.slice(0, 4) : view === 'monthly' ? d.slice(0, 7) : d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500 text-white font-bold leading-none">Actual</span>}</div></td>
                  {(() => { const isLive = isCurrent && liveBht != null; const v = isLive ? liveBht : r.bhtValue; if (v == null) return <td className="p-2 text-right font-mono text-slate-600 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono font-semibold whitespace-nowrap cursor-help" style={{ color: capeScoreColor(v) }} onMouseEnter={(e) => { bhtDet.setHover({ d, x: e.clientX, y: e.clientY }); bhtDet.load(d); }} onMouseMove={(e) => bhtDet.setHover((s) => s && s.d === d ? { ...s, x: e.clientX, y: e.clientY } : s)} onMouseLeave={(e) => bhtLeaveGuard(e, bhtDet)}><span className="border-b border-dotted border-slate-400/40" title={isLive ? 'En vivo (igual que el semáforo)' : undefined}>{Number(v).toFixed(1)}{isLive && <span className="text-accent-300"> •</span>}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.spx != null ? `$${Number(r.spx).toFixed(2)}` : '—'}</td>
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.ndx != null ? `$${Number(r.ndx).toFixed(2)}` : '—'}</td>
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.tqqq != null ? `$${Number(r.tqqq).toFixed(2)}` : '—'}</td>
                  {['spx', 'ndx', 'tqqq'].flatMap((p) => [1, 2, 3, 5].map((y) => retTd(r[`${p}${y}y`], `${p}${y}`)))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">{ti('fwdFoot', { shown: Math.min(visibleCount, sorted.length), total: sorted.length, days: rows.length })}{visibleCount < sorted.length ? ti('fwdMore') : ''}</p>
      {bhtDet.hover && <BhtDetailPopover hover={bhtDet.hover} detail={bhtDet.cache[bhtDet.hover.d]} forward={rows.find((r) => r.date === bhtDet.hover!.d)} onLeave={() => bhtDet.scheduleClear()} onHold={() => bhtDet.cancelClear()} liveValue={(sortCol === 'date' && sortDir === 'desc' && bhtDet.hover.d === maxDate && liveBht != null) ? liveBht : null} />}
    </div>
  );
}
