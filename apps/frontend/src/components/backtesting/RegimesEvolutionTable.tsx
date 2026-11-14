'use client';
import type React from 'react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { getClosestPrice, getCpiYoY, getRecentPrice, marginGdpRatio } from '@/lib/seriesLookup';
import type { useRegimeEngine } from './useRegimeEngine';

type View = 'daily' | 'monthly' | 'yearly';
type RegimeEngine = ReturnType<typeof useRegimeEngine>;

// Tabla de evolución de regímenes (Daily / Monthly / Yearly) con los mismos indicadores que Backtesting:
// filtro por año, virtualización, scroll infinito y tooltips por celda. La vista la comparte con el
// panel porque también define la ventana de R3 del motor de regímenes.
export function RegimesEvolutionTable({ cape, capeView, setCapeView, equity, marketHistory, getRegimeDetails, getEquityForDate, getBhEquityForDate, getDrawdownForDate, initialEquity }: {
  cape: any[]; capeView: View; setCapeView: (v: View) => void; equity: any[];
  marketHistory: Record<string, Map<string, number>>;
  getRegimeDetails: RegimeEngine['getRegimeDetails'];
  getEquityForDate: (iso: string) => number | null; getBhEquityForDate: (iso: string) => number | null; getDrawdownForDate: (iso: string) => number | null;
  initialEquity: number;
}) {
  const tr = useTranslations('Backtesting.regimesPanel');
  const getMarginGdpRatio = (d: string) => marginGdpRatio(marketHistory['FINRA_DEBIT'], marketHistory['GDP'], d);
  const [visibleCount, setVisibleCount] = useState(15);
  const [filterYear, setFilterYear] = useState<string>('');
  const [sortDir] = useState<'asc'|'desc'>('desc');

  const [tableTip, setTableTip] = useState<null|{x:number,y:number,node:React.ReactNode}>(null);

  // Construir filas según vista — memoizado (evita ordenar 9k filas por render)
  const rowsView = useMemo(()=>{
    if(!cape.length) return [];
    if(capeView==='daily') return cape;
    if(capeView==='monthly'){
      const byMonth=new Map<string,any>();
      for(const r of cape) byMonth.set(String(r.date||'').slice(0,7), r);
      return Array.from(byMonth.values());
    }
    const byYear=new Map<string,any>();
    for(const r of cape) byYear.set(String(r.date||'').slice(0,4), r);
    return Array.from(byYear.values());
  }, [cape, capeView]);
  const availableYears = useMemo(()=>{
    const s=new Set<string>();
    for(const r of cape) s.add(String(r.date).slice(0,4));
    return Array.from(s).sort().reverse();
  }, [cape]);
  const filteredRowsView = useMemo(()=>{
    if(!filterYear) return rowsView;
    return rowsView.filter((r:any)=> String(r.date).slice(0,4)===filterYear);
  }, [rowsView, filterYear]);
  const sorted = useMemo(()=> [...filteredRowsView].sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)), [filteredRowsView, sortDir]);
  const paginated = useMemo(()=> sorted.slice(0, visibleCount), [sorted, visibleCount]);
  // Virtualización para daily con 2-3 años (500-750 filas) — renderiza solo filas visibles
  const scrollRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 6,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length-1].end ?? 0) : 0;
  const observerRef = useRef<HTMLTableRowElement|null>(null) as any;
  const tickingRef = useRef(false);
  useEffect(()=>{
    const el=observerRef.current;
    if(!el) return;
    const io=new IntersectionObserver((entries)=>{
      if(entries[0].isIntersecting && !tickingRef.current){
        tickingRef.current = true;
        requestAnimationFrame(()=>{
          setVisibleCount(c=> Math.min(c+80, rowsView.length));
          tickingRef.current = false;
        });
      }
    },{rootMargin:'800px'});
    io.observe(el);
    return()=> io.disconnect();
  },[rowsView.length, paginated.length]);

  return (
    <>
      {/* Tabla Daily / Monthly / Yearly con mismos indicadores que Backtesting */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">{tr('evoTitle', { view: tr(`view_${capeView}`) })} <span className="text-slate-500 font-normal text-xs">· {tr('rows', { n: sorted.length.toLocaleString('en-US') })}{filterYear?` · ${filterYear}`:''}</span></h3>
          <div className="flex items-center gap-2">
            <select value={filterYear} onChange={e=>{ setFilterYear(e.target.value); if(scrollRef.current) scrollRef.current.scrollTop=0; }} className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-accent-500">
              <option value="">Todos ({rowsView.length.toLocaleString('en-US')})</option>
              {availableYears.map(y=>{ const c=rowsView.filter((r:any)=> String(r.date).slice(0,4)===y).length; return <option key={y} value={y}>{y} · {c.toLocaleString('en-US')} filas</option> })}
            </select>
            <div className="flex gap-1">
              {(['daily','monthly','yearly'] as const).map(v=>(
                <button key={v} onClick={()=>{ setCapeView(v); setFilterYear(''); }} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-accent-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">{tr('evoHint')}</p>
        <div ref={scrollRef} className="overflow-auto max-h-[520px] border border-slate-800 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-slate-400">
                <th className="p-2 text-left sticky left-0 bg-slate-900">{tr('date')}</th>
                <th className="p-2 text-center" title="Múltiplos Altos 4 Fases — F0 Armado: CAPE>1.18 & Core CPI YoY≥4.0 & >SMA12×1.20 (12M YoY %) — G1: Fed>0 o 10Y>1.10 (30%) — G2: (FED>G1 & CPI>1.30 y crec) OR (CPI>4.5 & >CPI_G1 y crec) + hike 3m & SPY<SMA50 (70%) — G3: 3M caídas o Pausa2M (35%) — G4: CPI<1.05 o Fed<0 + SMA50 (65%) — Sanación CPI<1.05+SMA50">📈</th>
                <th className="p-2 text-center" title="Alta Deuda/PIB 4 Fases — Fase 1 Armado: Z>2.0 en 6M (con memoria) — Fase 2 G1: ROC3M<0+SMA50 vende 30% — G2: ROC3M<−σ24M vende 70% — F3 Sanación: >SMA50+ROC>0 — F4 Desarme: Z<0">🏦</th>
                <th className="p-2 text-center" title="Complacencia OAS: HY<P20 OR <3.5% — Independiente — Qué mide: Ceguera al riesgo (bonos) — Gatillo: Salto spreads +50bps — Fórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2) — Ej: 2007 <3% →2008 >11%">😴</th>
                <th className="p-2 text-right text-accent-300">{tr('portStrat')}</th>
                <th className="p-2 text-right text-slate-400">BH</th>
                <th className="p-2 text-right">Δ $</th>
                <th className="p-2 text-right">Δ %</th>
                <th className="p-2 text-right">{tr('perfShort')}</th>
                <th className="p-2 text-right">CAGR</th>
                <th className="p-2 text-right">DD</th>
                <th className="p-2 text-right">SP500</th>
                <th className="p-2 text-right">NASDAQ</th>
                <th className="p-2 text-right">TQQQ</th>
                <th className="p-2 text-right">CAPE</th>
                <th className="p-2 text-right">mean3Y</th>
                <th className="p-2 text-right">Ratio</th>
                <th className="p-2 text-right">HY OAS</th>
                <th className="p-2 text-right" title="BAMLH0A0HYM2EY Effective Yield">HY EY</th>
                <th className="p-2 text-right">Margin/GDP</th>
                <th className="p-2 text-right">Z (Mg/GDP)</th>
                <th className="p-2 text-right">GDP</th>
                <th className="p-2 text-right">FINRA</th>
                <th className="p-2 text-right">Core CPI YoY</th>
                <th className="p-2 text-right">SMA12 YoY</th>
                <th className="p-2 text-right">{tr('thresholdSma')}</th>
                <th className="p-2 text-right">CPI YoY</th>
                <th className="p-2 text-right">FED</th>
                <th className="p-2 text-right">2Y</th>
                <th className="p-2 text-right">10Y</th>
                <th className="p-2 text-right" title="Treasury 30Y — curva larga (FRED DGS30)">30Y</th>
                <th className="p-2 text-right" title="MSACSR — meses inventario casas nuevas">MSACSR</th>
                <th className="p-2 text-right" title="VIX — volatilidad implícita S&P 500">VIX</th>
                <th className="p-2 text-right" title="CNN Fear & Greed 0-100">F&G</th>
              </tr>
            </thead>
            <tbody>
              {paddingTop>0 && (<tr><td colSpan={34} style={{ height: paddingTop }} /></tr>)}
              {virtualItems.map((virtualRow:any)=>{
                const r:any = sorted[virtualRow.index];
                const d=String(r.date||'').slice(0,10);
                const maxDate = sorted.length ? sorted.reduce((m:string, row:any)=> String(row.date||'').slice(0,10) > m ? String(row.date||'').slice(0,10) : m, String(sorted[0].date||'').slice(0,10)) : null;
                const isCurrent = d === maxDate;
                const isLast= false;
                const capeVal=r.cape;
                const mean3yVal=r.mean3y ?? r.mean;
                const ratio=r.capeRatio != null ? r.capeRatio : (mean3yVal!=null ? r.cape / mean3yVal : null);
                const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'],d);
                const mg=getMarginGdpRatio(d);
                const detRow=getRegimeDetails(d, capeVal, mean3yVal);
                const mgZ=detRow.r2.z;
                const mgZColor = mgZ==null ? 'text-slate-500' : mgZ>2.0 ? 'text-risk-400 bg-risk-500/10 border-risk-500/20' : mgZ>1 ? 'text-elevated-400 bg-elevated-500/10 border-elevated-500/20' : mgZ>0.5 ? 'text-caution-400 bg-caution-500/10 border-caution-500/20' : mgZ>-0.5 ? 'text-slate-300 bg-slate-700/30 border-slate-600' : 'text-favorable-400 bg-favorable-500/10 border-favorable-500/20';
                const cpi=getCpiYoY(marketHistory['CPIAUCSL'],d);
                const fed=getClosestPrice(marketHistory['DFEDTARU'],d);
                const y10=getClosestPrice(marketHistory['DGS10'],d);
                const y30=getClosestPrice(marketHistory['DGS30'],d);
                const tqqqR=getClosestPrice(marketHistory['TQQQ'],d);
                const y2=getClosestPrice(marketHistory['DGS2'],d);
                const hyEy=getClosestPrice(marketHistory['BAMLH0A0HYM2EY'],d);
                const gdpR=getRecentPrice(marketHistory['GDP'],d,120);
                const finraR=getRecentPrice(marketHistory['FINRA_DEBIT'],d,45);
                const msacsrR=getRecentPrice(marketHistory['MSACSR'],d,35);
                const vixR=getClosestPrice(marketHistory['VIXCLS'],d);
                const fgR=getClosestPrice(marketHistory['FEAR_GREED'],d);
                const spx=getClosestPrice(marketHistory['^GSPC'],d);
                const nasdaqVal=getClosestPrice(marketHistory['^IXIC'],d);
                const ratioColor = ratio==null ? 'text-slate-500' : ratio < 0.9 ? 'text-favorable-400 bg-favorable-500/10' : ratio < 1.05 ? 'text-green-400 bg-green-500/10' : ratio < 1.18 ? 'text-caution-400 bg-caution-500/10' : ratio < 1.35 ? 'text-elevated-400 bg-elevated-500/10' : 'text-risk-400 bg-risk-500/10';
                const mgColor = mg==null ? 'text-slate-500' : mg>6?'text-risk-400 bg-risk-500/10 border-risk-500/20':mg>4?'text-elevated-400 bg-elevated-500/10 border-elevated-500/20':mg>2?'text-caution-400 bg-caution-500/10 border-caution-500/20':'text-favorable-400 bg-favorable-500/10 border-favorable-500/20';
                const portVal = getEquityForDate(d);
                const bhVal = getBhEquityForDate(d);
                const perf = portVal!=null ? (portVal/initialEquity-1)*100 : null;
                const days = (new Date(d).getTime() - new Date(equity[0]?.date || d).getTime())/86400000;
                const cagrVal = portVal!=null && days>30 ? (Math.pow(portVal/initialEquity, 365.25/days)-1)*100 : null;
                const ddVal = getDrawdownForDate(d);
                const diffVal = (portVal!=null && bhVal!=null) ? portVal - bhVal : null;
                const diffPct = (portVal!=null && bhVal!=null && bhVal!==0) ? (portVal/bhVal-1)*100 : null;
                return (
                  <tr key={r.date} ref={isLast? observerRef : null} className={`${isCurrent ? 'bg-accent-500/[0.08] border-l-2 border-l-accent-500 ring-1 ring-accent-500/15' : 'hover:bg-slate-800/40'} border-t border-slate-800 transition-colors`}>
                    <td className={`p-2 font-mono sticky left-0 text-slate-200 ${isCurrent ? 'bg-slate-900' : 'bg-slate-900'} w-[110px] min-w-[110px]`}><div className="flex flex-col leading-none gap-0.5"><span className={`${isCurrent ? 'text-accent-300 font-bold' : 'text-slate-200'} text-xs`}>{capeView==='yearly'? d.slice(0,4): capeView==='monthly'? d.slice(0,7): d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500 text-white font-bold leading-none w-fit">{tr('current')}</span>}</div></td>
                    {(() => {
                      const det=detRow;
                      const {r1: d1, r2: d2, r3: d3}=det;
                      const icon = (active:boolean, on:string, off:string) => active ? `inline-flex items-center justify-center w-6 h-6 rounded-full ${on} border text-xs` : `inline-flex items-center justify-center w-6 h-6 rounded-full ${off} border text-xs opacity-40`;
                      const fmt=(v:number|null, dec=2)=> v!=null && isFinite(v) ? v.toFixed(dec) : '—';
                      const showTip = (e:React.MouseEvent, node:React.ReactNode) => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip({x: r.left + r.width/2, y: r.top, node}); };
                      const hideTip = ()=> setTableTip(null);
                      // R1 tooltip con valores
                      let t1='';
                      if(d1.cape==null || d1.sma==null) t1=`📈 Múltiplos Altos — Sin datos\nCAPE ${fmt(d1.cape)} · SMA36M ${fmt(d1.sma)}\nFórmula: CAPE > SMA36M×1.18 AND Core CPI YoY≥4.0 & >SMA12×1.20`;
                      else if(d1.active) t1=`📈 MÚLTIPLOS ALTOS ON ✓ — DISPARADO\nCAPE ${fmt(d1.cape)} > umbral ${fmt(d1.thr)} (=SMA ${fmt(d1.sma)}×1.18)\nRatio ${fmt(d1.ratio,3)}×  ·  +${fmt(d1.cape! - d1.thr!)} SOBRE UMBRAL\nPor qué SÍ: CAPE sobrevalorado vs media 36M\nFórmula: CAPE > SMA36M×1.18 AND Core CPI YoY≥4.0 & >SMA12×1.20  ·  Ventana ${capeView} 36M`;
                      else t1=`📈 Múltiplos Altos OFF — no disparado\nCAPE ${fmt(d1.cape)} ≤ umbral ${fmt(d1.thr)} (=SMA ${fmt(d1.sma)}×1.18)\nRatio ${fmt(d1.ratio,3)}×  ·  FALTÓ ${fmt(d1.thr! - d1.cape!)} PARA DISPARO\nPor qué NO: CAPE dentro de media\nFórmula: CAPE > SMA36M×1.18 AND Core CPI YoY≥4.0 & >SMA12×1.20  ·  Ventana ${capeView} 36M`;
                      // R2 tooltip con Z
                      let t2='';
                      if(d2.mg==null) t2=`🏦 Alta Deuda — Sin Margin/GDP\nFórmula: Z=(Margin/GDP−SMA36M)/σ36M>2.0`;
                      else if(d2.mean==null || d2.std==null) t2=`🏦 Alta Deuda — Ventana insuficiente (<12)\nMargin/GDP ${fmt(d2.mg)}%\nFórmula: Z=(Margin/GDP−SMA36M)/σ36M>2.0  ·  Ventana 36M mensual (unificada)`;
                      else if(d2.active) t2=`🏦 ALTA DEUDA ON ✓ — ARMADO (FASE 1)\nZ ACTUAL ${fmt(d2.z,2)} — ARMADO POR Z>2.0 en ${(d2 as any).armedMonth ?? 'ÚLTIMOS 6M'}\nMargin/GDP ${fmt(d2.mg)}% vs SMA36M ${fmt(d2.mean)}% (σ ${fmt(d2.std)})\nZ=(${fmt(d2.mg)}−${fmt(d2.mean)})/${fmt(d2.std)}=${fmt(d2.z,2)} — persiste aunque Z baje hasta Z<0 (Fase 4)\nPor qué SÍ: PELIGRO SISTÉMICO — DETIENE COMPRAS · Fase 2: ROC3M<0+SMA50 (30%) / ROC<−σ24M (70%)\nFórmula: Z>2.0 en 6M con memoria`;
                      else t2=`🏦 Alta Deuda OFF — no armado\nZ ACTUAL ${fmt(d2.z,2)} ≤ 2.0 y ningún Z>2.0 en ÚLTIMOS 6M\nMargin/GDP ${fmt(d2.mg)}% vs SMA36M ${fmt(d2.mean)}% (σ ${fmt(d2.std)})\nZ=(${fmt(d2.mg)}−${fmt(d2.mean)})/${fmt(d2.std)}=${fmt(d2.z,2)}  ·  FALTÓ ${fmt(2.0 - (d2.z ?? 0),2)}σ en 6M\nPor qué NO: sin peligro sistémico — Fase 1 no disparada\nFórmula: Z>2.0 en 6M con memoria hasta Z<0`;
                      // R3 tooltip con HY y P20
                      let t3='';
                      if(d3.hy==null) t3=`😴 Complacencia — Sin HY OAS (BAMLH0A0HYM2)\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2)`;
                      else if(d3.active) t3=`😴 COMPLACENCIA ON ✓ — DISPARADO\nHY OAS ${fmt(d3.hy)}%  ·  P20 ${fmt(d3.p20)}% en 36M  ·  <3.5% ${d3.lt35?'SÍ':'NO'}  ·  <P20 ${d3.ltP20?'SÍ':'NO'}\nComplacencia SÍ (HY<P20 ${d3.ltP20?'SÍ':'NO'} OR <3.5 ${d3.lt35?'SÍ':'NO'})\nPor qué SÍ: CEGUERA AL RIESGO (BONOS BARATOS)\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2)`;
                      else {
                        const compStr = d3.complacencia ? 'SÍ' : 'NO';
                        const need = !d3.complacencia ? `FALTÓ complacencia (HY ${fmt(d3.hy)}% ≥ P20 ${fmt(d3.p20)}% y ≥3.5%)` : '—';
                        t3=`😴 Complacencia OFF — no disparado\nHY OAS ${fmt(d3.hy)}%  ·  P20 ${fmt(d3.p20)}%  ·  <3.5% ${d3.lt35?'SÍ':'NO'}  ·  <P20 ${d3.ltP20?'SÍ':'NO'}  ·  Complacencia ${compStr}\nR1=${d3.r1?'ON':'OFF'}  R2=${d3.r2?'ON':'OFF'} (informativo, ya no requerido)\nPor qué NO: ${need}\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2) — requiere 1 ó 2`;
                      }
                      return (<>
                    <td className="p-2 text-center"><span className={icon(d1.active,'bg-caution-500/20 text-caution-300 border-caution-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const c=d1.cape, s=d1.sma, th=d1.thr; const isRed = d1.active; const cpi=(d1 as any).cpi; const cpiSma=(d1 as any).cpiSma12; const cpiThr=cpiSma!=null?cpiSma*1.20:null; const capeOk=c!=null&&th!=null&&c>th; const cpiOk=cpi!=null&&cpiSma!=null&&(cpi>=4.0)&&cpi>cpiThr!; const ratioVal=(d1 as any).ratio; const faltCape = th!=null && c!=null ? (th - c).toFixed(2) : '—'; const faltCpi = cpiThr!=null && cpi!=null ? (cpiThr - cpi).toFixed(2)+'pp' : '—'; const node=isRed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-risk-400">📈 MÚLTIPLOS ALTOS ON ✓ — BOSQUE SECO (F0 ARMADO) <span className="text-risk-400" style={{fontSize:'11px'}}>·  +18% CAPE &   +20% CPI YoY</span></div><div className="font-mono text-[12px]">CAPE <span className="text-risk-300 font-black">{fmt(c)}</span> <span className="text-risk-400">&gt;</span> UMBRAL <span className="text-slate-100 font-bold">{fmt(th)}</span> <span className="text-slate-400">(=SMA</span> <span className="text-slate-200">{fmt(s)}</span><span className="text-slate-400">×1.18)</span> <span className="text-slate-500">ratio {ratioVal!=null?ratioVal.toFixed(3):'—'}×</span></div><div className="font-mono text-[12px]">CORE CPI <span className="text-risk-300 font-black">{cpi!=null?cpi.toFixed(2)+'%':'—'}</span> <span className="text-risk-400">&gt;</span> UMBRAL <span className="text-slate-100 font-bold">{cpiThr!=null?cpiThr.toFixed(2)+'%':'—'}</span> <span className="text-slate-400">(SMA12 {cpiSma!=null?cpiSma.toFixed(2)+'%':'—'}×1.20)</span> <span className="text-risk-400">+{(cpi!=null&&cpiThr!=null?(cpi-cpiThr).toFixed(2)+'pp':'—')}</span></div><div className="text-[11px]"><span className="text-risk-400">F0 ARMADO:</span> <span className="text-risk-300"> +18% CAPE Y   +20% CPI YoY — DETIENE COMPRAS</span></div><div className="text-[11px] text-slate-400 border-t border-slate-700 pt-1.5 mt-1 leading-tight"><span className="text-elevated-300">G1 30%:</span> ΔFED&gt;0 O 10Y&gt;SMA200×1.10 <span className="text-slate-500">·</span> <span className="text-risk-300">G2 70%:</span> FED acum≥0.50% en 60d &amp; CPI YoY&gt;1.30 y creciente <span className="text-slate-500">·</span> <span className="text-sky-300">G3 35%:</span> CPI 3M↓ O PAUSA 2M <span className="text-slate-500">·</span> <span className="text-favorable-300">G4 65%:</span> (CPI&lt;1.05 O FED&lt;0) & SMA50</div><div className="text-[11px]"><span className="text-favorable-400">SANACIÓN:</span> <span className="text-favorable-300">TRAS G1 (70/30) SIN G2 + CPI&lt;1.05 & SMA50 → 100%</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-favorable-400">📈 MÚLTIPLOS ALTOS OFF — DESARMADO <span className="text-favorable-400" style={{fontSize:'11px'}}>· BOSQUE NO SECO — {d} · {capeOk?'CAPE OK':'CAPE NO'} / {cpiOk?'CPI OK':'CPI NO'}</span></div><div className="font-mono text-[12px]">CAPE <span className={capeOk?"text-risk-300 font-bold":"text-favorable-300 font-black"}>{fmt(c)}</span> <span className={capeOk?"text-risk-400":"text-slate-500"}>{capeOk?">":"≤"}</span> UMBRAL <span className="text-slate-100 font-bold">{fmt(th)}</span> <span className="text-slate-400">(=SMA</span> <span className="text-slate-200">{fmt(s)}</span><span className="text-slate-400">×1.18)</span> <span className={capeOk?"text-risk-400":"text-favorable-400"}>{capeOk?`+${(c!-th!).toFixed(2)}`:`faltó ${faltCape}`}</span></div><div className="font-mono text-[12px]">CORE CPI <span className={cpiOk?"text-risk-300 font-bold":"text-favorable-300 font-black"}>{cpi!=null?cpi.toFixed(2)+'%':'—'}</span> <span className={cpiOk?"text-risk-400":"text-slate-500"}>{cpiOk?">":"≤"}</span> UMBRAL <span className="text-slate-100 font-bold">{cpiThr!=null?cpiThr.toFixed(2)+'%':'—'}</span> <span className="text-slate-400">(SMA12 {cpiSma!=null?cpiSma.toFixed(2)+'%':'—'}×1.20)</span> <span className={cpiOk?"text-risk-400":"text-favorable-400"}>{cpiOk?`+${(cpi!-cpiThr!).toFixed(2)}pp`:`faltó ${faltCpi}`}</span></div><div className="text-[11px]"><span className="text-favorable-400">ESTADO:</span> <span className="text-favorable-300">DESARMADO — {!capeOk && !cpiOk ? "CAPE Y CPI DENTRO DE MEDIA" : !capeOk ? `CAPE DENTRO DE MEDIA (faltó ${faltCape})` : `CPI DENTRO DE MEDIA (faltó ${faltCpi})`} — F0 NO ARMADO</span></div><div className="text-[11px] text-slate-500">F0: CAPE &gt; SMA36M×1.18 AND Core CPI YoY≥4.0 & &gt;SMA12 YoY×1.20 · {d}</div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d1.active?'📈':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d2.active,'bg-sky-500/20 text-sky-300 border-sky-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const isArmed=d2.active; const isDesarme=d2.z!=null && d2.z<0; const node=isArmed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-sky-400">🏦 ALTA DEUDA ON ✓ — ARMADO (FASE 1) <span className="text-sky-400" style={{fontSize:'11px'}}>· MEMORIA 6M</span></div><div>Z ACTUAL <span className={(d2.z??0)>2?"text-risk-300 font-black":"text-sky-300 font-black"}>{fmt(d2.z,2)}</span> <span className="text-sky-400">— ARMADO POR</span> <span className="text-sky-300 font-bold">Z&gt;2.0 EN {(d2 as any).armedMonth ?? 'ÚLTIMOS 6M'}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{fmt(d2.mg)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{fmt(d2.mean)}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{fmt(d2.std)}</span><span className="text-slate-400">=</span><span className="text-sky-300 font-black">{fmt(d2.z,2)}</span> <span className="text-sky-400 font-bold">— PERSISTE HASTA Z&lt;0 (FASE 4)</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-favorable-400">🏦 ALTA DEUDA OFF — {isDesarme?'DESARMADO (FASE 4)':'NO ARMADO'} <span className="text-favorable-400" style={{fontSize:'11px'}}>{isDesarme?`· DESARMADO EL ${(d2 as any).disarmedDate ?? d} — Z<0 PURGA COMPLETA`:'· SIN Z>2.0 EN 6M'}</span></div><div>Z ACTUAL <span className="text-favorable-400 font-bold">{fmt(d2.z,2)}</span> <span className="text-slate-500">≤ 2.0</span></div><div className="text-[11px]"><span className="text-favorable-400">ESTADO:</span> <span className="text-favorable-300">{isDesarme?'DESARMADO — Z<0 DESACTIVA (FASE 4)':'NO ARMADO — SIN PELIGRO SISTÉMICO'}</span></div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d2.active?'🏦':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d3.active,'bg-violet-500/20 text-violet-300 border-violet-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const isRed=d3.active; const node=isRed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-risk-400">😴 COMPLACENCIA ON ✓ — DISPARADO</div><div>HY OAS <span className="text-risk-300 font-black">{fmt(d3.hy)}%</span> <span className="text-slate-400">· P20</span> <span className="text-slate-300 font-bold">{fmt(d3.p20)}%</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-favorable-400">😴 COMPLACENCIA OFF — DESARMADO</div><div>HY OAS <span className="text-favorable-300 font-bold">{fmt(d3.hy)}%</span> <span className="text-slate-400">· P20</span> <span className="text-slate-300 font-bold">{fmt(d3.p20)}%</span></div><div className="text-[11px]"><span className="text-favorable-400">ESTADO:</span> <span className="text-favorable-300">DESARMADO — SIN COMPLACENCIA</span></div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d3.active?'😴':'⚪'}</span></td>
                    </>); })()}
                    <td className="p-2 text-right font-mono text-accent-300">{portVal!=null ? `$${Number(portVal).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</td>
                    <td className="p-2 text-right font-mono text-slate-400">{bhVal!=null ? `$${Number(bhVal).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${diffVal==null?'text-slate-500':diffVal>=0?'text-favorable-400':'text-risk-400'}`}>{diffVal!=null ? `${diffVal>=0?'+':''}$${Math.abs(diffVal).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0})}` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${diffPct==null?'text-slate-500':diffPct>=0?'text-favorable-400':'text-risk-400'}`}>{diffPct!=null ? `${diffPct>=0?'+':''}${diffPct.toFixed(1)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${perf==null?'text-slate-500':perf>=0?'text-favorable-400':'text-risk-400'}`}>{perf!=null ? `${perf>=0?'+':''}${perf.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${cagrVal==null?'text-slate-500':cagrVal>=0?'text-favorable-300':'text-risk-300'}`}>{cagrVal!=null ? `${cagrVal.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${ddVal==null?'text-slate-500':'text-elevated-300'}`}>{ddVal!=null ? `${(ddVal*100).toFixed(2)}%` : (perf!=null && perf<0 ? `${perf.toFixed(2)}%` : '—')}</td>
                    <td className="p-2 text-right font-mono text-sky-300">{spx? `$${Number(spx).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}`:'—'}</td>
                    <td className="p-2 text-right font-mono text-violet-300">{nasdaqVal? `$${Number(nasdaqVal).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}`:'—'}</td>
                    <td className="p-2 text-right font-mono text-sky-300">{tqqqR!=null? `$${Number(tqqqR).toFixed(2)}`:'—'}</td>
                    <td className="p-2 text-right font-mono text-caution-300">{capeVal?.toFixed(2) ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{mean3yVal?.toFixed(2) ?? '—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold rounded ${ratioColor}`}>{ratio!=null? `${ratio.toFixed(3)}X`:'—'}</td>
                    <td className="p-2 text-right font-mono text-elevated-300">{hy!=null? `${hy.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-elevated-300" title="BAMLH0A0HYM2EY Effective Yield">{hyEy!=null? `${hyEy.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgColor}`}>{mg!=null? `${mg.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgZColor} cursor-help`} onMouseEnter={(e)=>{ const n= mgZ!=null ? (detRow.r2.active ? (<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-sky-400">ARMADO Fase 1 — Z ACTUAL <span className="text-sky-400">{mgZ.toFixed(2)}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{mg?.toFixed(2)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{detRow.r2.mean?.toFixed(2) ?? '—'}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{detRow.r2.std?.toFixed(2) ?? '—'}</span><span className="text-slate-400">=</span><span className="text-sky-300 font-black">{mgZ.toFixed(2)}</span> <span className="text-sky-400">— ARMADO POR Z&gt;2.0 EL {(detRow.r2 as any).armedDate ?? (detRow.r2 as any).armedMonth ?? 'ÚLTIMOS 6M'} — PERSISTE HASTA Z&lt;0</span></div></div>) : (<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-favorable-400">{(detRow.r2 as any).disarmedDate ? `DESARMADO EL ${(detRow.r2 as any).disarmedDate}` : 'NO ARMADO'} — Z ACTUAL <span className="text-favorable-400">{mgZ.toFixed(2)}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{mg?.toFixed(2)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{detRow.r2.mean?.toFixed(2) ?? '—'}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{detRow.r2.std?.toFixed(2) ?? '—'}</span><span className="text-slate-400">=</span><span className="text-favorable-300 font-black">{mgZ.toFixed(2)}</span> <span className="text-slate-500">{(detRow.r2 as any).disarmedDate ? `· DESARMADO EL ${(detRow.r2 as any).disarmedDate} — Z<0` : '· NINGÚN Z>2.0 EN 6M'}</span></div><div className="text-[11px]"><span className="text-favorable-400">ESTADO:</span> <span className="text-favorable-300">DESARMADO — SIN PELIGRO SISTÉMICO</span></div></div>)) : (<div className="text-slate-400">Z SIN VENTANA</div>); const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip({x:r.left+r.width/2, y:r.top, node:n}); }} onMouseLeave={()=>setTableTip(null)} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{mgZ!=null? mgZ.toFixed(2):'—'}</td>
                    <td className="p-2 text-right font-mono text-indigo-300">{gdpR!=null? `$${(Number(gdpR)/1000).toFixed(1)}T`:'—'}</td>
                    <td className="p-2 text-right font-mono text-risk-300">{finraR!=null? `$${(Number(finraR)/1000).toFixed(0)}B`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold ${detRow.r1.cpi!=null && detRow.r1.cpiSma12!=null && detRow.r1.cpi! >=4.0 && detRow.r1.cpi! > detRow.r1.cpiSma12!*1.20 ? 'text-risk-300 bg-risk-500/10' : detRow.r1.cpi!=null ? 'text-favorable-300 bg-favorable-500/10' : 'text-slate-500'} cursor-help`} title={`Core CPI YoY ${detRow.r1.cpi?.toFixed(2) ?? '—'}% vs SMA12 YoY ${detRow.r1.cpiSma12?.toFixed(2) ?? '—'}%×1.20=${detRow.r1.cpiSma12!=null?(detRow.r1.cpiSma12*1.20).toFixed(2):'—'}% — ${detRow.r1.cpi!=null && detRow.r1.cpiSma12!=null ? ((detRow.r1.cpi! >=4.0 && detRow.r1.cpi! > detRow.r1.cpiSma12!*1.20) ? 'SÍ supera umbral (+20% y ≥4.0%)' : `NO supera — faltó ${(detRow.r1.cpiSma12!*1.20 - detRow.r1.cpi!).toFixed(2)}pp`) : 'sin datos'}`}>{detRow.r1.cpi!=null? `${detRow.r1.cpi.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-sky-300" title="SMA12 Core CPI YoY — media 12M YoY">{detRow.r1.cpiSma12!=null? `${detRow.r1.cpiSma12.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-slate-300" title="Umbral = SMA12 YoY ×1.05">{detRow.r1.cpiSma12!=null? `${(detRow.r1.cpiSma12*1.05).toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-favorable-300">{cpi!=null? `${cpi.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-violet-300">{fed!=null? `${fed.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-cyan-300">{y2!=null? `${y2.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-cyan-300">{y10!=null? `${y10.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-accent-300">{y30!=null? `${y30.toFixed(2)}%`:'—'}</td>
                    {(()=>{ if(msacsrR==null) return <td className="p-2 text-right font-mono text-slate-500">—</td>; const cls=msacsrR>6?'text-risk-400 bg-risk-500/10':msacsrR>=4?'text-caution-400 bg-caution-500/10':'text-favorable-400 bg-favorable-500/10'; return <td className={`p-2 text-right font-mono font-semibold rounded ${cls}`} title={`MSACSR ${d}`}>{Number(msacsrR).toFixed(1)} m</td>; })()}
                    {(()=>{ if(vixR==null) return <td className="p-2 text-right font-mono text-slate-500">—</td>; const cls=vixR>30?'text-risk-400 bg-risk-500/10':vixR>20?'text-caution-400 bg-caution-500/10':vixR>=12?'text-slate-200':'text-favorable-400 bg-favorable-500/10'; return <td className={`p-2 text-right font-mono font-semibold rounded ${cls}`} title={`VIX ${d}`}>{Number(vixR).toFixed(2)}</td>; })()}
                    {(()=>{ if(fgR==null) return <td className="p-2 text-right font-mono text-slate-500">—</td>; const cls=fgR>=55?'text-favorable-400 bg-favorable-500/10':fgR>=45?'text-slate-200':fgR>=25?'text-caution-400 bg-caution-500/10':'text-risk-400 bg-risk-500/10'; return <td className={`p-2 text-right font-mono font-semibold rounded ${cls}`} title={`Fear & Greed ${d}`}>{Number(fgR).toFixed(0)}</td>; })()}
                  </tr>
                );
              })}
              {paddingBottom>0 && (<tr><td colSpan={34} style={{ height: paddingBottom }} /></tr>)}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">{tr('virtFoot', { shown: sorted.length.toLocaleString('en-US'), total: rowsView.length.toLocaleString('en-US'), rendered: virtualItems.length })}</div>
      </div>
      {tableTip && (
        <div className="fixed z-[100] pointer-events-none bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-3.5 text-xs max-w-[520px] min-w-[340px] ring-1 ring-white/10 text-slate-200" style={{ left: (()=>{ const half=260; const w=typeof window!=='undefined'?window.innerWidth:1200; return Math.min(Math.max(half+8, tableTip.x), w-half-8); })(), top: Math.max(8, tableTip.y - 8), transform: 'translate(-50%, -100%)' }}>
          {tableTip.node}
        </div>
      )}
    </>
  );
}
