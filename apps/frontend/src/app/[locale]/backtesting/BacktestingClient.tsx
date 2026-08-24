'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { StrategySelector } from '@/components/backtesting/StrategySelector';
const EquityChart = dynamic(() => import('@/components/backtesting/EquityChart').then(m => ({ default: m.EquityChart })), { loading: () => <div className="h-[300px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const MetricsTable = dynamic(() => import('@/components/backtesting/MetricsTable').then(m => ({ default: m.MetricsTable })), { loading: () => <div className="h-[120px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const PerformanceTable = dynamic(() => import('@/components/backtesting/PerformanceTable').then(m => ({ default: m.PerformanceTable })), { loading: () => <div className="h-[200px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const MallikDetails = dynamic(() => import('@/components/backtesting/MallikDetails').then(m => ({ default: m.MallikDetails })), { loading: () => <div className="h-[200px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const QQQStrategyChart = dynamic(() => import('@/components/backtesting/QQQStrategyChart').then(m => ({ default: m.QQQStrategyChart })), { loading: () => <div className="h-[300px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const StrategyExplorer = dynamic(() => import('@/components/backtesting/StrategyExplorer').then(m => ({ default: m.StrategyExplorer })), { loading: () => <div className="h-[400px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const IndicatorsPanel = dynamic(() => import('@/components/backtesting/IndicatorsPanel').then(m => ({ default: m.IndicatorsPanel })), { loading: () => <div className="h-[400px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const CalculatorPanel = dynamic(() => import('@/components/backtesting/CalculatorPanel').then(m => ({ default: m.CalculatorPanel })), { loading: () => <div className="h-[400px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });
const RegimesPanel = dynamic(() => import('@/components/backtesting/RegimesPanel').then(m => ({ default: m.RegimesPanel })), { loading: () => <div className="h-[300px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />, ssr: false });

function StartDateSelector({ dates, selected, onChange }: { dates: any[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="font-semibold mb-2 text-slate-100">Fecha de Inicio</h3>
      <select value={selected} onChange={e=>onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
        {dates.map(d=>{
          const ds=d.startDate?.slice(0,10) || d.startDate;
          return <option key={d.id} value={ds}>{ds} — {d.label} {d.descriptor?`· ${d.descriptor}`:''} [{d.category}]</option>
        })}
      </select>
      <p className="text-xs text-slate-500 mt-2">{dates.length} fechas en catálogo (2010-2026 + eventos). Cambia para agrupar runs por estrategia (l).</p>
    </div>
  );
}

function GroupedMetricsTable({ grouped, selectedStartDate, selected, onRunAndSeed }: { grouped: any[]; selectedStartDate: string; selected: string[]; onRunAndSeed: (code:string)=>void }) {
  const fmtPct=(v:any)=> v==null? 'NA' : `${(v*100).toFixed(2)}%`;
  const fmtMoney=(v:any)=> v==null? 'NA' : `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [seeding,setSeeding]=useState<string|null>(null);
  const [sortKey,setSortKey]=useState<'strategy'|'cagr'|'totalReturn'|'sharpe'|'maxDrawdown'|'ordenesTot'|'ordenesAnio'|'finalValue'>('finalValue');
  const [sortDir,setSortDir]=useState<'asc'|'desc'>('desc');
  const handle=(code:string)=>{
    setSeeding(code);
    onRunAndSeed(code);
    setTimeout(()=>setSeeding(null), 5000);
  };
  const toggle=(k: typeof sortKey)=>{
    if(sortKey===k) setSortDir(d=> d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir(k==='strategy'?'asc':'desc'); }
  };
  const Arrow=({active,dir}:{active:boolean,dir:'asc'|'desc'})=> <span className={`ml-1 text-[10px] ${active?'text-teal-400':'text-slate-600'}`}>{active ? (dir==='asc'?'▲':'▼') : '↕'}</span>;
  const thClass='p-2 font-medium cursor-pointer select-none hover:text-slate-200 transition-colors';
  const filtered = grouped.filter((g:any)=> selected.includes(g.strategy.code));
  const baseDisplay = filtered.length ? filtered : grouped.filter((g:any)=> selected.includes(g.strategy.code));
  const getVal=(g:any)=>{
    const m=g.run?.metrics;
    if(!m) return null;
    const tradesCount = (g.run as any)?.tradesCount ?? m.numTrades ?? 0;
    const days = g.run?.startDate && g.run?.endDate ? Math.max(1, Math.round((new Date(g.run.endDate).getTime() - new Date(g.run.startDate).getTime())/86400000)) : 0;
    const years = days/365.25;
    switch(sortKey){
      case 'strategy': return g.strategy.code;
      case 'cagr': return m.cagr;
      case 'totalReturn': return m.totalReturn;
      case 'sharpe': return m.sharpe;
      case 'maxDrawdown': return m.maxDrawdown;
      case 'ordenesTot': return tradesCount;
      case 'ordenesAnio': return years>0 ? tradesCount/years : 0;
      case 'finalValue': return m.finalValue;
      default: return null;
    }
  };
  const display=[...baseDisplay].sort((a:any,b:any)=>{
    const av=getVal(a); const bv=getVal(b);
    const aNa=av==null; const bNa=bv==null;
    if(aNa && bNa) return 0;
    if(aNa) return 1;
    if(bNa) return -1;
    if(sortKey==='strategy'){
      const cmp=String(av).localeCompare(String(bv));
      return sortDir==='asc'? cmp : -cmp;
    }
    const diff=(av as number)-(bv as number);
    return sortDir==='asc'? diff : -diff;
  });
  // reset to Final desc when agrupación cambia (nuevos datos)
  useEffect(()=>{ setSortKey('finalValue'); setSortDir('desc'); }, [selectedStartDate, grouped.length]);
  return (
    <div className="overflow-auto bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="font-semibold mb-3 text-slate-100">Comparativa Métricas — {selectedStartDate} · {selected.length} estrategias seleccionadas</h3>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-800 text-slate-400">
          <th className={`${thClass} text-left`} onClick={()=>toggle('strategy')}>Estrategia<Arrow active={sortKey==='strategy'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('cagr')}>CAGR<Arrow active={sortKey==='cagr'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('totalReturn')}>TotRet<Arrow active={sortKey==='totalReturn'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('sharpe')}>Sharpe<Arrow active={sortKey==='sharpe'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('maxDrawdown')}>MaxDD<Arrow active={sortKey==='maxDrawdown'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('ordenesTot')}>Ordenes<Arrow active={sortKey==='ordenesTot'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('ordenesAnio')}>Ordenes/Año<Arrow active={sortKey==='ordenesAnio'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('finalValue')}>Final<Arrow active={sortKey==='finalValue'} dir={sortDir}/></th>
          <th className="p-2 text-right">Acción</th>
        </tr></thead>
        <tbody>
          {display.map((g:any)=>{
            const m=g.run?.metrics;
            const na=!g.run;
            const unable=!g.isAvailable;
            return (
              <tr key={g.strategy.code} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                <td className="p-2 font-medium text-slate-100">{g.strategy.code} <span className="text-xs text-slate-500">{g.strategy.name}</span><br/><span className="text-xs text-slate-600">inception {g.inception}</span></td>
                <td className="p-2 text-right text-slate-200">{na? 'NA' : fmtPct(m?.cagr)}</td>
                <td className="p-2 text-right text-slate-200">{na? 'NA' : fmtPct(m?.totalReturn)}</td>
                <td className="p-2 text-right text-slate-200">{na? 'NA' : (m?.sharpe?.toFixed(2) ?? 'NA')}</td>
                <td className="p-2 text-right text-slate-200">{na? 'NA' : fmtPct(m?.maxDrawdown)}</td>
                <td className="p-2 text-right font-mono text-emerald-300">{na? 'NA' : ((g.run as any)?.tradesCount ?? m?.numTrades ?? 'NA')}</td>
                <td className="p-2 text-right font-mono text-emerald-300">{na? 'NA' : (()=>{ const c=(g.run as any)?.tradesCount ?? m?.numTrades ?? 0; const days=g.run?.startDate && g.run?.endDate ? Math.max(1, Math.round((new Date(g.run.endDate).getTime()-new Date(g.run.startDate).getTime())/86400000)) : 0; const y=days/365.25; return y>0 ? (c/y).toFixed(2) : '—'; })()}</td>
                <td className="p-2 text-right font-mono text-slate-100">{na? 'NA' : fmtMoney(m?.finalValue)}</td>
                <td className="p-2 text-right">
                  {unable ? <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs">Action not yet available</span>
                   : na ? <button onClick={()=>handle(g.strategy.code)} disabled={!!seeding} className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs disabled:opacity-50">{seeding===g.strategy.code?'Seeding...':'Run & Seed'}</button>
                   : <span className="text-xs text-teal-400">✓ {fmtMoney(m?.finalValue)}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">Mostrando {display.length} de {grouped.length} estrategias para {selectedStartDate} — click en cabecera para ordenar (default Final ▼).</p>
    </div>
  );
}

function SingleStrategyHistoryTable({ strategies, startDates, onCodeChange, externalCode }: { strategies: any[]; startDates: any[]; onCodeChange?: (code:string)=>void; externalCode?: string }) {
  const [selectedCode, setSelectedCode] = useState<string>(externalCode || strategies[0]?.code || 'SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH');
  useEffect(()=>{ if(externalCode && externalCode!==selectedCode) setSelectedCode(externalCode); }, [externalCode]);
  useEffect(()=>{ if(onCodeChange) onCodeChange(selectedCode); }, [selectedCode]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<'startDate'|'cagr'|'totalReturn'|'sharpe'|'maxDrawdown'|'numTrades'|'finalValue'|'days'|'cape'|'capeRatio'|'tqqqPrice'|'ordenesTot'|'ordenesAnio'>('finalValue');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [capeMap, setCapeMap] = useState<Map<string, any>>(new Map());
  const [tqqqMap, setTqqqMap] = useState<Map<string, number>>(new Map());
  const [latest, setLatest] = useState<{ cape: number|null; ratio: number|null; tqqq: number|null; tqqqDate: string|null }>({ cape:null, ratio:null, tqqq:null, tqqqDate:null });
  const [maxInfo, setMaxInfo] = useState<{ price:number; date:string; pct:number|null }|null>(null);
  useEffect(()=>{ if(strategies.length && !strategies.find(s=>s.code===selectedCode)) setSelectedCode(strategies[0].code); }, [strategies]);
  useEffect(()=>{
    const load=async()=>{
      if(!selectedCode) return;
      setLoading(true);
      try{
        const base=getApiBase();
        const r=await fetch(`${base}/api/backtesting/runs?strategyCode=${selectedCode}`,{cache:'no-store'});
        if(r.ok){ const j=await r.json(); setRuns(j); }
      }catch{} finally{ setLoading(false); }
    };
    load();
  }, [selectedCode]);
  useEffect(()=>{
    const loadMaps=async()=>{
      try{
        const base=getApiBase();
        const [cr, tr]=await Promise.all([
          fetch(`${base}/api/backtesting/shiller-daily?from=2010-02-11`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/market-data?ticker=TQQQ&from=2010-02-11`,{cache:'no-store'})
        ]);
        if(cr.ok){
          const j=await cr.json();
          const m=new Map<string,any>();
          for(const row of j) m.set((row.date||'').slice(0,10), row);
          setCapeMap(m);
          if(j.length){
            const last=j[j.length-1];
            setLatest(prev=>({ ...prev, cape: last.cape, ratio: last.capeRatio }));
          }
        }
        if(tr.ok){
          const j=await tr.json();
          const m=new Map<string,number>();
          let maxP=-Infinity, maxD:string|null=null;
          for(const row of j){
            const d=(row.date||'').slice(0,10);
            const c=Number(row.close);
            m.set(d,c);
            if(c>maxP){ maxP=c; maxD=d; }
          }
          setTqqqMap(m);
          if(j.length){
            const last=j[j.length-1];
            const lc=Number(last.close);
            const ld=(last.date||'').slice(0,10);
            setLatest(prev=>({ ...prev, tqqq: lc, tqqqDate: ld }));
            if(maxP>-Infinity && maxD) setMaxInfo({ price:maxP, date:maxD, pct: lc? (lc/maxP-1)*100 : null });
          }
        }
      }catch{}
    };
    loadMaps();
  }, []);
  const startMap = useMemo(()=>{
    const m=new Map<string,any>();
    for(const sd of startDates){ const k=(sd.startDate||'').slice(0,10); m.set(k, sd); }
    return m;
  }, [startDates]);
  const fmtPct=(v:any)=> v==null? '—' : `${(v*100).toFixed(2)}%`;
  const fmtMoney=(v:any)=> v==null? '—' : `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const daysFor=(run:any)=>{
    const s=new Date(run.startDate); const e=new Date(run.endDate);
    return Math.max(0, Math.round((e.getTime()-s.getTime())/86400000));
  };
  const toggle=(k: typeof sortKey)=>{ if(sortKey===k) setSortDir(d=> d==='asc'?'desc':'asc'); else { setSortKey(k); setSortDir(k==='startDate'?'asc':'desc'); } };
  const Arrow=({active,dir}:{active:boolean,dir:'asc'|'desc'})=> <span className={`ml-1 text-[10px] ${active?'text-teal-400':'text-slate-600'}`}>{active ? (dir==='asc'?'▲':'▼') : '↕'}</span>;
  const thClass='p-2 font-medium cursor-pointer select-none hover:text-slate-200 transition-colors';
  const sorted=[...runs].sort((a:any,b:any)=>{
    const get=(r:any)=>{
      const m=r.metrics;
      const ds=(r.startDate||'').slice(0,10);
      const days=daysFor(r);
      const years=days/365.25;
      switch(sortKey){
        case 'startDate': return r.startDate;
        case 'cagr': return m?.cagr ?? -Infinity;
        case 'totalReturn': return m?.totalReturn ?? -Infinity;
        case 'sharpe': return m?.sharpe ?? -Infinity;
        case 'maxDrawdown': return m?.maxDrawdown ?? Infinity;
        case 'numTrades': return m?.numTrades ?? -Infinity;
        case 'finalValue': return m?.finalValue ?? -Infinity;
        case 'days': return days;
        case 'cape': return capeMap.get(ds)?.cape ?? -Infinity;
        case 'capeRatio': return capeMap.get(ds)?.capeRatio ?? -Infinity;
        case 'tqqqPrice': return tqqqMap.get(ds) ?? -Infinity;
        case 'ordenesTot': return (r as any).tradesCount ?? 0;
        case 'ordenesAnio': return years>0 ? ((r as any).tradesCount ?? 0)/years : -Infinity;
        default: return 0;
      }
    };
    const av=get(a); const bv=get(b);
    if(sortKey==='startDate'){ const cmp=String(av).localeCompare(String(bv)); return sortDir==='asc'? cmp : -cmp; }
    const diff=(av as number)-(bv as number);
    return sortDir==='asc'? diff : -diff;
  });
  useEffect(()=>{ setSortKey('finalValue'); setSortDir('desc'); }, [selectedCode]);
  const stratName = strategies.find(s=>s.code===selectedCode)?.name || selectedCode;
  return (
    <div className="overflow-auto bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold text-slate-100">Histórico por Estrategia — {stratName} <span className="text-xs font-normal text-slate-500">({runs.length} runs)</span></h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Estrategia:</label>
          <select value={selectedCode} onChange={e=>setSelectedCode(e.target.value)} className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs min-w-[220px]">
            {strategies.map((s:any)=><option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-slate-400">Actual <span className="text-slate-500">(más reciente)</span>:</span>
        <span className="font-mono font-semibold text-emerald-400">CAPE {latest.cape!=null? latest.cape.toFixed(2):'—'}</span>
        <span className="font-mono font-semibold text-emerald-400">Ratio {latest.ratio!=null? latest.ratio.toFixed(3):'—'}</span>
        <span className="font-mono font-semibold text-emerald-400">TQQQ {latest.tqqq!=null? `$${latest.tqqq.toFixed(2)}`:'—'} <span className="text-slate-500 font-normal">{latest.tqqqDate||''}</span></span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">Máximo histórico: <span className="text-slate-200 font-mono">{maxInfo? `$${maxInfo.price.toFixed(2)} @ ${maxInfo.date}`:'—'}</span></span>
        <span className={`font-mono font-semibold ${maxInfo?.pct!=null && maxInfo.pct<0? 'text-amber-400':'text-emerald-400'}`}>{maxInfo?.pct!=null? `${maxInfo.pct>=0?'+':''}${maxInfo.pct.toFixed(2)}% desde máximo`:'—'}</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Compara el mismo algoritmo en diferentes fechas de inicio. Ordena por cabecera (default Final ▼). Días = endDate - startDate.</p>
      {loading? <div className="text-xs text-slate-500 py-6 text-center">Cargando runs...</div> :
      runs.length===0? <div className="text-xs text-slate-500 py-6 text-center">Sin runs para {selectedCode}</div> :
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-800 text-slate-400">
          <th className={`${thClass} text-left`} onClick={()=>toggle('startDate')}>Inicio<Arrow active={sortKey==='startDate'} dir={sortDir}/></th>
          <th className="p-2 text-left">Evento</th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('cape')}>CAPE<Arrow active={sortKey==='cape'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('capeRatio')}>Ratio<Arrow active={sortKey==='capeRatio'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('tqqqPrice')}>TQQQ Inicio<Arrow active={sortKey==='tqqqPrice'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('days')}>Días<Arrow active={sortKey==='days'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('cagr')}>CAGR<Arrow active={sortKey==='cagr'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('totalReturn')}>TotRet<Arrow active={sortKey==='totalReturn'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('sharpe')}>Sharpe<Arrow active={sortKey==='sharpe'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('maxDrawdown')}>MaxDD<Arrow active={sortKey==='maxDrawdown'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('numTrades')}>Trades<Arrow active={sortKey==='numTrades'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('finalValue')}>Final<Arrow active={sortKey==='finalValue'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('ordenesTot')}>OrdenesTot<Arrow active={sortKey==='ordenesTot'} dir={sortDir}/></th>
          <th className={`${thClass} text-right`} onClick={()=>toggle('ordenesAnio')}>Ordenes/Año<Arrow active={sortKey==='ordenesAnio'} dir={sortDir}/></th>
        </tr></thead>
        <tbody>
          {sorted.map((r:any)=>{
            const m=r.metrics;
            const sd=startMap.get((r.startDate||'').slice(0,10));
            const ds=(r.startDate||'').slice(0,10);
            const days=daysFor(r);
            const years=days/365.25;
            const ordenesTot=(r as any).tradesCount ?? 0;
            const ordenesAnio=years>0? ordenesTot/years : 0;
            const capeRow=capeMap.get(ds);
            const tqqqPrice=tqqqMap.get(ds);
            return (
              <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                <td className="p-2 font-mono text-slate-100">{ds}</td>
                <td className="p-2 text-slate-300 max-w-[260px]">
                  <div className="font-medium text-slate-200 truncate">{sd?.label || '—'}</div>
                  <div className="text-xs text-slate-500 truncate">{sd?.descriptor || ''} {sd?.category? `· [${sd.category}]`:''}</div>
                </td>
                <td className="p-2 text-right font-mono text-slate-200">{capeRow?.cape!=null? capeRow.cape.toFixed(2):'—'}</td>
                <td className="p-2 text-right font-mono text-slate-200">{capeRow?.capeRatio!=null? capeRow.capeRatio.toFixed(3):'—'}</td>
                <td className="p-2 text-right font-mono text-slate-200">{tqqqPrice!=null? `$${tqqqPrice.toFixed(2)}`:'—'}</td>
                <td className="p-2 text-right text-slate-200">{days}</td>
                <td className="p-2 text-right text-slate-200">{fmtPct(m?.cagr)}</td>
                <td className="p-2 text-right text-slate-200">{fmtPct(m?.totalReturn)}</td>
                <td className="p-2 text-right text-slate-200">{m?.sharpe!=null? m.sharpe.toFixed(2):'—'}</td>
                <td className="p-2 text-right text-slate-200">{fmtPct(m?.maxDrawdown)}</td>
                <td className="p-2 text-right text-slate-200">{m?.numTrades ?? '—'}</td>
                <td className="p-2 text-right font-mono text-slate-100">{fmtMoney(m?.finalValue)}</td>
                <td className="p-2 text-right font-mono text-emerald-300">{ordenesTot}</td>
                <td className="p-2 text-right font-mono text-emerald-300">{ordenesTot? ordenesAnio.toFixed(2):'—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>}
    </div>
  );
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

const fallbackMetrics = [
  { strategy: 'BH_QQQ', cagr: 0.1962, total_return: 18.11, sharpe: 1.05, max_drawdown: 0.351, max_dd_length: 493, num_trades: 1, win_rate: 0, sqn: 0, final_value: 1911247 },
  { strategy: 'BH_TQQQ', cagr: 0.2993, total_return: 73.55, sharpe: 0.72, max_drawdown: 0.817, max_dd_length: 762, num_trades: 1, win_rate: 0, sqn: 0, final_value: 7455772 },
  { strategy: 'SCHILLER_TQQQ_3A_RISK_D_V8', cagr: 0.429, total_return: 397.98, sharpe: 0.94, max_drawdown: 0.676, max_dd_length: 555, num_trades: 12, win_rate: 0.5, sqn: 1.2, final_value: 39898921 },
  { strategy: 'SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH', cagr: 0.4498, total_return: 458.44, sharpe: 0.94, max_drawdown: 0.676, max_dd_length: 555, num_trades: 13, win_rate: 0.5, sqn: 1.3, final_value: 45944012 },
];
const genFallback = (start: string, inc: number) => {
  const base = new Date(start);
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return { date: d.toISOString().split('T')[0], value: 100000 + i * inc };
  });
};
const fallbackEquity = {
  BH_QQQ: genFallback('2026-07-10', 6000),
  BH_TQQQ: genFallback('2026-07-10', 12000),
  SCHILLER_TQQQ_3A_RISK_D_V8: genFallback('2026-07-10', 15000),
  SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH: genFallback('2026-07-10', 16000),
};

export function BacktestingClient({ initialStrategies, initialRuns }: { initialStrategies: any[]; initialRuns: any }) {
  const t = useTranslations('Backtesting');
  const [activeTab, setActiveTab] = useState<'estrategias' | 'indicadores' | 'calculadora' | 'regimes'>('estrategias');
  const [selected, setSelected] = useState<string[]>(['BH_QQQ', 'BH_TQQQ', 'SCHILLER_TQQQ_3A_RISK_D_V8', 'SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH']);
  const [historicoCode, setHistoricoCode] = useState<string>('SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH');
  const [metrics, setMetrics] = useState<any[]>(fallbackMetrics);
  const [equity, setEquity] = useState<Record<string, { date: string; value: number }[]>>(fallbackEquity);
  const [loading, setLoading] = useState(false);
  const [mallikRunIdState, setMallikRunIdState] = useState<string | null>(null);
  const [detailsCode, setDetailsCode] = useState<string | null>(null);
  const [explorerRunId, setExplorerRunId] = useState<string | null>(null);
  const [explorerRun, setExplorerRun] = useState<any | null>(null);
  const [startDates, setStartDates] = useState<any[]>([]);
  const [selectedStartDate, setSelectedStartDate] = useState<string>('2010-02-11');
  const [grouped, setGrouped] = useState<any[]>([]);
  const [marketQQQ, setMarketQQQ] = useState<any[]>([]);
  const [marketTQQQ, setMarketTQQQ] = useState<any[]>([]);
  const [marketNasdaq, setMarketNasdaq] = useState<any[]>([]);
  const [marketSP500, setMarketSP500] = useState<any[]>([]);
  const [capeData, setCapeData] = useState<any[]>([]);

  useEffect(() => {
    // Load start dates catalog
    (async()=>{
      try{
        const base=getApiBase();
        const r=await fetch(`${base}/api/backtesting/start-dates`,{cache:'no-store'});
        if(r.ok){ const d=await r.json(); setStartDates(d); if(d.length && !d.find((x:any)=> (x.startDate||'').slice(0,10)===selectedStartDate)) setSelectedStartDate((d[0].startDate||'').slice(0,10)); }
      }catch{}
    })();
  }, []);
  useEffect(()=>{
    const loadGrouped=async()=>{
      try{
        const base=getApiBase();
        const r=await fetch(`${base}/api/backtesting/runs/grouped?startDate=${selectedStartDate}`,{cache:'no-store'});
        if(r.ok) setGrouped(await r.json());
      }catch{}
    };
    if(selectedStartDate) loadGrouped();
  }, [selectedStartDate]);
  // d) + e) cargar QQQ/TQQQ/NASDAQ/SP500 y CAPE para el tooltip
  useEffect(()=>{
    const loadMarkets=async()=>{
      try{
        const base=getApiBase();
        const to=new Date().toISOString().slice(0,10);
        const fetchTicker=async(ticker:string)=>{
          const r=await fetch(`${base}/api/backtesting/market-data?ticker=${ticker}&from=${selectedStartDate}&to=${to}`,{cache:'no-store'});
          if(!r.ok) return [];
          const j=await r.json();
          return j.map((x:any)=>({ date: (x.date||'').slice(0,10), close: Number(x.close) }));
        };
        const [qqq,tqqq,ndq,spx]=await Promise.all([fetchTicker('QQQ'), fetchTicker('TQQQ'), fetchTicker('^IXIC'), fetchTicker('^GSPC')]);
        setMarketQQQ(qqq); setMarketTQQQ(tqqq);
        setMarketNasdaq(ndq.length? ndq : []);
        setMarketSP500(spx.length? spx : []);
      }catch{}
    };
    if(selectedStartDate) loadMarkets();
  }, [selectedStartDate]);
  useEffect(()=>{
    const loadCape=async()=>{
      try{
        const base=getApiBase();
        const to=new Date().toISOString().slice(0,10);
        const r=await fetch(`${base}/api/backtesting/shiller-daily?from=${selectedStartDate}&to=${to}`,{cache:'no-store'});
        if(!r.ok){ setCapeData([]); return; }
        const j=await r.json();
        const mapped=j.map((x:any)=>({ date: (x.date||'').slice(0,10), cape: x.cape ?? null, capeRatio: x.capeRatio ?? null })).filter((x:any)=> x.cape!=null);
        setCapeData(mapped);
      }catch{ setCapeData([]); }
    };
    if(selectedStartDate) loadCape();
  }, [selectedStartDate]);

  const handleRunAndSeed=async(code:string)=>{
    try{
      const base=getApiBase();
      const res=await fetch(`${base}/api/backtesting/runs/run-and-seed`,{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({strategyCode:code, startDate:selectedStartDate})});
      if(!res.ok){ const t=await res.text(); alert(`Run failed: ${t.slice(0,300)}`); return; }
      // reload grouped after seed
      const g=await fetch(`${base}/api/backtesting/runs/grouped?startDate=${selectedStartDate}`,{cache:'no-store'});
      if(g.ok) setGrouped(await g.json());
    }catch(e:any){ alert(`Error: ${e.message}`); }
  };

  useEffect(() => {
    const initMetrics = (runs: any[]) => {
      // Deduplicate by strategy code keeping the latest run per strategy for the selected startDate (l)
      const dedup = new Map<string, any>();
      for (const r of runs) {
        const code = r.strategy?.code || r.strategyCode || 'UNKNOWN';
        // Keep first occurrence per code (runs are ordered by startDate desc)
        if (!dedup.has(code)) dedup.set(code, r);
      }
      const mapped = Array.from(dedup.values()).map((r: any) => ({
        strategy: r.strategy?.code || r.strategyCode || 'UNKNOWN',
        cagr: r.metrics?.cagr ?? 0,
        total_return: r.metrics?.totalReturn ?? 0,
        sharpe: r.metrics?.sharpe ?? 0,
        max_drawdown: r.metrics?.maxDrawdown ?? 0,
        max_dd_length: r.metrics?.maxDdLength ?? 0,
        num_trades: r.metrics?.numTrades ?? 0,
        win_rate: r.metrics?.winRate ?? 0,
        sqn: r.metrics?.sqn ?? 0,
        final_value: r.metrics?.finalValue ?? 0,
      }));
      if (mapped.length) setMetrics(mapped);
    };
    const loadEquity = async (runs: any[]) => {
      try {
        const base = getApiBase();
        const ids = runs.map((r: any) => r.id).join(',');
        const compRes = await fetch(`${base}/api/backtesting/comparativa?runIds=${ids}`, { cache: 'no-store' });
        if (!compRes.ok) return;
        const comp = await compRes.json();
        const eq: Record<string, any[]> = {};
        for (const run of comp) {
          const code = run.strategy?.code || 'UNKNOWN';
          eq[code] = (run.equityCurve || []).map((p: any) => ({ date: p.date?.split('T')[0] || p.date, value: p.portfolioValue }));
        }
        if (Object.keys(eq).length) setEquity(eq);
      } catch {}
    };
    const setMallikFromRuns = (runs:any[]) => {
      const m = runs.find((r:any)=> (r.strategy?.code||r.strategyCode)==='MALLIK_TQQQ');
      if (m?.id) setMallikRunIdState(m.id);
    };
    if (initialRuns && Array.isArray(initialRuns) && initialRuns.length) {
      // Filtrar por startDate seleccionado para no mezclar runs de diferentes fechas en Equity
      const filteredByDate = initialRuns.filter((r:any)=> !selectedStartDate || (r.startDate||'').slice(0,10)===selectedStartDate);
      const toUse = filteredByDate.length ? filteredByDate : initialRuns;
      initMetrics(toUse);
      // Equity se carga vía handleCompare/grouped para garantizar misma fecha que Comparativa
      setMallikFromRuns(toUse);
    } else {
      (async () => {
        try {
          const base = getApiBase();
          const runsRes = await fetch(`${base}/api/backtesting/runs?startDate=${selectedStartDate}`, { cache: 'no-store' });
          if (!runsRes.ok) return;
          const runs = await runsRes.json();
          if (!runs?.length) return;
          initMetrics(runs);
          setMallikFromRuns(runs);
        } catch {}
      })();
    }
  }, [initialRuns]);

  const handleCompare = async () => {
    if (selected.length === 0) return;
    // Usar grouped (misma fuente que Comparativa Métricas) para garantizar mismos datos en Equity Curves
    const groupedRuns = grouped.filter((g:any)=> selected.includes(g.strategy.code) && g.run).map((g:any)=> g.run);
    if (groupedRuns.length) {
      setLoading(true);
      try {
        const base = getApiBase();
        const ids = groupedRuns.map((r:any)=> r.id).join(',');
        const compRes = await fetch(`${base}/api/backtesting/comparativa?runIds=${ids}`, { cache: 'no-store' });
        if (!compRes.ok) throw new Error('comparativa failed');
        const comp = await compRes.json();
        const eq: Record<string, any[]> = {};
        const mets: any[] = [];
        for (const run of comp) {
          const code = run.strategy?.code || 'UNKNOWN';
          eq[code] = (run.equityCurve || []).map((p: any) => ({ date: p.date?.split('T')[0] || p.date, value: p.portfolioValue }));
          if (run.metrics) mets.push({ strategy: code, cagr: run.metrics.cagr, total_return: run.metrics.totalReturn, sharpe: run.metrics.sharpe, max_drawdown: run.metrics.maxDrawdown, max_dd_length: run.metrics.maxDdLength, num_trades: run.metrics.numTrades, win_rate: run.metrics.winRate, sqn: run.metrics.sqn, final_value: run.metrics.finalValue });
        }
        if (mets.length) setMetrics(mets);
        if (Object.keys(eq).length) setEquity(eq);
      } catch (e) { console.warn('API comparativa no disponible, usando fallback', e); }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const base = getApiBase();
      const runsRes = await fetch(`${base}/api/backtesting/runs?startDate=${selectedStartDate}`, { cache: 'no-store' });
      if (!runsRes.ok) throw new Error('runs fetch failed');
      const runs = await runsRes.json();
      const filtered = runs.filter((r: any) => selected.includes(r.strategy?.code));
      // Deduplicate per strategy (keep latest)
      const dedup = new Map<string, any>();
      for (const r of filtered) { const code=r.strategy?.code; if(!dedup.has(code)) dedup.set(code, r); }
      const deduped = Array.from(dedup.values());
      if (deduped.length === 0) { setLoading(false); return; }
      const ids = deduped.map((r: any) => r.id).join(',');
      const compRes = await fetch(`${base}/api/backtesting/comparativa?runIds=${ids}`, { cache: 'no-store' });
      if (!compRes.ok) throw new Error('comparativa failed');
      const comp = await compRes.json();
      // comp es array de runs con equityCurve
      const eq: Record<string, any[]> = {};
      const mets: any[] = [];
      for (const run of comp) {
        const code = run.strategy?.code || 'UNKNOWN';
        eq[code] = (run.equityCurve || []).map((p: any) => ({ date: p.date?.split('T')[0] || p.date, value: p.portfolioValue }));
        if (run.metrics) mets.push({ strategy: code, cagr: run.metrics.cagr, total_return: run.metrics.totalReturn, sharpe: run.metrics.sharpe, max_drawdown: run.metrics.maxDrawdown, max_dd_length: run.metrics.maxDdLength, num_trades: run.metrics.numTrades, win_rate: run.metrics.winRate, sqn: run.metrics.sqn, final_value: run.metrics.finalValue });
      }
      if (mets.length) setMetrics(mets);
      if (Object.keys(eq).length) setEquity(eq);
    } catch (e) {
      console.warn('API comparativa no disponible, usando fallback', e);
    }
    setLoading(false);
  };

  const filteredMetrics = metrics.filter(m => selected.includes(m.strategy));
  const filteredEquity = Object.fromEntries(Object.entries(equity).filter(([k]) => selected.includes(k)));

  // Auto-actualizar Equity Curves y Performance al cambiar Fecha/Selección (usa grouped para misma fuente que Comparativa)
  useEffect(()=>{ if(grouped.length && selected.length) handleCompare(); }, [grouped, selected.join(',')]);
  // Fallback inicial por si grouped aún no cargó
  useEffect(()=>{ if(selectedStartDate && selected.length && !grouped.length) handleCompare(); }, [selectedStartDate]);
  const mallikRunId = mallikRunIdState || (() => {
    const runs = initialRuns || [];
    const m = runs.find((r:any)=> (r.strategy?.code||r.strategyCode)==='MALLIK_TQQQ');
    return m?.id || null;
  })();
  const allRunsForDetails: any[] = (initialRuns || []).length ? (initialRuns as any[]) : [];
  // Si initialRuns vacío, intentar usar comparativa aún no cargada, fallback a métricas
  const detailsOptions = selected.map(code => {
    const r = allRunsForDetails.find((x:any)=> (x.strategy?.code||x.strategyCode)===code);
    return { code, id: r?.id || null, name: r?.strategy?.name || code };
  }).filter(o=>o.code);
  const activeDetailsCode = detailsCode && selected.includes(detailsCode) ? detailsCode : (detailsOptions.find(o=>o.id)?.code || detailsOptions[0]?.code || null);
  const activeDetailsRunId = (() => {
    if (activeDetailsCode) {
      const opt = detailsOptions.find(o=>o.code===activeDetailsCode);
      if (opt?.id) return opt.id;
    }
    // fallback: buscar en comparativa por id no disponible, dejar null
    return null;
  })();
  // Auto-seleccionar primera estrategia con run al montar o al cambiar selected
  useEffect(()=>{ if(!detailsCode && detailsOptions.length){ const first = detailsOptions.find(o=>o.id)?.code || detailsOptions[0].code; setDetailsCode(first);} else if(detailsCode && !selected.includes(detailsCode)){ const first = detailsOptions.find(o=>o.id)?.code || detailsOptions[0]?.code || null; setDetailsCode(first);} }, [selected.join(','), (initialRuns||[]).length]);
  // l) agrupar por fecha: solo runs de la fecha seleccionada
  const explorerRuns = (initialRuns || []).filter((r:any)=> !selectedStartDate || (r.startDate||'').slice(0,10)===selectedStartDate).map((r:any)=> ({ id: r.id, strategy: r.strategy, metrics: r.metrics, startDate: r.startDate })).filter((r:any)=> r.strategy?.code);
  // fallback: si no hay runs para esa fecha, usar grouped (una por estrategia) para no duplicar
  const explorerRunsFromGrouped = grouped.filter((g:any)=> g.run).map((g:any)=> ({ id: g.run.id, strategy: g.strategy, metrics: g.run.metrics, startDate: g.run.startDate }));
  const explorerRunsFinal = (explorerRuns.length ? explorerRuns : explorerRunsFromGrouped.length ? explorerRunsFromGrouped : metrics.map((m:any)=> ({ id: `mock-${m.strategy}`, strategy:{code:m.strategy, name:m.strategy}, metrics:{ finalValue:m.final_value, cagr:m.cagr, sharpe:m.sharpe, maxDrawdown:m.max_drawdown, maxDdLength:m.max_dd_length}})));

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Backtesting — TQQQ / QQQ</h1>
        <p className="text-sm text-slate-400">Comparativa filtrada por fecha inicio y estrategias seleccionadas. Datos en Postgres <code className="text-teal-400">buyholdtime</code>.</p>
      </div>
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button onClick={()=>setActiveTab('estrategias')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='estrategias' ? 'bg-slate-800 text-teal-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>{t('tabs.estrategias')}</button>
        <button onClick={()=>setActiveTab('indicadores')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='indicadores' ? 'bg-slate-800 text-teal-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>{t('tabs.indicadores')}</button>
        <button onClick={()=>setActiveTab('regimes')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='regimes' ? 'bg-slate-800 text-teal-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>{t('tabs.regimes')}</button>
        <button onClick={()=>setActiveTab('calculadora')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab==='calculadora' ? 'bg-slate-800 text-teal-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>{t('tabs.calculadora')}</button>
      </div>
      {activeTab==='estrategias' && (
        <>
      <div className="space-y-4">
        <div className="w-full">
          <StrategySelector strategies={initialStrategies} selected={selected} onChange={setSelected} />
        </div>
        {startDates.length>0 && (
          <div className="w-full">
            <StartDateSelector dates={startDates} selected={selectedStartDate} onChange={setSelectedStartDate} />
          </div>
        )}
      </div>
      {grouped.length>0 && <GroupedMetricsTable grouped={grouped} selectedStartDate={selectedStartDate} selected={selected} onRunAndSeed={handleRunAndSeed} />}
      <div className="text-xs text-slate-500">{selected.length} estrategias · Fecha {selectedStartDate} • Montos , (en-US) {loading && '· Cargando...'}</div>
      <EquityChart data={filteredEquity} startDate={selectedStartDate} marketQQQ={marketQQQ} marketTQQQ={marketTQQQ} marketNasdaq={marketNasdaq} marketSP500={marketSP500} capeData={capeData} />
      <PerformanceTable equity={filteredEquity} startDate={selectedStartDate} capeData={capeData} />
      <SingleStrategyHistoryTable strategies={initialStrategies} startDates={startDates} externalCode={historicoCode} onCodeChange={setHistoricoCode} />
      <StrategyExplorer strategyCode={historicoCode} startDates={startDates} onSelectedRunChange={(runId, run)=>{ setExplorerRunId(runId); setExplorerRun(run); }} />
      <MallikDetails runId={explorerRunId} strategyCode={historicoCode} strategyName={initialStrategies.find(s=>s.code===historicoCode)?.name || historicoCode} run={explorerRun} startDates={startDates} />
        </>
      )}
      {activeTab==='indicadores' && <Suspense fallback={<div className="h-[400px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />}><IndicatorsPanel /></Suspense>}
      {activeTab==='calculadora' && <Suspense fallback={<div className="h-[400px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />}><CalculatorPanel /></Suspense>}
      {activeTab==='regimes' && <Suspense fallback={<div className="h-[300px] bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />}><RegimesPanel /></Suspense>}
      <div className="text-xs text-slate-500 border-t border-slate-800 pt-3">
        API: GET /api/backtesting/strategies, /market-data?ticker=QQQ, /runs, /runs/:id/equity, /runs/:id/trades, /runs/:id/allocations, /comparativa?runIds=... — Base: {getApiBase()}
      </div>
      </div>
    </div>
  );
}
