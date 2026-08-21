'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function sma(values: number[], period: number): (number | null)[] {
  const res: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) res[i] = sum / period;
  }
  return res;
}
function std(values: number[], period: number): (number | null)[] {
  const res: (number | null)[] = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    res[i] = Math.sqrt(variance);
  }
  return res;
}

export function QQQStrategyChart({ runId }: { runId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const [timeRange, setTimeRange] = useState<'1Y' | '5Y' | 'ALL'>('5Y');
  const [qqq, setQqq] = useState<{ date: string; close: number }[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<any[]>([]);
  const [tooltip, setTooltip] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!runId) return;
    const base = getApiBase();
    fetch(`${base}/api/backtesting/market-data?ticker=QQQ`).then(r=>r.json()).then(d=>{
      const arr = (Array.isArray(d)?d:[]).map((x:any)=>({ date: (x.date||'').split('T')[0], close: Number(x.close) })).filter(x=>x.date).sort((a:any,b:any)=>a.date.localeCompare(b.date));
      setQqq(arr);
    }).catch(()=>{});
    fetch(`${base}/api/backtesting/runs/${runId}/trades`).then(r=>r.json()).then(d=> setTrades(Array.isArray(d)?d:[])).catch(()=>{});
    fetch(`${base}/api/backtesting/runs/${runId}/allocations`).then(r=>r.json()).then(d=> setAllocs(Array.isArray(d)?d:[])).catch(()=>{});
  }, [runId]);

  const prepared = useMemo(() => {
    if (!qqq.length) return null;
    const closes = qqq.map(q=>q.close);
    const sma20 = sma(closes, 20);
    const sma250 = sma(closes, 250);
    const sd = std(closes, 20);
    const bbTop: (number | null)[] = sma20.map((m, i)=> m!==null && sd[i]!==null ? m + 2*sd[i]! : null);
    const bbBot: (number | null)[] = sma20.map((m, i)=> m!==null && sd[i]!==null ? m - 2*sd[i]! : null);
    // Build time series
    const price = qqq.map(q=>({ time: q.date, value: q.close }));
    const s20 = qqq.map((q,i)=> sma20[i]!==null ? { time: q.date, value: sma20[i]! } : null).filter(Boolean) as any;
    const s250 = qqq.map((q,i)=> sma250[i]!==null ? { time: q.date, value: sma250[i]! } : null).filter(Boolean) as any;
    const top = qqq.map((q,i)=> bbTop[i]!==null ? { time: q.date, value: bbTop[i]! } : null).filter(Boolean) as any;
    const bot = qqq.map((q,i)=> bbBot[i]!==null ? { time: q.date, value: bbBot[i]! } : null).filter(Boolean) as any;
    // Maps for tooltip
    const tradeMap = new Map<string, any[]>();
    for (const t of trades) {
      const d = (t.datetime||'').split('T')[0];
      if (!tradeMap.has(d)) tradeMap.set(d, []);
      tradeMap.get(d)!.push(t);
    }
    const allocMap = new Map<string, any>();
    for (const a of allocs) {
      const d = (a.date||'').split('T')[0];
      allocMap.set(d, a);
    }
    // also monthly alloc map for nearest lookup
    const allocList = allocs.map(a=> ({ date: (a.date||'').split('T')[0], ...a })).sort((a:any,b:any)=>a.date.localeCompare(b.date));
    return { price, s20, s250, top, bot, tradeMap, allocMap, allocList, qqq };
  }, [qqq, trades, allocs]);

  const rangeLabel = useMemo(()=>{
    if (!prepared) return '—';
    return `${prepared.price[0]?.time} → ${prepared.price[prepared.price.length-1]?.time} (${prepared.price.length} pts)`;
  }, [prepared]);

  useEffect(() => {
    if (!containerRef.current || !prepared) return;
    const w = containerRef.current.clientWidth || 600;
    const h = containerRef.current.clientHeight || 420;
    const chart = createChart(containerRef.current, {
      width: w, height: h,
      layout: { background: { type: ColorType.Solid, color: '#020617' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(30,41,59,0.3)' }, horzLines: { color: 'rgba(30,41,59,0.3)' } },
      crosshair: { mode: 1, vertLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' }, horzLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' } },
      rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.1, bottom: 0.15 } },
      timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 2 },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;
    const priceSeries = chart.addSeries(LineSeries, { color: '#e2e8f0', lineWidth: 2, title: 'QQQ' });
    const s20Series = chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 2, title: 'SMA20' });
    const s250Series = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, title: 'SMA250' });
    const topSeries = chart.addSeries(LineSeries, { color: 'rgba(100,116,139,0.6)', lineWidth: 1, lineStyle: 2, title: 'BB top' });
    const botSeries = chart.addSeries(LineSeries, { color: 'rgba(100,116,139,0.6)', lineWidth: 1, lineStyle: 2, title: 'BB bot' });
    priceSeries.setData(prepared.price as any);
    s20Series.setData(prepared.s20 as any);
    s250Series.setData(prepared.s250 as any);
    topSeries.setData(prepared.top as any);
    botSeries.setData(prepared.bot as any);
    seriesRefs.current = { price: priceSeries as any, s20: s20Series as any, s250: s250Series as any };

    // markers: todos los trades (4150 rango completo), no filtrados — permite scroll al pasado
    const markers: any[] = trades.map(t=>({
      time: (t.datetime||'').split('T')[0],
      position: t.side==='BUY' ? 'belowBar' : 'aboveBar',
      color: t.side==='BUY' ? '#10b981' : '#ef4444',
      shape: t.side==='BUY' ? 'arrowUp' : 'arrowDown',
      text: `${t.side} ${Math.abs(Math.round(Number(t.size)))}`,
    })).filter(m=> m.time);
    try { (priceSeries as any).setMarkers(markers); } catch {}

    chart.timeScale().fitContent();
    setIsLoaded(true);

    const handler = (param: any) => {
      if (!param.time || !param.point) { setTooltip(null); return; }
      const toKey = (t:any) => typeof t === 'string' ? t : typeof t === 'number' ? new Date(t*1000).toISOString().split('T')[0] : String(t);
      const date = toKey(param.time);
      // nearest qqq
      const qItem = prepared.qqq.find(q=>q.date===date) || (()=>{ let best=prepared.qqq[0], bd=Infinity; for(const q of prepared.qqq){ const d=Math.abs(new Date(q.date).getTime()-new Date(date).getTime()); if(d<bd){bd=d; best=q;} } return best; })();
      const qDate = qItem?.date || date;
      const s20Val = (()=>{ const idx=prepared.qqq.findIndex(q=>q.date===qDate); if(idx>=0){ const v=sma(prepared.qqq.map(x=>x.close),20)[idx]; return v; } return null; })();
      const s250Val = (()=>{ const idx=prepared.qqq.findIndex(q=>q.date===qDate); if(idx>=0){ const v=sma(prepared.qqq.map(x=>x.close),250)[idx]; return v; } return null; })();
      const tradesHere = prepared.tradeMap.get(qDate) || [];
      // nearest allocation (monthly or daily) — find closest date <= qDate
      let alloc: any = prepared.allocMap.get(qDate);
      if (!alloc && prepared.allocList.length) {
        let best: any = null;
        for (const a of prepared.allocList) {
          if (a.date <= qDate) best = a;
          else break;
        }
        alloc = best;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      const cw = rect?.width ?? 600;
      const tx = Math.max(8, Math.min(param.point.x + 16, cw - 340));
      const ty = Math.max(8, Math.min(param.point.y - 120, 300));
      setTooltip({ x: tx, y: ty, date: qDate, qClose: qItem?.close, s20: s20Val, s250: s250Val, alloc, trades: tradesHere });
    };
    chart.subscribeCrosshairMove(handler);
    const ro = new ResizeObserver(()=>{ if(containerRef.current && chartRef.current){ const ww=containerRef.current.clientWidth; const hh=containerRef.current.clientHeight; if(ww>0&&hh>0) chartRef.current.applyOptions({width:ww, height:hh}); } });
    ro.observe(containerRef.current);
    return ()=>{ ro.disconnect(); try{ chart.unsubscribeCrosshairMove(handler); }catch{}; chart.remove(); chartRef.current=null; seriesRefs.current={}; setTooltip(null); setIsLoaded(false); };
  }, [prepared, trades]);

  useEffect(()=>{
    const chart = chartRef.current;
    if(!chart || !isLoaded || !prepared) return;
    const allTimes = prepared.price.map(p=>p.time).sort();
    if(!allTimes.length) return;
    const latest = allTimes[allTimes.length-1];
    const latestDate = new Date(latest);
    let from: Date|null=null;
    if(timeRange==='1Y'){ from=new Date(latestDate); from.setFullYear(from.getFullYear()-1); }
    else if(timeRange==='5Y'){ from=new Date(latestDate); from.setFullYear(from.getFullYear()-5); }
    else if(timeRange==='ALL'){ from=null; }
    const t=setTimeout(()=>{
      try{
        if(from) chart.timeScale().setVisibleRange({ from: from.toISOString().split('T')[0] as any, to: latest as any });
        else chart.timeScale().fitContent();
      }catch{}
    },50);
    return ()=>clearTimeout(t);
  }, [timeRange, prepared, isLoaded]);

  if (!runId) return <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-400">Selecciona Mallik para ver QQQ + señales</div>;
  if (!prepared) return <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-400">Cargando QQQ y Mallik...</div>;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-100">QQQ + Medias Mallik (SMA20/250, BB 20±2) — Buy/Sell TQQQ — {rangeLabel}</h3>
        <div className="flex gap-1">
          {(['1Y','5Y','ALL'] as const).map(r=>(
            <button key={r} onClick={()=>setTimeRange(r)} className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${timeRange===r ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="relative w-full h-[420px] overflow-visible">
        <div ref={containerRef} className="w-full h-full" />
        {tooltip && (
          <div className="absolute z-50 pointer-events-none bg-slate-900 border border-teal-500/60 rounded-lg px-3 py-2 text-xs shadow-xl ring-1 ring-teal-500/20 min-w-[320px] max-w-[340px]" style={{ left: tooltip.x, top: tooltip.y }}>
            <div className="font-semibold text-slate-100 mb-1">{new Date(tooltip.date).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })} — QQQ {tooltip.qClose ? fmtMoney(tooltip.qClose) : '—'}</div>
            <div className="grid grid-cols-2 gap-x-3 text-[11px] leading-4">
              <span className="text-slate-400">SMA20</span><span className="text-teal-400 font-mono">{tooltip.s20 ? tooltip.s20.toFixed(2) : '—'}</span>
              <span className="text-slate-400">SMA250</span><span className="text-amber-400 font-mono">{tooltip.s250 ? tooltip.s250.toFixed(2) : '—'}</span>
              {tooltip.alloc && (<>
                <span className="text-slate-400">Portafolio</span><span className="font-mono text-white">{fmtMoney(tooltip.alloc.portfolioValue)} · TQQQ {fmtPct(tooltip.alloc.tqqqPct)} / Cash {fmtPct(tooltip.alloc.cashPct)}</span>
                <span className="text-slate-400">Target</span><span className="font-mono text-teal-400">{tooltip.alloc.targetPct!==null?fmtPct(tooltip.alloc.targetPct):'—'}</span>
                <span className="text-slate-400 col-span-2 mt-1 text-slate-300">QQQ dist {tooltip.alloc.indicators?.dist_pct}% · ddQ {tooltip.alloc.indicators?.dd_qqq_pct}% · {tooltip.alloc.indicators?.bull_trend?'bull':'bear'} {tooltip.alloc.indicators?.breakout_up?'BO↑':''}{tooltip.alloc.indicators?.breakout_down?'BO↓':''}</span>
              </>)}
            </div>
            {tooltip.trades?.length ? (
              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                {tooltip.trades.map((t:any,i:number)=>(
                  <div key={i} className="flex justify-between items-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${t.side==='BUY'?'bg-emerald-500/10 text-emerald-400 border-emerald-500/20':'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>{t.side} {Math.abs(Math.round(Number(t.size)))} @ {fmtMoney(Number(t.price))}</span>
                    <span className="font-mono text-white text-[11px]">{fmtMoney(Number(t.value))} → {fmtPct(Number(t.targetPct))}</span>
                  </div>
                ))}
                <div className="text-[10px] text-slate-400">Reajuste: {tooltip.trades[0].side==='BUY' ? 'compra TQQQ, baja Cash' : 'venta TQQQ, sube Cash'} · comisión {fmtMoney(Number(tooltip.trades[0].commission||0))}</div>
              </div>
            ) : (
              <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-500">Sin trade este día — posición se mantiene según % TQQQ/Cash del mes</div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-slate-200"/>QQQ</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-teal-500"/>SMA20</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-amber-500"/>SMA250</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-slate-600 border border-dashed border-slate-500"/>BB 20±2</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"/>BUY</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"/>SELL</span>
        <span className="ml-auto text-slate-500">Scroll/arrastra para zoom • 5Y por defecto igual que BuyHoldTime • Hover sobre flechas: detalle TQQQ/Cash + trigger</span>
      </div>
    </div>
  );
}
