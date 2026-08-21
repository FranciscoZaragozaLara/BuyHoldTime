'use client';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries } from 'lightweight-charts';
import { Layers, Calendar, TrendingUp } from 'lucide-react';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}
const fmtMoney = (v: number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtNum = (v: number|null|undefined) => v==null||isNaN(Number(v)) ? '—' : Number(v).toFixed(2);
function capeRatioColor(r: number | null | undefined){
  if(r==null || isNaN(Number(r))) return 'text-slate-400';
  const v=Number(r);
  if(v < 1.0) return 'text-emerald-400';
  if(v < 1.15) return 'text-yellow-400';
  if(v < 1.30) return 'text-orange-400';
  return 'text-red-400';
}

interface Allocation { date: string; tqqqPct: number; qqqPct?: number; cashPct: number; tqqqValue: number; qqqValue?: number; cashValue: number; portfolioValue: number; targetPct: number|null; indicators: any; }
interface RunMeta { id: string; strategy: { code: string; name: string }; metrics: any; }

const allocColors: Record<string,string> = { tqqq: '#2dd4bf', qqq: '#a78bfa', cash: '#334155' };

function getExplorerLabels(code:string){
  const c=(code||'').toUpperCase();
  const tickers = ['SCHD','JEPQ','SQQQ','JEPI','VOO','SPY','QQQ','TQQQ'];
  for (const t of tickers) if (c.includes(t)) {
    if (c.startsWith('BH_') || c.endsWith('_BH') || c===t || c.startsWith(t+'_')) {
      const isSgov = c.startsWith('VOO_') || c.startsWith('SPY_');
      return { primary:t, primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash: isSgov ? 'Cash (SGOV)' : 'Cash', pricePrimary:t, priceSecondary:null as string|null, subtitle:`${t}/Cash · ${t} close · CAPE & media` };
    }
  }
  if(c.startsWith('VOO_')||c==='VOO_BH_2010'){ return { primary:'VOO', primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash:'Cash (SGOV)', pricePrimary:'VOO', priceSecondary:null as string|null, subtitle:'VOO/Cash · VOO close · CAPE & media' }; }
  if(c.startsWith('SPY_')||c==='SPY_BH_2010'||c==='SPY_BH_ORIGIN'){ return { primary:'SPY', primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash:'Cash (SGOV)', pricePrimary:'SPY', priceSecondary:null as string|null, subtitle:'SPY/Cash · SPY close · CAPE & media' }; }
  if(c==='MALLIK_TQQQ'){ return { primary:'TQQQ', primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash:'Cash', pricePrimary:'QQQ', priceSecondary:'TQQQ', subtitle:'TQQQ/Cash · QQQ/TQQQ close · CAPE & media' }; }
  if(c==='BH_TQQQ'){ return { primary:'TQQQ', primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash:'Cash', pricePrimary:'TQQQ', priceSecondary:null as string|null, subtitle:'TQQQ · TQQQ close' }; }
  if(c==='BH_QQQ'){ return { primary:'QQQ', primaryKey:'tqqqPct' as const, secondary:null as string|null, secondaryKey:null as string|null, cash:'Cash', pricePrimary:'QQQ', priceSecondary:null as string|null, subtitle:'QQQ · QQQ close' }; }
  // default SCHILLER 3 activos
  return { primary:'TQQQ', primaryKey:'tqqqPct' as const, secondary:'QQQ' as string, secondaryKey:'qqqPct' as const, cash:'Cash (SGOV)', pricePrimary:'QQQ', priceSecondary:'TQQQ' as string, subtitle:'TQQQ/QQQ/Cash · QQQ/TQQQ close · CAPE & media' };
}

export function StrategyExplorer({ strategyCode, runs: initialRuns, startDates, onSelectedRunChange }: { strategyCode: string; runs?: RunMeta[]; startDates?: any[]; onSelectedRunChange?: (runId: string | null, run: RunMeta | null) => void }) {
  const [runs, setRuns] = useState<RunMeta[]>(initialRuns || []);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [startMap, setStartMap] = useState<Map<string,any>>(new Map());
  useEffect(()=>{ if(initialRuns && initialRuns.length) setRuns(initialRuns); }, [initialRuns]);
  useEffect(()=>{
    if(startDates && startDates.length){
      const m=new Map<string,any>();
      for(const sd of startDates){ const k=(sd.startDate||'').slice(0,10); m.set(k, sd); }
      setStartMap(m);
    } else {
      const base=getApiBase();
      fetch(`${base}/api/backtesting/start-dates`,{cache:'no-store'}).then(r=>r.json()).then(j=>{
        const m=new Map<string,any>();
        for(const sd of (Array.isArray(j)?j:[])){ const k=(sd.startDate||'').slice(0,10); m.set(k, sd); }
        setStartMap(m);
      }).catch(()=>{});
    }
  }, [startDates]);
  useEffect(()=>{
    if(!strategyCode) return;
    const base=getApiBase();
    fetch(`${base}/api/backtesting/runs?strategyCode=${strategyCode}`,{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(Array.isArray(j) && j.length) {
        const mapped=j.map((r:any)=> ({ id:r.id, strategy:{ code:r.strategy.code, name:r.strategy.name }, metrics:r.metrics, startDate:r.startDate }));
        setRuns(mapped);
        if(!selectedRunId) setSelectedRunId(mapped[0]?.id || null);
      }
    }).catch(()=>{});
  }, [strategyCode]);
  useEffect(()=>{ if(runs.length && !selectedRunId) setSelectedRunId(runs[0].id); }, [runs]);
  useEffect(()=>{ if(runs.length && strategyCode && !runs.find(r=>r.strategy.code===strategyCode)) setSelectedRunId(runs[0]?.id || null); }, [strategyCode]);
  const selectedRun = useMemo(()=> runs.find(r=>r.id===selectedRunId) || runs[0] || null, [runs, selectedRunId]);
  const runId = selectedRun?.id || null;
  const selectedCode = strategyCode || selectedRun?.strategy?.code || 'MALLIK_TQQQ';
  useEffect(()=>{ if(onSelectedRunChange) onSelectedRunChange(runId, selectedRun); }, [runId, selectedRun, onSelectedRunChange]);
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [marketQQQ, setMarketQQQ] = useState<Map<string,number>>(new Map());
  const [marketTQQQ, setMarketTQQQ] = useState<Map<string,number>>(new Map());
  const [schiller, setSchiller] = useState<Map<string,{cape:number,mean5y:number,mean10y:number}>>(new Map());
  const [loading, setLoading] = useState(false);
  const allocChartRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<HTMLDivElement>(null);
  const allocChartApi = useRef<IChartApi|null>(null);
  const priceChartApi = useRef<IChartApi|null>(null);
  const allocTooltipRef = useRef<HTMLDivElement>(null);
  const priceTooltipRef = useRef<HTMLDivElement>(null);
  const allocLastDateRef = useRef<string | null>(null);
  const priceLastDateRef = useRef<string | null>(null);
  const allocLastUpdateRef = useRef<number>(0);
  const priceLastUpdateRef = useRef<number>(0);
  const [allocTooltip, setAllocTooltip] = useState<{date:string, row:any}|null>(null);
  const [priceTooltip, setPriceTooltip] = useState<{date:string, row:any}|null>(null);

  const labels = useMemo(()=> getExplorerLabels(selectedCode), [selectedCode]);
  // load allocations + market data + schiller
  useEffect(()=>{
    if(!runId) return;
    const base=getApiBase();
    setLoading(true);
    Promise.all([
      fetch(`${base}/api/backtesting/runs/${runId}/allocations`).then(r=>r.json()).catch(()=>[]),
      fetch(`${base}/api/backtesting/market-data?ticker=QQQ`).then(r=>r.json()).catch(()=>[]),
      fetch(`${base}/api/backtesting/market-data?ticker=TQQQ`).then(r=>r.json()).catch(()=>[]),
      fetch(`${base}/api/backtesting/market-data?ticker=VOO`).then(r=>r.json()).catch(()=>[]),
      fetch(`${base}/api/backtesting/market-data?ticker=SPY`).then(r=>r.json()).catch(()=>[]),
      fetch(`${base}/api/backtesting/market-data?ticker=SCHD`).then(r=>r.json()).catch(()=>[]),
      fetch('/schiller.json').then(r=>r.json()).catch(()=>[]),
    ]).then(([a, qqqRows, tqqqRows, vooRows, spyRows, schdRows, schRows])=>{
      setAllocs(Array.isArray(a)?a:[]);
      const qMap=new Map<string,number>(); for(const r of (Array.isArray(qqqRows)?qqqRows:[])){ const d=(r.date||'').split('T')[0]; if(d) qMap.set(d, Number(r.close)); }
      const tMap=new Map<string,number>(); for(const r of (Array.isArray(tqqqRows)?tqqqRows:[])){ const d=(r.date||'').split('T')[0]; if(d) tMap.set(d, Number(r.close)); }
      const vooMap=new Map<string,number>(); for(const r of (Array.isArray(vooRows)?vooRows:[])){ const d=(r.date||'').split('T')[0]; if(d) vooMap.set(d, Number(r.close)); }
      const spyMap=new Map<string,number>(); for(const r of (Array.isArray(spyRows)?spyRows:[])){ const d=(r.date||'').split('T')[0]; if(d) spyMap.set(d, Number(r.close)); }
      const schdMap=new Map<string,number>(); for(const r of (Array.isArray(schdRows)?schdRows:[])){ const d=(r.date||'').split('T')[0]; if(d) schdMap.set(d, Number(r.close)); }
      // for VOO/SPY/SCHD strategies, inject their close into generic maps
      if(labels.pricePrimary==='VOO' || labels.priceSecondary==='VOO'){ for(const [k,v] of vooMap){ qMap.set(k,v); tMap.set(k,v);} }
      if(labels.pricePrimary==='SPY' || labels.priceSecondary==='SPY'){ for(const [k,v] of spyMap){ qMap.set(k,v); tMap.set(k,v);} }
      if(labels.pricePrimary==='SCHD' || labels.priceSecondary==='SCHD'){ for(const [k,v] of schdMap){ qMap.set(k,v); tMap.set(k,v);} }
      setMarketQQQ(qMap); setMarketTQQQ(tMap);
      const sMap=new Map<string,{cape:number,mean5y:number,mean10y:number}>();
      for(const r of (Array.isArray(schRows)?schRows:[])){ sMap.set(r.date, {cape:Number(r.cape), mean5y: Number(r.mean5y), mean10y: Number(r.mean10y)}); }
      setSchiller(sMap);
    }).finally(()=>setLoading(false));
  }, [runId, selectedCode]);

  // derived rows month-by-month merged
  const rows = useMemo(()=>{
    return allocs.map(a=>{
      const d=(a.date||'').split('T')[0];
      const ind=a.indicators||{};
      // qqq/tqqq close: prefer indicator, fallback to market map nearest
      const qClose = ind.qqq_close ?? marketQQQ.get(d) ?? (()=>{let best:number|undefined; for(const [k,v] of marketQQQ){ if(k<=d) best=v; else break;} return best;})();
      const tClose = ind.tqqq_close ?? marketTQQQ.get(d) ?? (()=>{let best:number|undefined; for(const [k,v] of marketTQQQ){ if(k<=d) best=v; else break;} return best;})();
      const schDate = d.substring(0,7)+'-01';
      const sch = schiller.get(schDate) || schiller.get(d) || null;
      const cape = ind.cape ?? ind.CAPE ?? sch?.cape ?? null;
      const mean = ind.mean ?? (selectedCode.includes('5A')? sch?.mean5y : sch?.mean10y) ?? sch?.mean5y ?? null;
      const maxHist = ind.max_hist ?? ind.maxHist ?? null;
      const ratio = cape && mean ? cape/mean : ind.cape_ratio ?? null;
      const isSchiller = selectedCode.startsWith('SCHILLER');
      const isMallik = selectedCode==='MALLIK_TQQQ';
      return { ...a, _d:d, _qClose:qClose, _tClose:tClose, _cape:cape, _maxHist:maxHist, _mean:mean, _ratio:ratio, _isSchiller:isSchiller, _isMallik:isMallik, _ind:ind };
    }).sort((a,b)=>a._d.localeCompare(b._d));
  }, [allocs, marketQQQ, marketTQQQ, schiller, selectedCode]);

  const monthlyRows = useMemo(()=>{
    const byMonth = new Map<string, any>();
    for(const r of rows){
      const k = r._d.slice(0,7);
      byMonth.set(k, r);
    }
    return Array.from(byMonth.values()).sort((a,b)=>a._d.localeCompare(b._d));
  }, [rows]);

  const headerStats = useMemo(()=>{
    const final = Number(selectedRun?.metrics?.finalValue || 0);
    const initial = Number((selectedRun?.metrics as any)?.initialValue ?? (selectedRun?.metrics as any)?.initialCapital ?? 100000);
    const totalReturn = initial ? (final/initial - 1) : 0;
    const mult = initial ? final/initial : 0;
    let monthsDisplay = String(rows.length);
    const startStr = ((selectedRun as any)?.startDate as string) || rows[0]?._d || null;
    const endStr = rows.length ? rows[rows.length-1]._d : ((selectedRun?.metrics as any)?.endDate as string) || null;
    if(startStr && endStr){
      const s = new Date(String(startStr).slice(0,10));
      const e = new Date(String(endStr).slice(0,10));
      const days = (e.getTime() - s.getTime())/86400000;
      if(isFinite(days) && days >= 0){
        const frac = days / 30.4375;
        monthsDisplay = frac.toFixed(1);
      }
    }
    return { totalReturn, mult, monthsDisplay };
  }, [selectedRun, rows]);

  // 3 áreas apiladas TQQQ / QQQ / Cash diferenciadas
  useEffect(()=>{
    if(!allocChartRef.current || !rows.length) return;
    const w=allocChartRef.current.clientWidth||600; const h=allocChartRef.current.clientHeight||220;
    const chart=createChart(allocChartRef.current, { width:w, height:h, layout:{background:{type:ColorType.Solid,color:'#020617'}, textColor:'#94a3b8', fontSize:11}, grid:{vertLines:{color:'rgba(30,41,59,0.3)'}, horzLines:{color:'rgba(30,41,59,0.3)'}}, rightPriceScale:{borderColor:'rgba(30,41,59,0.5)', scaleMargins:{top:0.05,bottom:0.05}}, timeScale:{borderColor:'rgba(30,41,59,0.5)', rightOffset:2, barSpacing:6, fixLeftEdge:false, fixRightEdge:false, lockVisibleTimeRangeOnResize:false}, handleScroll:{mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:true}, handleScale:{mouseWheel:true, pinch:true, axisPressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:true}} as any);
    allocChartApi.current=chart;
    const cashSeries=chart.addSeries(AreaSeries, { lineColor: '#f59e0b', topColor:'rgba(245,158,11,0.45)', bottomColor:'rgba(245,158,11,0.05)', lineWidth:1, title:`${labels.cash} %`});
    const qqqSeries= labels.secondary ? chart.addSeries(AreaSeries, { lineColor: allocColors.qqq, topColor:'rgba(167,139,250,0.5)', bottomColor:'rgba(167,139,250,0.15)', lineWidth:1, title:`${labels.secondary} %`}) : null as any;
    const tqqqSeries=chart.addSeries(AreaSeries, { lineColor: allocColors.tqqq, topColor:'rgba(45,212,191,0.55)', bottomColor:'rgba(45,212,191,0.15)', lineWidth:2, title:`${labels.primary} %`});
    // Capas: Cash 0->cash%, QQQ cash%->cash%+qqq% (stacked) solo si secondary existe, primary 0->primary% (overlay). Evitar NaN si qqqPct undefined (Mallik/VOO/SPY)
    cashSeries.setData(rows.map(r=>{
      const v = Number(r.cashPct ?? 0);
      return {time:r._d, value: isFinite(v) ? Math.round(v*1000)/10 : 0 };
    }) as any);
    if(qqqSeries) qqqSeries.setData(rows.map(r=>{
      const cash = Number(r.cashPct ?? 0);
      const qqq = Number((r as any).qqqPct ?? (1 - Number(r.tqqqPct ?? 0) - cash));
      const v = cash + (isFinite(qqq) ? qqq : 0);
      return {time:r._d, value: isFinite(v) ? Math.round(v*1000)/10 : 0 };
    }) as any);
    tqqqSeries.setData(rows.map(r=>{
      const v = Number(r.tqqqPct ?? 0);
      return {time:r._d, value: isFinite(v) ? Math.round(v*1000)/10 : 0 };
    }) as any);
    chart.timeScale().fitContent();
    // tooltip: stable - no blink (keep last when point missing, raf throttle, mouseleave hides)
    const rowMap = new Map(rows.map(r=>[r._d, r]));
    const allocHandler = (param:any)=>{
      const now=Date.now();
      if(now - allocLastUpdateRef.current < 40) return;
      allocLastUpdateRef.current=now;
      if(!param.point) return;
      let date:string|null=null;
      if(param.time){
        const toKey=(t:any)=> typeof t==='string'?t: typeof t==='number'? new Date(t*1000).toISOString().split('T')[0]: String(t);
        date=toKey(param.time);
      } else {
        const rect=allocChartRef.current?.getBoundingClientRect();
        const relX= param.point.x - (rect?.left ?? 0);
        const idx=Math.floor((relX / (rect?.width ?? 600)) * rows.length);
        const clamped=Math.max(0, Math.min(rows.length-1, idx));
        date=rows[clamped]?._d || null;
      }
      if(!date && rows.length) date=rows[Math.floor(rows.length/2)]._d;
      if(!date) return;
      let row=rowMap.get(date) as any;
      if(!row){
        let best:any=null; let bd=Infinity;
        for(const r of rows){ const d=Math.abs(new Date(r._d).getTime()-new Date(date).getTime()); if(d<bd){bd=d; best=r;}}
        row=best;
      }
      if(!row && rows.length) row=rows[Math.floor(rows.length/2)];
      if(!row) return;
      // position via DOM (no React re-render); visibility driven by React state (avoids blank frame)
      const rect=allocChartRef.current?.getBoundingClientRect();
      const cw=rect?.width??600;
      const tx=Math.max(8, Math.min(param.point.x+16, cw-320));
      const ty=Math.max(8, Math.min(param.point.y-10, 180));
      if(allocTooltipRef.current){
        allocTooltipRef.current.style.left = tx + 'px';
        allocTooltipRef.current.style.top = ty + 'px';
        allocTooltipRef.current.style.transform = 'translate3d(0,0,0)';
      }
      // only update content when date changes (avoids blink from re-render)
      if(date===allocLastDateRef.current) return;
      allocLastDateRef.current=date;
      setAllocTooltip({date: row._d, row});
    };
    chart.subscribeCrosshairMove(allocHandler);
    const container = allocChartRef.current;
    const onLeave = ()=>{ allocLastDateRef.current=null; setAllocTooltip(null); };
    container?.addEventListener('mouseleave', onLeave);
    const ro=new ResizeObserver(()=>{ if(allocChartRef.current && allocChartApi.current){ const ww=allocChartRef.current.clientWidth; const hh=allocChartRef.current.clientHeight; if(ww>0&&hh>0) allocChartApi.current.applyOptions({width:ww,height:hh}); }});
    ro.observe(allocChartRef.current);
    return ()=>{ ro.disconnect(); container?.removeEventListener('mouseleave', onLeave); try{ chart.unsubscribeCrosshairMove(allocHandler);}catch{}; chart.remove(); allocChartApi.current=null; setAllocTooltip(null); };
  }, [rows, labels]);

  // price + Schiller chart
  useEffect(()=>{
    if(!priceChartRef.current || !rows.length) return;
    const w=priceChartRef.current.clientWidth||600; const h=priceChartRef.current.clientHeight||260;
    const chart=createChart(priceChartRef.current, { width:w, height:h, layout:{background:{type:ColorType.Solid,color:'#020617'}, textColor:'#94a3b8', fontSize:11}, grid:{vertLines:{color:'rgba(30,41,59,0.3)'}, horzLines:{color:'rgba(30,41,59,0.3)'}}, rightPriceScale:{borderColor:'rgba(30,41,59,0.5)', scaleMargins:{top:0.15,bottom:0.1}}, timeScale:{borderColor:'rgba(30,41,59,0.5)', rightOffset:2, barSpacing:6, fixLeftEdge:false, fixRightEdge:false, lockVisibleTimeRangeOnResize:false}, handleScroll:{mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:true}, handleScale:{mouseWheel:true, pinch:true, axisPressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:true}} as any);
    priceChartApi.current=chart;
    const qqqLine=chart.addSeries(LineSeries, {color:'#e2e8f0', lineWidth:2, title: labels.pricePrimary});
    const tqqqLine=labels.priceSecondary ? chart.addSeries(LineSeries, {color:'#fbbf24', lineWidth:2, title: labels.priceSecondary}) : null as any;
    const capeLine=chart.addSeries(LineSeries, {color:'#f472b6', lineWidth:2, title:'CAPE'});
    const meanLine=chart.addSeries(LineSeries, {color:'#a78bfa', lineWidth:1, lineStyle:2, title: selectedCode.includes('5A')?'Mean 5A': selectedCode.includes('3A')?'Mean 3A':'Mean 10A'});
    qqqLine.setData(rows.filter(r=>r._qClose).map(r=>({time:r._d, value: Number(r._qClose)})) as any);
    if(tqqqLine) tqqqLine.setData(rows.filter(r=>r._tClose).map(r=>({time:r._d, value: Number(r._tClose)})) as any);
    // cape on same scale — normalize? Keep as is (cape 20-42) vs QQQ 50-600 → will be flattened. Use separate priceScaleId for cape.
    // Put cape on left scale via priceScaleId hack: lightweight needs extra scale, fallback to overlay with auto scale — keep overlay but cape will be small. Instead scale cape *10 for visibility.
    const capeScale = rows.filter(r=>r._cape).map(r=>({time:r._d, value: Number(r._cape)*10})) as any;
    const meanScale = rows.filter(r=>r._mean).map(r=>({time:r._d, value: Number(r._mean)*10})) as any;
    capeLine.setData(capeScale);
    meanLine.setData(meanScale);
    chart.timeScale().fitContent();
    const priceRowMap=new Map(rows.map(r=>[r._d, r]));
    const priceHandler=(param:any)=>{
      const now2=Date.now();
      if(now2 - priceLastUpdateRef.current < 40) return;
      priceLastUpdateRef.current=now2;
      if(!param.point) return;
      let pDate:string|null=null;
      if(param.time){
        const toKey=(t:any)=> typeof t==='string'?t: typeof t==='number'? new Date(t*1000).toISOString().split('T')[0]: String(t);
        pDate=toKey(param.time);
      } else {
        const rect=priceChartRef.current?.getBoundingClientRect();
        const relX= param.point.x - (rect?.left ?? 0);
        const idx=Math.floor((relX / (rect?.width ?? 600)) * rows.length);
        const clamped=Math.max(0, Math.min(rows.length-1, idx));
        pDate=rows[clamped]?._d || null;
      }
      if(!pDate && rows.length) pDate=rows[Math.floor(rows.length/2)]._d;
      if(!pDate) return;
      let row=priceRowMap.get(pDate) as any;
      if(!row){
        let best:any=null; let bd=Infinity;
        for(const r of rows){ const d=Math.abs(new Date(r._d).getTime()-new Date(pDate).getTime()); if(d<bd){bd=d; best=r;}}
        row=best;
      }
      if(!row && rows.length) row=rows[Math.floor(rows.length/2)];
      if(!row) return;
      const rect=priceChartRef.current?.getBoundingClientRect();
      const cw=rect?.width??600;
      const tx=Math.max(8, Math.min(param.point.x+16, cw-320));
      const ty=Math.max(8, Math.min(param.point.y-10, 200));
      if(priceTooltipRef.current){
        priceTooltipRef.current.style.left = tx + 'px';
        priceTooltipRef.current.style.top = ty + 'px';
        priceTooltipRef.current.style.transform = 'translate3d(0,0,0)';
      }
      if(pDate===priceLastDateRef.current) return;
      priceLastDateRef.current=pDate;
      setPriceTooltip({date: row._d, row});
    };
    chart.subscribeCrosshairMove(priceHandler);
    const pContainer = priceChartRef.current;
    const pOnLeave = ()=>{ priceLastDateRef.current=null; setPriceTooltip(null); };
    pContainer?.addEventListener('mouseleave', pOnLeave);
    const ro=new ResizeObserver(()=>{ if(priceChartRef.current && priceChartApi.current){ const ww=priceChartRef.current.clientWidth; const hh=priceChartRef.current.clientHeight; if(ww>0&&hh>0) priceChartApi.current.applyOptions({width:ww,height:hh}); }});
    ro.observe(priceChartRef.current);
    return ()=>{ ro.disconnect(); pContainer?.removeEventListener('mouseleave', pOnLeave); try{ chart.unsubscribeCrosshairMove(priceHandler);}catch{}; chart.remove(); priceChartApi.current=null; setPriceTooltip(null); };
  }, [rows, selectedCode]);

  if(!runs.length) return <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-400">Sin estrategias</div>;

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Layers size={18} className="text-violet-400"/> Explorador mensual — {selectedCode} · Asignación & Evolución</h3>
            <p className="text-xs text-slate-400 mt-1">Mes a mes · {labels.subtitle} · Fecha del run seleccionada desde Histórico</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Fecha</span>
            <select value={selectedRunId || ''} onChange={e=>setSelectedRunId(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-violet-500 min-w-[320px] max-w-[520px]">
              {runs.slice().sort((a:any,b:any)=> (b.startDate||'').localeCompare(a.startDate||'')).map(r=> {
                const d=(r as any).startDate ? (r as any).startDate.slice(0,10) : r.id.slice(0,10);
                const sd=startMap.get(d);
                const label=sd?.label && sd.label !== d ? ` — ${sd.label}` : '';
                const desc=sd?.descriptor ? ` · ${sd.descriptor}` : '';
                const cat=sd?.category ? ` [${sd.category}]` : '';
                return <option key={r.id} value={r.id}>{d}{label}{desc}{cat} · {fmtMoney(r.metrics?.finalValue || 0)}</option>
              })}
            </select>
          </div>
        </div>
        {selectedRun && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-4 text-xs">
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">Final</div><div className="font-mono font-semibold text-white">{fmtMoney(selectedRun.metrics.finalValue)}</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">CAGR</div><div className="font-mono font-semibold text-emerald-400">{fmtPct(selectedRun.metrics.cagr)}</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">Total Return</div><div className={`font-mono font-semibold ${headerStats.totalReturn>=0?'text-emerald-400':'text-rose-400'}`}>{(headerStats.totalReturn*100).toFixed(2)}%</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">×</div><div className="font-mono font-semibold text-white">{headerStats.mult.toFixed(2)}×</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">Sharpe</div><div className="font-mono font-semibold text-white">{fmtNum(selectedRun.metrics.sharpe)}</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">MaxDD</div><div className="font-mono font-semibold text-rose-400">{fmtPct(selectedRun.metrics.maxDrawdown)}</div></div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3"><div className="text-slate-400">Meses</div><div className="font-mono font-semibold text-white">{headerStats.monthsDisplay} meses{loading?' · cargando...':''}</div></div>
          </div>
        )}
        {/* Allocation chart */}
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-teal-400"/>Asignación % — {labels.primary} {labels.secondary ? `vs ${labels.secondary}/${labels.cash}` : `vs ${labels.cash}`} (mensual)</h4>
          <div className="relative w-full h-[220px] rounded-lg border border-slate-800 overflow-visible">
            <div ref={allocChartRef} className="w-full h-full rounded-lg overflow-hidden" />
            <div ref={allocTooltipRef} className="absolute z-20 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[260px] will-change-transform" style={{opacity: allocTooltip ? 1 : 0, visibility: allocTooltip ? 'visible' as const : 'hidden' as const, left: 0, top: 0, transition:'opacity 0.08s ease'}}>
              {allocTooltip && (<>
                <div className="font-semibold text-slate-100 mb-2 border-b border-slate-700 pb-1.5">{new Date(allocTooltip.date).toLocaleDateString('es-ES',{day:'2-digit', month:'short', year:'numeric'})}</div>
                <div className="space-y-1">
                  {(() => {
                    const t = Number(allocTooltip.row.tqqqPct ?? 0);
                    const c = Number((allocTooltip.row as any).cashPct ?? allocTooltip.row.cashPct ?? 0);
                    const q = Number((allocTooltip.row as any).qqqPct ?? (1 - t - (isFinite(c) ? c : 0)));
                    const qSafe = isFinite(q) ? Math.max(0, q) : 0;
                    const cSafe = isFinite(c) ? Math.max(0, c) : 0;
                    return (<>
                      <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{background: allocColors.tqqq}}/>{labels.primary} %</span><span className="font-mono font-semibold text-teal-300">{fmtPct(t)}</span></div>
                      {labels.secondary && <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{background: allocColors.qqq}}/>{labels.secondary} %</span><span className="font-mono font-semibold text-violet-300">{fmtPct(qSafe)}</span></div>}
                      <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2.5 h-2.5 rounded-full" style={{background: allocColors.cash}}/>{labels.cash} %</span><span className="font-mono font-semibold text-amber-300">{fmtPct(cSafe)}</span></div>
                    </>);
                  })()}
                  <div className="flex justify-between gap-4"><span className="text-slate-400">Cartera</span><span className="font-mono font-semibold text-white">{fmtMoney(allocTooltip.row.portfolioValue)}</span></div>
                  <div className="border-t border-slate-700 my-1.5"/>
                  <div className="flex justify-between gap-4"><span className="text-slate-400">{labels.pricePrimary}</span><span className="font-mono text-slate-100">{allocTooltip.row._qClose ? fmtMoney(Number(allocTooltip.row._qClose)) : '—'}</span></div>
                  {labels.priceSecondary && <div className="flex justify-between gap-4"><span className="text-slate-400">{labels.priceSecondary}</span><span className="font-mono text-amber-300">{allocTooltip.row._tClose ? fmtMoney(Number(allocTooltip.row._tClose)) : '—'}</span></div>}
                  <div className="flex justify-between gap-4"><span className="text-slate-400">CAPE</span><span className="font-mono text-pink-300">{allocTooltip.row._cape ? fmtNum(Number(allocTooltip.row._cape)) : '—'} {allocTooltip.row._mean ? <span className="text-violet-300">/ Mean {fmtNum(Number(allocTooltip.row._mean))}</span> : null}</span></div>
                  {allocTooltip.row._ratio && <div className="flex justify-between gap-4"><span className="text-slate-400">Ratio</span><span className="font-mono text-slate-200">{Number(allocTooltip.row._ratio).toFixed(2)}×</span></div>}
                  <div className="flex justify-between gap-4"><span className="text-slate-400">Target</span><span className="font-mono text-teal-400">{allocTooltip.row.targetPct!=null?fmtPct(allocTooltip.row.targetPct):'—'}</span></div>
                </div>
              </>)}
              </div>
          </div>
          <div className="flex gap-4 mt-2 text-[11px] text-slate-400"><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-teal-400"/>{labels.primary}</span>{labels.secondary && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-400"/>{labels.secondary}</span>}<span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500"/>{labels.cash}</span><span className="ml-auto">100% {labels.secondary ? `${labels.primary}+${labels.secondary}+${labels.cash}` : `${labels.primary}+${labels.cash}`} — {headerStats.monthsDisplay} meses</span></div>
        </div>
        {/* Price + Schiller chart */}
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2"><TrendingUp size={12} className="text-slate-400"/> Precios & CAPE (CAPE×10 para escala)</h4>
          <div className="relative w-full h-[260px] rounded-lg border border-slate-800 overflow-visible">
            <div ref={priceChartRef} className="w-full h-full rounded-lg overflow-hidden" />
            <div ref={priceTooltipRef} className="absolute z-20 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[260px] will-change-transform" style={{opacity: priceTooltip ? 1 : 0, visibility: priceTooltip ? 'visible' as const : 'hidden' as const, left:0, top:0, transition:'opacity 0.08s ease'}}>
              {priceTooltip && (<>
                <div className="font-semibold text-slate-100 mb-2 border-b border-slate-700 pb-1.5">{new Date(priceTooltip.date).toLocaleDateString('es-ES',{day:'2-digit', month:'short', year:'numeric'})}</div>
                <div className="space-y-1">
                  <div className="flex justify-between gap-4"><span className="text-slate-400">{labels.pricePrimary}</span><span className="font-mono text-slate-100">{priceTooltip.row._qClose ? fmtMoney(Number(priceTooltip.row._qClose)) : '—'}</span></div>
                  {labels.priceSecondary && <div className="flex justify-between gap-4"><span className="text-slate-400">{labels.priceSecondary}</span><span className="font-mono text-amber-300">{priceTooltip.row._tClose ? fmtMoney(Number(priceTooltip.row._tClose)) : '—'}</span></div>}
                  <div className="flex justify-between gap-4"><span className="text-slate-400">CAPE</span><span className="font-mono text-pink-300">{priceTooltip.row._cape ? fmtNum(Number(priceTooltip.row._cape)) : '—'} {priceTooltip.row._mean ? <span className="text-violet-300">/ Mean {fmtNum(Number(priceTooltip.row._mean))}</span> : null}</span></div>
                  {priceTooltip.row._ratio && <div className="flex justify-between gap-4"><span className="text-slate-400">Ratio</span><span className="font-mono text-slate-200">{Number(priceTooltip.row._ratio).toFixed(2)}×</span></div>}
                  {(() => {
                    const t = Number(priceTooltip.row.tqqqPct ?? 0);
                    const c = Number((priceTooltip.row as any).cashPct ?? priceTooltip.row.cashPct ?? 0);
                    const q = Number((priceTooltip.row as any).qqqPct ?? (1 - t - (isFinite(c) ? c : 0)));
                    return (<>
                      <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full" style={{background: allocColors.tqqq}}/>{labels.primary}</span><span className="font-mono text-teal-300">{fmtPct(t)}</span></div>
                      {labels.secondary && <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full" style={{background: allocColors.qqq}}/>{labels.secondary}</span><span className="font-mono text-violet-300">{fmtPct(Math.max(0, isFinite(q)?q:0))}</span></div>}
                      <div className="flex justify-between gap-4"><span className="flex items-center gap-2 text-slate-400"><span className="w-2 h-2 rounded-full" style={{background: allocColors.cash}}/>{labels.cash}</span><span className="font-mono text-amber-300">{fmtPct(Math.max(0, isFinite(c)?c:0))}</span></div>
                    </>);
                  })()}
                </div>
              </>)}
              </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-400"><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-200"/>{labels.pricePrimary}</span>{labels.priceSecondary && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400"/>{labels.priceSecondary}</span>}<span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-pink-400"/>CAPE×10</span><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-400 border border-dashed"/>Mean</span><span className="ml-auto">CAPE multiplicado ×10 para comparar con {labels.pricePrimary}</span></div>
        </div>
      </div>

      {/* Table */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-4">
        <h4 className="text-sm font-bold text-white flex items-center gap-2"><Calendar size={16} className="text-violet-400"/> Detalle mensual — {selectedCode} · {monthlyRows.length} filas</h4>
        <div className="overflow-x-auto overflow-y-auto max-h-[560px] border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0 z-10">
              <tr>
                <th className="p-2 whitespace-nowrap">Mes</th>
                <th className="p-2 text-right">Cartera</th>
                <th className="p-2 text-right">% {labels.primary}</th>
                {labels.secondary ? <th className="p-2 text-right">% {labels.secondary}</th> : null}
                <th className="p-2 text-right">% {labels.cash}</th>
                <th className="p-2 text-right">Target</th>
                <th className="p-2 text-right">{labels.pricePrimary} $</th>
                {labels.priceSecondary ? <th className="p-2 text-right">{labels.priceSecondary} $</th> : null}
                <th className="p-2 text-right">CAPE</th>
                <th className="p-2 text-right">MaxHist</th>
                <th className="p-2 text-right">Mean</th>
                <th className="p-2 text-right">Ratio</th>
                <th className="p-2">Régimen / Señal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-mono">
              {monthlyRows.slice().reverse().map(r=>{
                const ind=r._ind||{};
                const regime = ind.regime || (r.tqqqPct>0.6?'alta': r.tqqqPct>0.2?'media':'baja');
                return (
                <tr key={r._d} className="hover:bg-slate-900/40">
                  <td className="p-2 text-slate-200 font-semibold whitespace-nowrap">{r._d.substring(0,7)}</td>
                  <td className="p-2 text-right text-white font-semibold">{fmtMoney(r.portfolioValue)}</td>
                  <td className="p-2 text-right"><span className="inline-flex items-center gap-2 justify-end"><span className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden hidden md:inline-block"><span className="h-full bg-teal-500 block" style={{width:`${r.tqqqPct*100}%`}}/></span><span className="text-slate-100">{fmtPct(r.tqqqPct)}</span></span></td>
                  {labels.secondary ? <td className="p-2 text-right text-violet-300">{fmtPct(((r as any).qqqPct ?? (1 - r.tqqqPct - (r.cashPct ?? 0))))}</td> : null}
                  <td className="p-2 text-right text-slate-400">{fmtPct(r.cashPct ?? 0)}</td>
                  <td className="p-2 text-right text-teal-400">{r.targetPct!=null?fmtPct(r.targetPct):'—'}</td>
                  <td className="p-2 text-right text-slate-200">{r._qClose ? fmtMoney(Number(r._qClose)) : '—'}</td>
                  {labels.priceSecondary ? <td className="p-2 text-right text-amber-300">{r._tClose ? fmtMoney(Number(r._tClose)) : '—'}</td> : null}
                  <td className="p-2 text-right text-pink-300">{r._cape ? fmtNum(Number(r._cape)) : '—'}</td>
                  <td className="p-2 text-right text-orange-300">{(r as any)._maxHist ?? r._ind?.max_hist ? fmtNum(Number((r as any)._maxHist ?? r._ind.max_hist)) : '—'}</td>
                  <td className="p-2 text-right text-violet-300">{r._mean ? fmtNum(Number(r._mean)) : '—'}</td>
                  <td className="p-2 text-right text-slate-300">{r._ratio ? Number(r._ratio).toFixed(2) : '—'}</td>
                  <td className="p-2 text-[10px] leading-3 text-slate-400">
                    <div className="flex gap-1 flex-wrap items-center">
                      <span className={`px-1 py-0.5 rounded border text-[10px] ${String(regime).includes('accum')||r.tqqqPct>0.5 ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{ind.bull_trend ? 'bull' : ind.regime || regime}</span>
                      {(() => {
                        const ratio = ind.cape_ratio ?? r._ratio ?? null;
                        const cape = ind.cape ?? r._cape ?? null;
                        if(cape==null && ratio==null) return null;
                        return <span className={`text-xs font-bold ${capeRatioColor(ratio as any)}`}>CAPE {cape!=null?Number(cape).toFixed(1):'—'} ×{ratio!=null?Number(ratio).toFixed(2):'—'}</span>;
                      })()}
                      {ind.dist_pct!=null && <span>dist {ind.dist_pct}%</span>}
                      {ind.dd_qqq_pct!=null && <span>ddQ {ind.dd_qqq_pct}%</span>}
                      {ind.death_cross && <span className="text-rose-400">death</span>}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">% {labels.primary} = valor {labels.primary} / cartera{labels.secondary ? ` · ${labels.secondary}/${labels.cash} según estrategia` : ` · ${labels.cash}`} · {labels.priceSecondary ? `${labels.pricePrimary}/${labels.priceSecondary}` : labels.pricePrimary} close del último día del mes (BtMarketData) · CAPE mensual forward-fill (Yale+multpl) · Ratio=CAPE/Mean · Régimen: accumulation/distribution/hold</p>
      </div>
    </div>
  );
}
