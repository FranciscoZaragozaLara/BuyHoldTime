'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { Layers, Calendar, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v*100).toFixed(1)}%`;

function getMallikLabels(code: string | null | undefined){
  const c=(code||'').toUpperCase();
  // dinámico: detectar ticker en el code para futuros stocks (JEPQ, SQQQ, JEPI, etc.)
  const tickers = ['SCHD','JEPQ','SQQQ','JEPI','VOO','SPY','QQQ','TQQQ'];
  for (const t of tickers) if (c.includes(t)) {
    // BH_XXX o XXX_BH -> solo primary
    if (c.startsWith('BH_') || c.endsWith('_BH') || c===t || c.startsWith(t+'_')) {
      const isCashSgov = c.startsWith('VOO_') || c.startsWith('SPY_');
      return { primary:t, secondary:null as string|null, cash:'Cash', cashFull: isCashSgov ? 'Cash (SGOV)' : 'Cash', primaryFull:t };
    }
  }
  if(c.startsWith('VOO_')||c==='VOO_BH_2010') return { primary:'VOO', secondary:null as string|null, cash:'Cash', cashFull:'Cash (SGOV)', primaryFull:'VOO' };
  if(c.startsWith('SPY_')||c==='SPY_BH_2010'||c==='SPY_BH_ORIGIN') return { primary:'SPY', secondary:null as string|null, cash:'Cash', cashFull:'Cash (SGOV)', primaryFull:'SPY' };
  if(c==='BH_TQQQ') return { primary:'TQQQ', secondary:null as string|null, cash:'Cash', cashFull:'Cash', primaryFull:'TQQQ' };
  if(c==='BH_QQQ') return { primary:'QQQ', secondary:null as string|null, cash:'Cash', cashFull:'Cash', primaryFull:'QQQ' };
  if(c==='MALLIK_TQQQ') return { primary:'TQQQ', secondary:null as string|null, cash:'Cash', cashFull:'Cash', primaryFull:'TQQQ' };
  // SCHILLER y resto: TQQQ + QQQ + Cash (SGOV)
  return { primary:'TQQQ', secondary:'QQQ' as string, cash:'Cash', cashFull:'Cash (SGOV)', primaryFull:'TQQQ' };
}
function capeRatioColor(r: number | null | undefined){
  if(r==null || isNaN(Number(r))) return 'text-slate-400';
  const v=Number(r);
  if(v < 1.0) return 'text-emerald-400';
  if(v < 1.15) return 'text-yellow-400';
  if(v < 1.30) return 'text-orange-400';
  return 'text-red-400';
}

interface Allocation {
  date: string;
  tqqqPct: number;
  cashPct: number;
  qqqPct?: number;
  sgovPct?: number;
  cashFreePct?: number;
  tqqqValue: number;
  cashValue: number;
  qqqValue?: number;
  sgovValue?: number;
  cashFreeValue?: number;
  portfolioValue: number;
  targetPct: number | null;
  indicators: any;
}
interface Trade {
  id: string;
  datetime: string;
  ticker: string;
  side: string;
  price: number;
  size: number;
  value: number;
  targetPct: number | null;
  indicators: any;
}

export function MallikDetails({ runId, strategyCode, strategyName, run, startDates }: { runId: string | null; strategyCode?: string | null; strategyName?: string | null; run?: any | null; startDates?: any[] }) {
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const tradesContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runId) return;
    const base = getApiBase();
    setLoading(true);
    Promise.all([
      fetch(`${base}/api/backtesting/runs/${runId}/allocations`).then(r=>r.json()),
      fetch(`${base}/api/backtesting/runs/${runId}/trades`).then(r=>r.json()),
    ]).then(([a, t]) => {
      setAllocs(Array.isArray(a)?a:[]);
      setTrades(Array.isArray(t)?t:[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [runId]);
  React.useEffect(()=>{ setVisibleCount(50); }, [trades]);

  const monthlyTradesMap = useMemo(() => {
    const m: Record<string, Trade[]> = {};
    for (const tr of trades) {
      const k = tr.datetime.substring(0,7);
      if (!m[k]) m[k]=[];
      m[k].push(tr);
    }
    return m;
  }, [trades]);

  const allocByMonth = useMemo(() => {
    const m: Record<string, Allocation> = {};
    for (const a of allocs) m[a.date.substring(0,7)] = a;
    return m;
  }, [allocs]);
  const allocByDate = useMemo(() => {
    const m: Record<string, Allocation> = {};
    for (const a of allocs) m[a.date.substring(0,10)] = a;
    // also map without time
    return m;
  }, [allocs]);

  const monthlyAllocs = useMemo(() => {
    const byMonth = new Map<string, Allocation>();
    for(const a of allocs){
      const k = a.date.substring(0,7);
      byMonth.set(k, a);
    }
    return Array.from(byMonth.values()).sort((a,b)=> a.date.localeCompare(b.date));
  }, [allocs]);

  if (!runId) {
    return <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 text-sm text-slate-400">Selecciona una estrategia para ver asignaciones y trades.</div>;
  }
  const displayCode = strategyCode || 'Estrategia';
  const displayName = strategyName || displayCode;
  const labels = getMallikLabels(displayCode);
  const startDetail = (() => {
    const ds = (run?.startDate || '').slice(0,10);
    if(!ds || !startDates?.length) return ds || '';
    const sd = startDates.find((d:any)=> (d.startDate||'').slice(0,10)===ds);
    if(!sd) return ds;
    const label = sd.label && sd.label !== ds ? ` — ${sd.label}` : '';
    const desc = sd.descriptor ? ` · ${sd.descriptor}` : '';
    const cat = sd.category ? ` [${sd.category}]` : '';
    return `${ds}${label}${desc}${cat}`;
  })();
  // total cash $ = sgov + libre (DB cashValue solo SGOV, el resto en indicators)
  const cashTotal = (a: Allocation) => {
    const pv = Number(a.portfolioValue) || 0;
    const pct = Number(a.cashPct) || 0;
    const sgov = Number((a as any).sgovValue ?? a.cashValue ?? 0);
    const free = Number((a as any).cashFreeValue ?? (a.indicators as any)?.cash_free_value ?? (a.indicators as any)?.cashFreeValue ?? 0);
    if(sgov + free > 0) return sgov + free;
    return pv * pct;
  };

  return (
    <div className="space-y-6">
      {/* Allocation stacked bar + table */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
        <div className="flex justify-between items-center border-b border-slate-900/60 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Wallet size={18} className="text-teal-400"/> {displayName} — {startDetail || run?.startDate?.slice(0,10) || displayCode} — Asignación {labels.primary}{labels.secondary ? ` vs ${labels.secondary} vs ${labels.cash}` : ` vs ${labels.cash}`} (mensual)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Último día de cada mes · {monthlyAllocs.length ? monthlyAllocs.length : 187} meses · Target vs real · {loading ? 'cargando...' : `${monthlyAllocs.length} meses, ${trades.length} trades`}</p>
          </div>
        </div>

        {/* Mini stacked bar visualization (CSS) */}
        <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden border border-slate-800">
          {monthlyAllocs.slice(-60).map(a=> {
            const qqqPct = (a as any).qqqPct ?? Math.max(0, 1 - a.tqqqPct - a.cashPct);
            return (
            <div key={a.date} className="flex-1 flex flex-col" title={`${a.date} ${labels.primary} ${(a.tqqqPct*100).toFixed(0)}%${labels.secondary ? ` ${labels.secondary} ${(qqqPct*100).toFixed(0)}%` : ''} ${labels.cash} ${(a.cashPct*100).toFixed(0)}%`}>
              <div style={{height: `${a.tqqqPct*100}%`, background:'#14b8a6'}}/>
              {labels.secondary && <div style={{height: `${qqqPct*100}%`, background:'#a78bfa'}}/>}
              <div style={{height: `${a.cashPct*100}%`, background:'#1e293b'}}/>
            </div>
          )})}
        </div>
        <div className="flex gap-4 text-xs text-slate-400"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-500 inline-block"/>{labels.primary}</span>{labels.secondary && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-500 inline-block"/>{labels.secondary}</span>}<span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-700 inline-block"/>{labels.cash}</span><span className="ml-auto">Últimos 60 meses</span></div>

        <div className="overflow-x-auto overflow-y-auto max-h-[520px] border border-slate-900 rounded-xl custom-scrollbar">
          <table className="w-full text-left text-xs relative">
            <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10">
              <tr>
                <th className="p-3">Mes</th>
                <th className="p-3 text-right">% {labels.primary}</th>
                {labels.secondary && <th className="p-3 text-right">% {labels.secondary}</th>}
                <th className="p-3 text-right">% {labels.cash}</th>
                <th className="p-3 text-right">{labels.primary} $</th>
                {labels.secondary && <th className="p-3 text-right">{labels.secondary} $</th>}
                <th className="p-3 text-right">{labels.cash} $</th>
                <th className="p-3 text-right">Cartera</th>
                <th className="p-3 text-right">Target</th>
                <th className="p-3 text-center">Trades</th>
                <th className="p-3">Indicadores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {monthlyAllocs.slice().reverse().map(a=>{
                const monthTrades = monthlyTradesMap[a.date.substring(0,7)] || [];
                const buys = monthTrades.filter(t=>t.side==='BUY').length;
                const sells = monthTrades.filter(t=>t.side==='SELL').length;
                const ind = a.indicators || {};
                return (
                  <tr key={a.date} className="hover:bg-slate-900/40">
                    <td className="p-3 font-semibold text-slate-200 whitespace-nowrap">{a.date.substring(0,7)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-teal-500" style={{width: `${a.tqqqPct*100}%`}}/></div>
                        <span className="text-slate-100 font-semibold">{fmtPct(a.tqqqPct)}</span>
                      </div>
                    </td>
                    {labels.secondary && (()=>{ const qqqPct = (a as any).qqqPct ?? Math.max(0, 1 - a.tqqqPct - a.cashPct); return <td className="p-3 text-right text-violet-300">{fmtPct(qqqPct)}</td>; })()}
                    <td className="p-3 text-right text-slate-400">{fmtPct(a.cashPct)}</td>
                    <td className="p-3 text-right text-slate-100">{fmtMoney(a.tqqqValue)}</td>
                    {labels.secondary && (()=>{ const qqqVal = (a as any).qqqValue ?? Math.max(0, a.portfolioValue - a.tqqqValue - cashTotal(a)); return <td className="p-3 text-right text-violet-300">{fmtMoney(qqqVal)}</td>; })()}
                    <td className="p-3 text-right text-slate-400">{fmtMoney(cashTotal(a))}</td>
                    <td className="p-3 text-right text-white font-semibold">{fmtMoney(a.portfolioValue)}</td>
                    <td className="p-3 text-right text-teal-400">{a.targetPct!==null?fmtPct(a.targetPct):'—'}</td>
                    <td className="p-3 text-center">
                      {monthTrades.length ? (
                        <span className="inline-flex gap-1">
                          {buys ? <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">{buys} BUY</span>:null}
                          {sells ? <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">{sells} SELL</span>:null}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="p-3 text-[10px] leading-3 text-slate-400">
                      {(() => {
                        const isSchiller = ind.cape !== undefined || ind.cape_ratio !== undefined || ind.mean !== undefined || ind.max_hist !== undefined;
                        const tickerClose = ind[`${labels.primary.toLowerCase()}_close`] ?? ind.qqq_close ?? ind.voo_close ?? ind.spy_close ?? ind.close ?? '—';
                        const distVal = ind.dist_ema_pct ?? ind.dist_pct ?? ind.dist;
                        const capeVal = ind.cape != null ? Number(ind.cape) : null;
                        const ratioVal = ind.cape_ratio != null ? Number(ind.cape_ratio) : ind.cape_to_max != null ? Number(ind.cape_to_max) : null;
                        const ratioColor = capeRatioColor(ratioVal);
                        const emaStr = (ind.ema200 || ind.ema50) ? `EMA200 ${ind.ema200 ?? '—'} EMA50 ${ind.ema50 ?? '—'}` : (ind.sma20 || ind.sma250 ? `SMA20 ${ind.sma20 ?? '—'} SMA250 ${ind.sma250 ?? '—'}` : '');
                        const regimeStr = ind.regime ? `${ind.regime}${ind.floor ? ` floor ${ind.floor}` : ''}${ind.death_cross ? ' death' : ''}${ind.bull_trend!==undefined ? (ind.bull_trend?' bull':' bear') : ''}` : (ind.bull_trend!==undefined ? (ind.bull_trend?'bull':'bear') : '');
                        return (
                          <>
                            <div>{labels.primary} {tickerClose} {emaStr}</div>
                            {isSchiller ? (
                              <>
                                {(capeVal!=null || ratioVal!=null) && (
                                  <div className={`text-xs font-bold ${ratioColor}`}>
                                    {capeVal!=null ? `CAPE ${capeVal.toFixed(1)}` : 'CAPE —'} {ind.mean ? `mean ${Number(ind.mean).toFixed(1)}` : ''} {ratioVal!=null ? `×${ratioVal.toFixed(2)}` : ''} <span className="text-[10px] font-normal text-slate-500">max {ind.max_hist ?? '—'}</span>
                                  </div>
                                )}
                                <div>dist {distVal ?? '—'}%{ind.sgov_pct!==undefined ? ` sgov ${Number(ind.sgov_pct).toFixed(1)}%` : ''} ddP {ind.dd_portfolio_pct ?? '—'}% {regimeStr}</div>
                              </>
                            ) : (
                              <>
                                <div>dist {distVal ?? '—'}% BB {ind.bb_top ?? '—'}/{ind.bb_bot ?? '—'} {ind.breakout_up?'↑':''}{ind.breakout_down?'↓':''} {ind.expanding?'exp':''}</div>
                                <div>ddQ {ind.dd_qqq_pct ?? '—'}% ddP {ind.dd_portfolio_pct ?? '—'}% {regimeStr || (ind.bull_trend?'bull':'bear')}</div>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">% {labels.primary} = {labels.primary.toLowerCase()}Value / portfolioValue{labels.secondary ? ` · % ${labels.secondary} = ${labels.secondary.toLowerCase()}Value / portfolioValue` : ''} · {labels.cash} = sgovValue + cash libre · Target = exposición objetivo antes de churn 1% · Trades agrupados por mes</p>
      </div>

      {/* Trades timeline - generic for any strategy */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2"><TrendingUp size={18} className="text-teal-400"/> Buys / Sells — momentos con indicadores <span className="text-xs font-mono text-slate-400">· {displayName} — {startDetail || run?.startDate?.slice(0,10) || displayCode}</span></h3>
        <div ref={tradesContainerRef} onScroll={(e)=>{ const el=e.currentTarget; if(el.scrollTop+el.clientHeight >= el.scrollHeight - 120 && visibleCount < trades.length){ setVisibleCount(v=> Math.min(v+50, trades.length)); } }} className="overflow-x-auto overflow-y-auto max-h-[400px] border border-slate-900 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Posición</th>
                <th className="p-3">Lado</th>
                <th className="p-3 text-right">Precio</th>
                <th className="p-3 text-right">Cant.</th>
                <th className="p-3 text-right">Valor trade</th>
                <th className="p-3 text-right">Target</th>
                <th className="p-3 text-right">{labels.primary} valor/%</th>
                {labels.primary==='TQQQ' && <th className="p-3 text-right">QQQ valor/%</th>}
                <th className="p-3 text-right">SGOV valor/%</th>
                <th className="p-3 text-right">Cash libre valor/%</th>
                <th className="p-3 text-right">Cartera</th>
                <th className="p-3 text-right">CAPE</th>
                <th className="p-3">Señal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-mono">
              {trades.slice().reverse().slice(0, visibleCount).map(t=> {
                const ind = t.indicators || {};
                const ticker = (t.ticker || 'TQQQ').toUpperCase();
                const tickerStyles: Record<string,string> = {
                  TQQQ: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
                  QQQ: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
                  VOO: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
                  SPY: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
                  SGOV: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                  BIL: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                  CASH: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
                };
                const style = tickerStyles[ticker] || 'bg-slate-500/10 text-slate-300 border-slate-500/20';
                const dayKey = t.datetime.substring(0,10);
                const alloc = allocByDate[dayKey] || allocByMonth[t.datetime.substring(0,7)];
                const tqqqVal = Number(alloc?.tqqqValue ?? 0);
                const sgovVal = Number((alloc as any)?.sgovValue ?? alloc?.cashValue ?? 0);
                const cashFreeVal = Number((alloc as any)?.cashFreeValue ?? (alloc as any)?.indicators?.cash_free_value ?? 0);
                const portfolioVal = Number(alloc?.portfolioValue ?? 0);
                const qqqValRaw = Number((alloc as any)?.qqqValue ?? 0);
                const qqqVal = qqqValRaw || (portfolioVal ? Math.max(0, portfolioVal - tqqqVal - sgovVal - cashFreeVal) : 0);
                const tqqqPct = portfolioVal ? tqqqVal / portfolioVal : 0;
                const sgovPct = portfolioVal ? sgovVal / portfolioVal : 0;
                const cashFreePct = portfolioVal ? cashFreeVal / portfolioVal : 0;
                const qqqPct = portfolioVal ? qqqVal / portfolioVal : 0;
                const capeVal = (alloc?.indicators?.cape ?? ind.cape);
                const capeRatioVal = (alloc?.indicators?.cape_ratio ?? alloc?.indicators?.cape_to_max ?? ind.cape_ratio ?? ind.cape_to_max ?? null);
                const capeColor = capeRatioColor(capeRatioVal != null ? Number(capeRatioVal) : null);
                const tqqqClose = (alloc?.indicators as any)?.tqqq_close;
                const qqqClose = (alloc?.indicators as any)?.qqq_close;
                const sgovClose = (alloc?.indicators as any)?.sgov_close;
                const tqqqShares = (alloc as any)?.tqqq_shares ?? (tqqqClose ? Math.round(tqqqVal / tqqqClose) : null);
                const qqqShares = (alloc as any)?.qqq_shares ?? (qqqClose ? Math.round(qqqVal / qqqClose) : null);
                const sgovShares = (alloc as any)?.sgov_shares ?? (sgovClose ? Math.round(sgovVal / sgovClose) : null);
                const fmtSh = (n:number|null) => n !== null && n>0 ? `${n.toLocaleString('en-US')} sh` : '—';
                return (
                  <tr key={t.id} className="hover:bg-slate-900/40">
                    <td className="p-3 text-slate-200 whitespace-nowrap">{t.datetime.substring(0,10)}</td>
                    <td className="p-3"><span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${style}`}>{ticker}</span></td>
                    <td className="p-3">{t.side==='BUY' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><ArrowUpRight size={10}/>BUY</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"><ArrowDownRight size={10}/>SELL</span>}</td>
                    <td className="p-3 text-right text-slate-100">{fmtMoney(t.price)}</td>
                    <td className="p-3 text-right text-slate-300">{Number(t.size).toLocaleString('en-US')}</td>
                    <td className="p-3 text-right text-slate-100">{fmtMoney(t.value)}</td>
                    <td className="p-3 text-right text-teal-400">{t.targetPct!==null?fmtPct(t.targetPct):'—'}</td>
                    <td className="p-3 text-right"><div className="flex flex-col items-end leading-tight"><span className="text-teal-300 font-medium">{alloc ? fmtMoney(tqqqVal) : '—'}</span><span className="text-[11px] text-slate-400">{alloc ? fmtPct(tqqqPct) : '—'}</span><span className="text-[10px] text-slate-500">{alloc ? fmtSh(tqqqShares) : '—'}</span></div></td>
                    {labels.primary==='TQQQ' && <td className="p-3 text-right"><div className="flex flex-col items-end leading-tight"><span className="text-sky-300 font-medium">{alloc ? fmtMoney(qqqVal) : '—'}</span><span className="text-[11px] text-slate-400">{alloc ? fmtPct(qqqPct) : '—'}</span><span className="text-[10px] text-slate-500">{alloc ? fmtSh(qqqShares) : '—'}</span></div></td>}
                    <td className="p-3 text-right"><div className="flex flex-col items-end leading-tight"><span className="text-amber-300 font-medium">{alloc ? fmtMoney(sgovVal) : '—'}</span><span className="text-[11px] text-slate-400">{alloc ? fmtPct(sgovPct) : '—'}</span><span className="text-[10px] text-slate-500">{alloc ? fmtSh(sgovShares) : '—'}</span></div></td>
                    <td className="p-3 text-right"><div className="flex flex-col items-end leading-tight"><span className="text-slate-200 font-medium">{cashFreeVal ? fmtMoney(cashFreeVal) : '—'}</span><span className="text-[11px] text-slate-400">{cashFreePct ? fmtPct(cashFreePct) : '—'}</span><span className="text-[10px] text-slate-500">{cashFreeVal ? 'cash' : '—'}</span></div></td>
                    <td className="p-3 text-right text-white font-semibold whitespace-nowrap">{alloc ? fmtMoney(portfolioVal) : '—'}</td>
                    <td className={`p-3 text-right font-mono font-bold text-xs ${capeColor}`}>{capeVal ? Number(capeVal).toFixed(2) : '—'} {capeRatioVal!=null ? <span className="text-[10px] font-normal opacity-70">·{Number(capeRatioVal).toFixed(2)}×</span> : ''}</td>
                    <td className="p-3 text-[10px] leading-3 text-slate-400">{(() => {
                      const closeVal = (ind as any)[`${labels.primary.toLowerCase()}_close`] ?? ind.qqq_close ?? ind.voo_close ?? ind.spy_close ?? ind.close ?? '—';
                      const distVal = ind.dist_ema_pct ?? ind.dist_pct ?? '—';
                      const cape2 = ind.cape ?? alloc?.indicators?.cape ?? '';
                      const ratioVal2 = ind.cape_ratio ?? ind.cape_to_max ?? alloc?.indicators?.cape_ratio ?? alloc?.indicators?.cape_to_max ?? '';
                      const ratioNum2 = ratioVal2!=='' ? Number(ratioVal2).toFixed(2) : '';
                      const capeNum2 = cape2!=='' ? Number(cape2).toFixed(1) : '';
                      const ratioColor2 = capeRatioColor(ratioVal2!=='' ? Number(ratioVal2) : null);
                      return <><span>{labels.primary} {closeVal}</span> {capeNum2 ? <span className={`font-bold text-xs ${ratioColor2}`}>CAPE {capeNum2} {ratioNum2?`×${ratioNum2}`:''}</span> : ''} <span className="text-[10px]">dist {distVal}% {ind.bull_trend?'bull':'bear'} {ind.breakout_up?'BO↑':''}{ind.breakout_down?'BO↓':''}</span></>;
                    })()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 flex justify-between items-center"><span>Cada fila es un `order_target_percent` ejecutado ({trades.length} en total) con snapshot de indicadores QQQ del día · Scroll para lazy load {visibleCount}/{trades.length}</span>{visibleCount < trades.length && <button onClick={()=>setVisibleCount(v=>Math.min(v+50, trades.length))} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px]">Cargar 50 más</button>}</p>
      </div>
    </div>
  );
}
