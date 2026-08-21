'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer } from 'recharts';
import { getStrategyColor } from '@/lib/strategyColors';

interface EquityPoint { date: string; value: number }
interface MarketPoint { date: string; close: number }
interface CapePoint { date: string; cape: number | null; capeRatio: number | null }
interface Props { data: Record<string, EquityPoint[]>; startDate?: string; marketQQQ?: MarketPoint[]; marketTQQQ?: MarketPoint[]; marketNasdaq?: MarketPoint[]; marketSP500?: MarketPoint[]; capeData?: CapePoint[]; }

const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v*100).toFixed(2)}%`;
const colorFor = (k: string) => getStrategyColor(k);

export function EquityChart({ data, startDate, marketQQQ, marketTQQQ, marketNasdaq, marketSP500, capeData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const [timeRange, setTimeRange] = useState<'1Y' | '5Y' | 'ALL'>('5Y');
  const [isLoaded, setIsLoaded] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; values: Record<string, number>; incPct: Record<string, number>; cagr: Record<string, number>; maxDD: Record<string, { pct: number; date: string }>; market: { qqq: number | null; tqqq: number | null; nasdaq: number | null; sp500: number | null }; cape: { cape: number | null; ratio: number | null } } | null>(null);

  // Agrupado igual que StockChart: 5Y semanal, ALL mensual
  const chartData = React.useMemo(() => {
    const result: Record<string, { time: string; value: number }[]> = {};
    for (const [k, arr] of Object.entries(data)) {
      const sorted = [...arr].map(p => ({ time: new Date(p.date).toISOString().split('T')[0], value: p.value })).sort((a,b)=>a.time.localeCompare(b.time));
      if (sorted.length===0) { result[k]=[]; continue; }
      if (timeRange==='5Y') {
        const groups: Record<string, typeof sorted> = {};
        sorted.forEach(p=>{
          const d=new Date(p.time); const day=d.getDay(); d.setDate(d.getDate()-day+(day===0?-6:1));
          const key=d.toISOString().split('T')[0];
          if(!groups[key]) groups[key]=[]; groups[key].push(p);
        });
        const res = Object.keys(groups).sort().map(k=>{
          const l=groups[k].sort((a,b)=>a.time.localeCompare(b.time));
          return { time: k, value: l[l.length-1].value };
        });
        // último punto con fecha exacta
        if(res.length && sorted[sorted.length-1].time > res[res.length-1].time) res[res.length-1].time = sorted[sorted.length-1].time;
        result[k]=res;
      } else if (timeRange==='ALL') {
        const groups: Record<string, typeof sorted> = {};
        sorted.forEach(p=>{ const key=p.time.substring(0,7)+'-01'; if(!groups[key]) groups[key]=[]; groups[key].push(p); });
        const res = Object.keys(groups).sort().map(k=>{
          const l=groups[k].sort((a,b)=>a.time.localeCompare(b.time));
          return { time: l[l.length-1].time, value: l[l.length-1].value };
        });
        if(res.length && sorted[sorted.length-1].time > res[res.length-1].time) res[res.length-1].time = sorted[sorted.length-1].time;
        result[k]=res;
      } else if (timeRange==='1Y') {
        // último año: filtrar
        const latest = sorted[sorted.length-1].time;
        const from = new Date(latest); from.setFullYear(from.getFullYear()-1);
        result[k]=sorted.filter(p=> new Date(p.time) >= from);
      } else {
        result[k]=sorted;
      }
    }
    return result;
  }, [data, timeRange]);

  // Para header: rango visible
  const rangeLabel = React.useMemo(()=>{
    const all = Object.values(chartData).flat().map(p=>p.time).sort();
    if(!all.length) return '—';
    return `${all[0]} → ${all[all.length-1]} (${all.length} pts)`;
  }, [chartData]);

  useEffect(()=>{
    if(!containerRef.current) return;
    const firstKey = Object.keys(chartData)[0];
    if(!firstKey || chartData[firstKey].length===0) { setIsLoaded(true); return; }
    const w = containerRef.current.clientWidth || 600;
    const h = containerRef.current.clientHeight || 360;
    const chart = createChart(containerRef.current, {
      width: w, height: h,
      layout: { background: { type: ColorType.Solid, color: '#020617' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(30,41,59,0.3)' }, horzLines: { color: 'rgba(30,41,59,0.3)' } },
      crosshair: { mode: 1, vertLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' }, horzLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' } },
      rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 4 },
      localization: { priceFormatter: (p: number) => fmtMoney(p) },
    });
    chartRef.current = chart;
    // 3 líneas
    for (const [k, arr] of Object.entries(chartData)) {
      const s = chart.addSeries(LineSeries, { color: colorFor(k), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: k });
      s.setData(arr as any);
      seriesRefs.current[k]=s as any;
    }
    chart.timeScale().fitContent();
    setIsLoaded(true);
    const handler = (param: any) => {
      if (!param.time || !param.point) { setTooltip(null); return; }
      const toKey = (t: any) => typeof t === 'string' ? t : typeof t === 'number' ? new Date(t * 1000).toISOString().split('T')[0] : String(t);
      const date = toKey(param.time);
      const values: Record<string, number> = {};
      const nearest = (arr: { time: string; value: number }[]) => {
        let best = arr[0]; let bestD = Infinity;
        for (const p of arr) { const d = Math.abs(new Date(p.time).getTime() - new Date(date).getTime()); if (d < bestD) { bestD = d; best = p; } }
        return best;
      };
      for (const [k, arr] of Object.entries(chartData)) {
        if (!arr.length) continue;
        const exact = arr.find(p => p.time === date);
        const pick = exact ?? nearest(arr as any);
        if (pick) values[k] = pick.value;
      }
      if (Object.keys(values).length === 0 && param.seriesData) {
        for (const [k, s] of Object.entries(seriesRefs.current)) {
          const d = (param.seriesData as any).get(s) as any;
          if (d && typeof d.value === 'number') values[k] = d.value;
        }
      }
      if (Object.keys(values).length === 0) { setTooltip(null); return; }
      // a) % incremento y c) CAGR
      const incPct: Record<string, number> = {};
      const cagr: Record<string, number> = {};
      const maxDD: Record<string, { pct: number; date: string }> = {};
      const baseStart = startDate || Object.values(chartData).flat().map(p=>p.time).sort()[0] || date;
      const startTs = new Date(baseStart).getTime();
      const curTs = new Date(date).getTime();
      const years = Math.max(0, (curTs - startTs) / (365.25*24*3600*1000));
      for (const [k, arr] of Object.entries(chartData)) {
        if (!arr.length) continue;
        const init = arr[0].value || 100000;
        const cur = values[k];
        if (cur != null) {
          incPct[k] = (cur / init - 1);
          cagr[k] = years > 0 ? (Math.pow(cur / init, 1/years) - 1) : 0;
        }
        // b) max drawdown hasta la fecha
        let peak = -Infinity; let bestDD = 0; let bestDDDate = arr[0].time;
        for (const p of arr) {
          if (new Date(p.time).getTime() > curTs) break;
          if (p.value > peak) peak = p.value;
          const dd = peak > 0 ? (peak - p.value)/peak : 0;
          if (dd > bestDD) { bestDD = dd; bestDDDate = p.time; }
        }
        maxDD[k] = { pct: bestDD, date: bestDDDate };
      }
      // d) mercado nearest
      const nearestMarket = (arr?: MarketPoint[]) => {
        if (!arr || !arr.length) return null;
        let best = arr[0]; let bd = Infinity;
        for (const p of arr) { const d = Math.abs(new Date(p.date).getTime() - curTs); if (d<bd){bd=d; best=p;} }
        return best.close;
      };
      const market = { qqq: nearestMarket(marketQQQ), tqqq: nearestMarket(marketTQQQ), nasdaq: nearestMarket(marketNasdaq), sp500: nearestMarket(marketSP500) };
      // e) CAPE nearest
      let capeVal: number | null = null; let ratioVal: number | null = null;
      if (capeData && capeData.length) {
        let best = capeData[0]; let bd = Infinity;
        for (const p of capeData) { const d = Math.abs(new Date(p.date).getTime() - curTs); if (d<bd){bd=d; best=p;} }
        capeVal = best.cape; ratioVal = best.capeRatio;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      const cw = rect?.width ?? 600;
      const tx = Math.max(8, Math.min(param.point.x + 16, cw - 340));
      const ty = Math.max(8, Math.min(param.point.y - 90, 320));
      setTooltip({ x: tx, y: ty, date, values, incPct, cagr, maxDD, market, cape: { cape: capeVal, ratio: ratioVal } });
    };
    chart.subscribeCrosshairMove(handler);
    const ro = new ResizeObserver(()=>{
      if(containerRef.current && chartRef.current){
        const ww=containerRef.current.clientWidth; const hh=containerRef.current.clientHeight;
        if(ww>0&&hh>0) chartRef.current.applyOptions({width:ww, height:hh});
      }
    });
    ro.observe(containerRef.current);
    return ()=>{ ro.disconnect(); try{ chart.unsubscribeCrosshairMove(handler); }catch{}; chart.remove(); chartRef.current=null; seriesRefs.current={}; setTooltip(null); };
  }, [chartData]);

  // Visible range por timeRange (igual que StockChart)
  useEffect(()=>{
    const chart = chartRef.current;
    if(!chart || !isLoaded) return;
    const allTimes = Object.values(chartData).flat().map(p=>p.time).sort();
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
  }, [timeRange, chartData, isLoaded]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-100">Equity Curves (100k inicial) — {rangeLabel}</h3>
        <div className="flex gap-1">
          {(['1Y','5Y','ALL'] as const).map(r=>(
            <button key={r} onClick={()=>setTimeRange(r)} className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${timeRange===r ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="relative w-full h-[360px] overflow-visible">
        <div ref={containerRef} className="w-full h-full" />
        {tooltip && (
          <div data-testid="bt-tooltip" className="absolute z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[320px] max-w-[360px]" style={{ left: tooltip.x, top: tooltip.y }}>
            <div className="font-semibold text-slate-100 mb-2 tracking-wide border-b border-slate-700 pb-1.5">{new Date(tooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            {Object.entries(tooltip.values)
              .sort((a,b)=> b[1]-a[1])
              .map(([k, v]) => {
                const inc = tooltip.incPct[k];
                const cg = tooltip.cagr[k];
                const dd = tooltip.maxDD[k];
                return (
              <div key={k} className="border-b border-slate-700/50 last:border-0 py-1.5">
                <div className="flex justify-between items-center gap-3 leading-5">
                  <span className="flex items-center gap-2 font-medium text-slate-200"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: colorFor(k)}} /><span className="tracking-tight">{k}</span></span>
                  <span className="font-mono font-semibold text-white tabular-nums">{fmtMoney(v)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-0.5 pl-4">
                  <span>a) Incr: <span className="text-slate-200 font-mono">{inc!=null ? fmtPct(inc) : '—'}</span></span>
                  <span>c) CAGR: <span className="text-slate-200 font-mono">{cg!=null ? fmtPct(cg) : '—'}</span></span>
                  <span>b) DD máx: <span className="text-amber-300 font-mono">{dd ? `${fmtPct(dd.pct)} @ ${new Date(dd.date).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})}` : '—'}</span></span>
                </div>
              </div>
            )})}
            <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
              <div className="text-[11px] text-slate-400">d) Índices: <span className="text-slate-200 font-mono">NASDAQ {tooltip.market.nasdaq!=null? fmtMoney(tooltip.market.nasdaq):'—'}</span> · <span className="text-slate-200 font-mono">S&P500 {tooltip.market.sp500!=null? fmtMoney(tooltip.market.sp500):'—'}</span></div>
              <div className="text-[11px] text-slate-400">   ETFs: <span className="text-slate-200 font-mono">QQQ {tooltip.market.qqq!=null? `$${tooltip.market.qqq.toFixed(2)}`:'—'}</span> · <span className="text-slate-200 font-mono">TQQQ {tooltip.market.tqqq!=null? `$${tooltip.market.tqqq.toFixed(2)}`:'—'}</span></div>
              <div className="text-[11px] text-slate-400">e) CAPE: <span className="text-slate-200 font-mono">{tooltip.cape.cape!=null? tooltip.cape.cape.toFixed(2):'—'}</span> · Ratio: <span className="text-slate-200 font-mono">{tooltip.cape.ratio!=null? tooltip.cape.ratio.toFixed(3):'—'}</span></div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs">
        {Object.keys(data).map(k=>(
          <span key={k} className="flex items-center gap-2"><span className="w-3.5 h-0.5 rounded" style={{background: colorFor(k)}} /> <span className="font-medium tracking-tight" style={{color: colorFor(k)}}>{k}</span></span>
        ))}
        <span className="ml-auto text-slate-500">Scroll/arrastra para zoom • 5Y por defecto</span>
      </div>
    </div>
  );
}

export function DrawdownChart({ data }: { data: Record<string, { date: string; drawdown: number }[]> }) {
  // Mantener Recharts simple para drawdown
  const allDates = new Set<string>();
  Object.values(data).forEach(arr => arr.forEach(p => allDates.add(new Date(p.date).toISOString().split('T')[0])));
  const sorted = Array.from(allDates).sort();
  // muestreo si >600
  const sampled = sorted.length>600 ? sorted.filter((_,i)=> i%Math.ceil(sorted.length/600)===0 || i===sorted.length-1) : sorted;
  const maps = Object.fromEntries(Object.entries(data).map(([k, arr])=>{
    const m=new Map<string,number>(); arr.forEach(p=>m.set(new Date(p.date).toISOString().split('T')[0], p.drawdown)); return [k,m];
  }));
  const merged = sampled.map(d=>{ const r:any={date:d}; for(const k of Object.keys(data)){ const v=maps[k].get(d); if(v!==undefined) r[k]=v; } return r; });
  const fmtPct = (v:number)=>`${(Number(v)*100).toFixed(0)}%`;
  return (
    <div className="w-full h-[260px] bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="font-semibold mb-2 text-slate-100">Drawdown</h3>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={merged}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" tickFormatter={(v:string)=> new Date(v).toLocaleDateString('es-ES',{month:'short', year:'2-digit'})} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtPct} />
          <ReTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} formatter={(v:any)=>[`${(Number(v)*100).toFixed(2)}%`,''] as any} />
          <Legend wrapperStyle={{ color: '#cbd5e1' }} />
          <Area type="monotone" dataKey="MALLIK_TQQQ" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.18} connectNulls />
          <Area type="monotone" dataKey="SCHILLER_TQQQ_5A" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.14} connectNulls />
          <Area type="monotone" dataKey="SCHILLER_TQQQ_10A" stroke="#c084fc" fill="#c084fc" fillOpacity={0.14} connectNulls />
          <Area type="monotone" dataKey="BH_QQQ" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.18} connectNulls />
          <Area type="monotone" dataKey="BH_TQQQ" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.10} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
