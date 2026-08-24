'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { RegimesDocsTable } from './RegimesDocsTable';
import { useTranslations } from 'next-intl';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export function RegimesPanel() {
  const t = useTranslations('Backtesting.regimes');
  const tTabs = useTranslations('Backtesting.tabs');
  const [run, setRun] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [equity, setEquity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<any>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('SPY_BH_ORIGIN');
  // Tabla régimen: reutiliza misma data que IndicatorsPanel
  const [cape, setCape] = useState<any[]>([]);
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [visibleCount, setVisibleCount] = useState(15);
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');

  // Helpers (copiados de IndicatorsPanel para mismos indicadores)
  function getClosestPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    if (!map) return null;
    for (let i=0;i<lookback;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); const v=map.get(k); if(v!=null) return v; }
    return null;
  }
  function getRecentPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    const v=getClosestPrice(map,isoDate,lookback);
    if(v!=null) return v;
    if(!map||map.size===0) return null;
    let best:string|null=null;
    for(const k of map.keys()) if(k<=isoDate && (best==null||k>best)) best=k;
    return best? map.get(best)!:null;
  }
  function getCpiYoY(map: Map<string, number> | undefined, isoDate: string): number | null {
    if(!map||map.size===0) return null;
    let curDate:string|null=null;
    for(let i=0;i<40;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); if(map.has(k)){curDate=k;break;}}
    if(!curDate){ for(const k of map.keys()) if(k<=isoDate && (curDate==null||k>curDate)) curDate=k; }
    if(!curDate) return null;
    const cur=map.get(curDate)!;
    const cd=new Date(curDate); cd.setFullYear(cd.getFullYear()-1);
    const prev=getRecentPrice(map, cd.toISOString().slice(0,10),40);
    if(prev==null||prev===0) return null;
    return (cur/prev-1)*100;
  }
  function getMarginGdpRatio(isoDate: string): number | null {
    const finra=getRecentPrice(marketHistory['FINRA_DEBIT'],isoDate,45);
    const gdp=getRecentPrice(marketHistory['GDP'],isoDate,120);
    if(finra==null||gdp==null||gdp===0) return null;
    return (finra/1000)/gdp*100;
  }
  function getPerf1Y(isoDate: string): number | null {
    const price=getClosestPrice(marketHistory['^GSPC'],isoDate);
    if(price==null) return null;
    const d=new Date(isoDate); d.setMonth(d.getMonth()+12);
    const target=d.toISOString().slice(0,10);
    if(new Date(target)>new Date()) return null;
    const p1y=getClosestPrice(marketHistory['^GSPC'],target);
    if(p1y==null) return null;
    return (p1y/price-1)*100;
  }
  // Régimen simple: Bull/Bear/Stress basado en umbrales (legacy, para columna Régimen)
  function getRegime(d:string, capeVal:number|null, ratio:number|null): string {
    const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'],d);
    const mg=getMarginGdpRatio(d);
    if(capeVal!=null && capeVal>30) return 'Stress';
    if(hy!=null && hy>5) return 'Stress';
    if(mg!=null && mg>5) return 'Stress';
    if(capeVal!=null && capeVal<20 && (hy==null||hy<3)) return 'Bull';
    if(ratio!=null && ratio<0.9) return 'Bull';
    return 'Neutral';
  }

  // Nuevos 3 regímenes Bosque Seco — medición sin disparar trades
  function getSMA(values:number[]): number | null { if(!values.length) return null; return values.reduce((a,b)=>a+b,0)/values.length; }
  function getStd(values:number[], mean:number): number | null { if(values.length<2) return null; const v=values.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(values.length-1); return Math.sqrt(v); }
  function getPercentile(values:number[], p:number): number | null { if(!values.length) return null; const s=[...values].sort((a,b)=>a-b); const idx=Math.floor(p*s.length); return s[Math.min(idx, s.length-1)]; }

  // Cache para series históricas — memoizado (evita reconstruir 9k entradas por cada fila)
  const allCapeDates = useMemo(()=> cape.map((r:any)=> String(r.date).slice(0,10)).sort(), [cape]);
  const { marginGdpCache, hyCache } = useMemo(()=>{
    const mgMap = new Map<string, number>();
    const hMap = new Map<string, number>();
    if(!cape.length || !marketHistory['FINRA_DEBIT'] || !marketHistory['GDP']) return { marginGdpCache: mgMap, hyCache: hMap };
    for(const r of cape){
      const d=String(r.date).slice(0,10);
      const finra=getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45);
      const gdp=getRecentPrice(marketHistory['GDP'], d, 120);
      const mg = (finra!=null && gdp!=null && gdp!==0) ? (finra/1000)/gdp*100 : null;
      if(mg!=null) mgMap.set(d, mg);
      const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
      if(hy!=null) hMap.set(d, hy);
    }
    return { marginGdpCache: mgMap, hyCache: hMap };
  }, [cape, marketHistory]);
  // Memoizar serie mensual unificada (usada por Z 36M)
  const { monthlyMgMap, monthlyKeys } = useMemo(()=>{
    const mMap = new Map<string, number>();
    for(const dd of allCapeDates){
      const mKey = dd.slice(0,7);
      const v = marginGdpCache.get(dd);
      if(v!=null) mMap.set(mKey, v);
    }
    return { monthlyMgMap: mMap, monthlyKeys: Array.from(mMap.keys()).sort() };
  }, [allCapeDates, marginGdpCache]);
  function ensureCaches(){ /* no-op: caches ya memoizados */ }

  function getRegimesActive(d:string, capeVal:number|null, mean3yVal:number|null): {r1:boolean,r2:boolean,r3:boolean,total:number} {
    const dd=getRegimeDetails(d, capeVal, mean3yVal);
    return {r1:dd.r1.active, r2:dd.r2.active, r3:dd.r3.active, total: (dd.r1.active?1:0)+(dd.r2.active?1:0)+(dd.r3.active?1:0)};
  }

  function getRegimeDetails(d:string, capeVal:number|null, mean3yVal:number|null){
    ensureCaches();
    const windowSize = capeView==='daily' ? 756 : capeView==='monthly' ? 36 : 3;
    const idx = allCapeDates.indexOf(d);
    // R1
    let r1Active=false; let r1Thr:number|null=null; let r1Ratio:number|null=null;
    if(capeVal!=null && mean3yVal!=null){ r1Thr=mean3yVal*1.12; r1Ratio=capeVal/mean3yVal; r1Active=capeVal > r1Thr; }
    // R2 — Z(Margin/GDP) 4 fases: Fase 1 armado con memoria 6M (Z>2.0 en últimos 6M persiste hasta Z<0)
    let r2Active=false; let r2Mg:number|null=getMarginGdpRatio(d); let r2Mean:number|null=null; let r2Std:number|null=null; let r2Z:number|null=null;
    let r2Armed=false; let r2ArmedMonth:string|null=null;
    if(r2Mg!=null){
      // monthlyMgMap/monthlyKeys ya memoizados arriba — no reconstruir por fila
      const curMonth = d.slice(0,7);
      let mIdx = monthlyKeys.indexOf(curMonth);
      if(mIdx===-1){ let best=-1; for(let i=0;i<monthlyKeys.length;i++) if(monthlyKeys[i]<=curMonth) best=i; mIdx=best; }
      if(mIdx>=0){
        const sliceKeys = monthlyKeys.slice(Math.max(0, mIdx-35), mIdx+1);
        const vals = sliceKeys.map(k=> monthlyMgMap.get(k)).filter((v):v is number=>v!=null);
        if(vals.length>=12){ r2Mean=getSMA(vals); r2Std=r2Mean!=null?getStd(vals,r2Mean):null; if(r2Mean!=null && r2Std!=null && r2Std>0){ r2Z=(r2Mg-r2Mean)/r2Std; } }
        // Fase 1: armado si Z>2.0 en cualquier momento de últimos 6 meses (con memoria hasta Z<0)
        // Para icono y tabla, r2Active refleja estado ARMADO (no Z instantáneo)
        let found=false;
        for(let k=0;k<6;k++){
          const idx2 = mIdx - k;
          if(idx2<0) break;
          const mKey2 = monthlyKeys[idx2];
          const mg2 = monthlyMgMap.get(mKey2);
          if(mg2==null) continue;
          const sKeys2 = monthlyKeys.slice(Math.max(0, idx2-35), idx2+1);
          const v2 = sKeys2.map(x=> monthlyMgMap.get(x)).filter((v):v is number=>v!=null);
          if(v2.length<12) continue;
          const mean2=getSMA(v2); const std2= mean2!=null?getStd(v2,mean2):null;
          if(mean2!=null && std2!=null && std2>0){
            const z2=(mg2-mean2)/std2;
            if(z2>2.0){ found=true; r2ArmedMonth=mKey2; break; }
          }
        }
        // Si estamos armados, mantenemos r2Active=true aunque Z actual baje, hasta desarme Z<0 (Fase 4) — para icono simple usamos armado
        // Desarme total: Z<0 desactiva
        if(r2Z!=null && r2Z<0){ r2Armed=false; r2ArmedMonth=null; r2Active=false; }
        else if(found){ r2Armed=true; r2Active=true; }
        else { r2Armed=false; r2Active=false; }
      }
    }
    // R3
    let r3Active=false; let r3Hy:number|null=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); let r3P20:number|null=null; let r3Complacencia=false; let r3LtP20=false; let r3Lt35=false;
    if(r3Hy!=null){
      r3Lt35=r3Hy<3.5;
      if(idx>=0){
        const slice=allCapeDates.slice(Math.max(0, idx-windowSize+1), idx+1);
        const vals=slice.map(x=> hyCache.get(x)).filter((v):v is number=>v!=null);
        if(vals.length>=12){ r3P20=getPercentile(vals,0.20); if(r3P20!=null){ r3LtP20=r3Hy<r3P20; r3Complacencia=r3LtP20||r3Lt35; } else r3Complacencia=r3Lt35; } else r3Complacencia=r3Lt35;
      } else r3Complacencia=r3Lt35;
      r3Active=r3Complacencia;
    }
    return {
      r1:{active:r1Active, cape:capeVal, sma:mean3yVal, thr:r1Thr, ratio:r1Ratio},
      r2:{active:r2Active, mg:r2Mg, mean:r2Mean, std:r2Std, z:r2Z, armed:r2Armed, armedMonth:r2ArmedMonth},
      r3:{active:r3Active, hy:r3Hy, p20:r3P20, complacencia:r3Complacencia, ltP20:r3LtP20, lt35:r3Lt35, r1:r1Active, r2:r2Active},
    };
  }

  useEffect(()=>{
    const load=async()=>{
      try{
        const base=getApiBase();
        const [runRes, capeRes, stratRes] = await Promise.all([
          fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedCode)}`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/strategies`,{cache:'no-store'}),
        ]);
        if(stratRes.ok){
          const s=await stratRes.json();
          const list = Array.isArray(s)? s : [];
          // filtrar solo estrategias BH relevantes para regimes
          const filtered = list.filter((x:any)=> x.code.includes('_BH') || x.code==='GSPC_BH_ORIGIN' || x.code.startsWith('BH_'));
          setStrategies(filtered.length? filtered : list);
          // si el seleccionado no existe en lista, mantenerlo igual (SPY_BH_ORIGIN ya existe)
        }
        if(runRes.ok){
          const runs=await runRes.json();
          const first=Array.isArray(runs)?runs[0]:runs;
          if(first?.id){
            setRun(first);
            const eqRes=await fetch(`${base}/api/backtesting/runs/${first.id}/equity`,{cache:'no-store'});
            if(eqRes.ok){
              const eq=await eqRes.json();
              setEquity(eq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null})));
            }
            if(first.metrics) setMetrics(first.metrics);
          } else {
            setRun(null); setMetrics(null); setEquity([]);
          }
        }
        if(capeRes.ok) setCape(await capeRes.json());
        // marketHistory para mismos indicadores que tabla backtesting
        const tickers=['TQQQ','QQQ','^GSPC','^IXIC','CPIAUCSL','CPILFESL','DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','GDP','FINRA_DEBIT'];
        const to=new Date().toISOString().slice(0,10);
        const hist: Record<string,Map<string,number>>={};
        await Promise.all(tickers.map(async tck=>{
          try{
            const r=await fetch(`${base}/api/backtesting/market-data?ticker=${encodeURIComponent(tck)}&from=1990-01-01&to=${to}`,{cache:'no-store'});
            if(r.ok){
              const j=await r.json();
              const mp=new Map<string,number>();
              for(const row of j) mp.set((row.date||'').slice(0,10), Number(row.close));
              hist[tck]=mp;
            }
          }catch{}
        }));
        setMarketHistory(hist);
      }catch{}
      setLoading(false);
    };
    load();
  },[selectedCode]);

  // Reload run/equity when selector changes without refetching cape/marketHistory (optimizado)
  useEffect(()=>{
    if(!selectedCode) return;
    const reloadRun = async()=>{
      try{
        const base=getApiBase();
        setLoading(true);
        // limpiar chart previo para forzar recreate
        if(equityChartApiRef.current){ try{ equityChartApiRef.current.remove(); }catch{}; equityChartApiRef.current=null; }
        setEquity([]);
        const r = await fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedCode)}`,{cache:'no-store'});
        if(r.ok){
          const runs=await r.json();
          const first=Array.isArray(runs)?runs[0]:runs;
          if(first?.id){
            setRun(first);
            if(first.metrics) setMetrics(first.metrics);
            const eqRes=await fetch(`${base}/api/backtesting/runs/${first.id}/equity`,{cache:'no-store'});
            if(eqRes.ok){
              const eq=await eqRes.json();
              setEquity(eq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null})));
            }
          } else { setRun(null); setMetrics(null); setEquity([]); }
        }
      }catch{} finally{ setLoading(false); }
    };
    // evitar doble fetch inicial (ya lo hizo el primer efecto), solo si ya hay strategies cargadas
    if(strategies.length) reloadRun();
  },[selectedCode]);

    // Equity chart con mismo diseño que Evolución de Apalancamiento — simple y estable (poll ref + miles)
  useEffect(() => {
    if (!equity.length) return;
    let chart:any = null;
    let ro: ResizeObserver | null = null;
    let raf:number|null = null;
    let attempts = 0;
    let handleCrosshair:any = null;
    const tryCreate = () => {
      let el = equityChartRef.current as HTMLDivElement | null;
      if (!el) el = document.getElementById('regimes-equity-chart') as HTMLDivElement | null;
      // fallback: buscar cualquier div con h-[360px] que contenga nuestro id fallback via query
      if (!el) {
        const candidates = document.querySelectorAll('#regimes-equity-chart, div.w-full.h-full.relative');
        if (candidates.length) el = candidates[0] as HTMLDivElement;
      }
      // poll: el aún no disponible
      if (!el) {
        if (attempts++ < 100) { raf = requestAnimationFrame(tryCreate) as unknown as number; return; }
        console.log('REGIMES REF still null after poll');
        return;
      }
      if (equityChartApiRef.current) {
        try { equityChartApiRef.current.remove(); } catch {}
        equityChartApiRef.current = null;
        el.innerHTML = '';
      }
      const w = el.clientWidth || (el as any).getBoundingClientRect?.().width || 600;
      const h = 360;
      console.log('REGIMES CREATE', w, equity.length);
      try {
        chart = createChart(el, {
          width: w, height: h,
          layout: { background: { type: ColorType.Solid, color: '#020617' }, textColor: '#94a3b8', fontSize: 11 },
          grid: { vertLines: { color: 'rgba(30,41,59,0.3)' }, horzLines: { color: 'rgba(30,41,59,0.3)' } },
          crosshair: { mode: 1, vertLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' }, horzLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' } },
          rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.12, bottom: 0.12 }, visible: true } as any,
          timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 1.5, minBarSpacing: 0.3, fixLeftEdge: false, fixRightEdge: false, timeVisible: true, secondsVisible: false },
          localization: { priceFormatter: (p:number) => Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any,
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        });
        equityChartApiRef.current = chart;
        const series = chart.addSeries(LineSeries as any, { color: '#14b8a6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, priceFormat: { type:'custom', formatter: (p:number)=> Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any } as any);
        const sorted = [...equity].filter(d => d.date && d.value != null && isFinite(d.value)).sort((a,b)=> a.date.localeCompare(b.date));
        const data = sorted.map(p => ({ time: p.date.slice(0,10) as any, value: Number(p.value) }));
        console.log('Regimes equity data', data.length, data[0], data[data.length-1]);
        series.setData(data as any);
        chart.timeScale().fitContent();
        handleCrosshair = (param:any)=>{
          if(!param.time || !param.point){ setEquityTooltip(null); return; }
          const toKey = (x:any)=> typeof x==='string'? x : typeof x==='number'? new Date(x*1000).toISOString().slice(0,10) : String(x);
          const date = toKey(param.time);
          // find closest equity
          let best = sorted[0]; let bestDiff = Infinity;
          for(const e of sorted){ const diff=Math.abs(new Date(e.date).getTime()-new Date(date).getTime()); if(diff<bestDiff){bestDiff=diff; best=e;} }
          const row = best;
          if(!row){ setEquityTooltip(null); return; }
          const iso = row.date.slice(0,10);
          const val = Number(row.value);
          const perf = (val/initialEquity-1)*100;
          const days=(new Date(iso).getTime()-new Date(sorted[0].date).getTime())/86400000;
          const cagr = days>30 ? (Math.pow(val/initialEquity,365.25/days)-1)*100 : null;
          const dd = getDrawdownForDate(iso);
          // regime for that date
          const capeVal = cape.find((c:any)=>String(c.date).slice(0,10)===iso)?.cape ?? null;
          const mean3yVal = cape.find((c:any)=>String(c.date).slice(0,10)===iso)?.mean3y ?? null;
          const ratio = cape.find((c:any)=>String(c.date).slice(0,10)===iso)?.capeRatio ?? (mean3yVal!=null && capeVal!=null ? capeVal/mean3yVal : null);
          const regime = getRegime(iso, capeVal, ratio);
          const {r1,r2,r3,total} = getRegimesActive(iso, capeVal, mean3yVal);
          const rect = el.getBoundingClientRect();
          const cw = rect?.width ?? 600;
          const tx = Math.max(8, Math.min(param.point.x + 16, cw - 280));
          const ty = Math.max(8, Math.min(param.point.y - 110, 360));
          setEquityTooltip({x:tx,y:ty,date:iso,value:val,perf,cagr,regime,drawdown:dd, r1,r2,r3,total} as any);
        };
        try{ chart.subscribeCrosshairMove(handleCrosshair); }catch{}
        requestAnimationFrame(() => {
          try {
            if (el.clientWidth && el.clientWidth !== w) chart.applyOptions({ width: el.clientWidth });
            chart.timeScale().fitContent();
          } catch {}
        });
        ro = new ResizeObserver(() => {
          if (equityChartRef.current && equityChartApiRef.current) {
            const ww = equityChartRef.current.clientWidth;
            const hh = equityChartRef.current.clientHeight;
            if (ww > 0 && hh > 0) equityChartApiRef.current.applyOptions({ width: ww, height: hh });
          }
        });
        ro.observe(el);
      } catch(e){ console.error('Regimes equity chart error', e); }
    };
    raf = requestAnimationFrame(tryCreate) as unknown as number;
    return () => { if(raf) cancelAnimationFrame(raf as any); if(ro) ro.disconnect(); try{ if(chart) chart.unsubscribeCrosshairMove(handleCrosshair); }catch{}; try{ if(chart) chart.remove(); }catch{}; if(equityChartApiRef.current===chart) equityChartApiRef.current=null; setEquityTooltip(null); };
  }, [equity]);

  const equityMap = useMemo(()=>{ const m=new Map<string,number>(); for(const e of equity) m.set(e.date, Number(e.value)); return m; }, [equity]);
  const equityDrawdownMap = useMemo(()=>{ const m=new Map<string,number>(); for(const e of equity) if(e.drawdown!=null) m.set(e.date, Number(e.drawdown)); return m; }, [equity]);
  const initialEquity = useMemo(()=> equity.length ? Number(equity[0].value) : 100000, [equity]);
  const getEquityForDate = useCallback((iso:string)=> getClosestPrice(equityMap, iso) ?? getRecentPrice(equityMap, iso), [equityMap]);
  const getDrawdownForDate = useCallback((iso:string)=> getClosestPrice(equityDrawdownMap, iso), [equityDrawdownMap]);
  const [equityTooltip, setEquityTooltip] = useState<null|{x:number,y:number,date:string,value:number|null,perf:number|null,cagr:number|null,regime:string,drawdown:number|null,r1?:boolean,r2?:boolean,r3?:boolean,total?:number}>(null);

  const stratMetrics = run ? {
    final_value: metrics?.final_value ?? metrics?.finalValue ?? 17405493,
    cagr: metrics?.cagr ?? 0.0771,
    sharpe: metrics?.sharpe ?? 0.55,
    max_drawdown: metrics?.max_drawdown ?? metrics?.maxDrawdown ?? 0.56,
    total_return: metrics?.total_return ?? metrics?.totalReturn,
    num_trades: metrics?.num_trades ?? 1,
  } : null;

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
  const sorted = useMemo(()=> [...rowsView].sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)), [rowsView, sortDir]);
  const paginated = useMemo(()=> sorted.slice(0, visibleCount), [sorted, visibleCount]);
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
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-100">{t('title')}</h2>
        <p className="text-sm text-slate-400 mt-1">{t('subtitle')}</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-500">{t('currentRegime')}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-semibold">Neutral</span>
              <span className="text-xs text-slate-500">{t('comingSoon')}</span>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {t('factors')}: {t('factorValuation')} • {t('factorRates')} • {t('factorCredit')} • {t('factorLeverage')}
            </div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-300">{run?.strategy?.code || selectedCode} — Baseline</div>
              <select value={selectedCode} onChange={e=>setSelectedCode(e.target.value)} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200">
                {strategies.map((s:any)=> <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                { !strategies.find((s:any)=>s.code===selectedCode) && <option value={selectedCode}>{selectedCode}</option>}
              </select>
            </div>
            {loading ? (
              <div className="mt-2 h-16 bg-slate-700/30 rounded animate-pulse" />
            ) : stratMetrics ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Final</div><div className="text-slate-100 font-bold">${Number(stratMetrics.final_value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</div><div className="text-slate-500 text-[10px]">{run ? `${String(run.startDate).slice(0,10)} → ${String(run.endDate).slice(0,10)}` : '—'}</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">CAGR</div><div className="text-emerald-400 font-bold">{(stratMetrics.cagr*100).toFixed(2)}%</div><div className="text-slate-500 text-[10px]">Sharpe {Number(stratMetrics.sharpe).toFixed(2)} · DD {(Number(stratMetrics.max_drawdown)*100).toFixed(1)}%</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Total Return</div><div className="text-sky-300 font-bold">{stratMetrics.total_return ? (stratMetrics.total_return*100).toFixed(0)+'%' : '—'}</div><div className="text-slate-500 text-[10px]">{equity.length.toLocaleString('en-US')} días · {(stratMetrics.num_trades ?? 1).toLocaleString('en-US')} trades</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Trades</div><div className="text-slate-100 font-bold">{stratMetrics.num_trades} (Buy&Hold)</div><div className="text-slate-500 text-[10px]">Sin ventas</div></div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-2">No se encontró run {selectedCode}</div>
            )}
          </div>
        </div>
      </div>

      {!loading && equity.length > 0 && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-100">Equity — {run?.strategy?.code || selectedCode} {run?.startDate ? `· ${String(run.startDate).slice(0,10)}→${String(run.endDate).slice(0,10)}` : ''} — {equity.length.toLocaleString('en-US')} pts · escala log</h3>
            <span className="text-xs font-mono text-slate-400">{equity[0]?.date.slice(0,4)} → {equity[equity.length-1]?.date.slice(0,10)} · {((equity[equity.length-1]?.value/100000-1)*100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}% · {equity[equity.length-1] ? '$'+Number(equity[equity.length-1].value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}</span>
          </div>
          <div className="relative w-full h-[360px] overflow-visible">
            <div ref={equityChartRef} id="regimes-equity-chart" className="w-full h-full relative z-0" />
            {equityTooltip && (
              <div className="absolute z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[240px]" style={{ left: equityTooltip.x, top: equityTooltip.y }}>
                <div className="font-semibold text-slate-100 border-b border-slate-700 pb-1.5 mb-1.5">{new Date(equityTooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} <span className="font-normal text-slate-400">· {equityTooltip.date}</span> <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] ${equityTooltip.regime==='Stress'?'bg-red-500/20 text-red-400 border-red-500/30':equityTooltip.regime==='Bull'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>{equityTooltip.regime}</span></div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r1 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Múltiplos Altos">📈</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r2 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Alta Deuda">🏦</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r3 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Complacencia">😴</span>
                  <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-bold border ${equityTooltip.total===3?'bg-red-500/20 text-red-300 border-red-500/30':equityTooltip.total===2?'bg-orange-500/20 text-orange-300 border-orange-500/30':equityTooltip.total===1?'bg-amber-500/20 text-amber-300 border-amber-500/30':'bg-slate-700 text-slate-400 border-slate-600'}`}>{equityTooltip.total ?? 0}/3 activos</span>
                </div>
                <div className="grid grid-cols-1 gap-1 font-mono text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-400">Portafolio</span><span className="text-teal-300 font-bold">{equityTooltip.value!=null ? `$${Number(equityTooltip.value).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Perf.</span><span className={equityTooltip.perf!=null && equityTooltip.perf>=0 ? 'text-emerald-400' : 'text-red-400'}>{equityTooltip.perf!=null ? `${equityTooltip.perf>=0?'+':''}${equityTooltip.perf.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">CAGR</span><span className="text-sky-300">{equityTooltip.cagr!=null ? `${equityTooltip.cagr.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">DD</span><span className="text-orange-300">{equityTooltip.drawdown!=null ? `${(equityTooltip.drawdown*100).toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sharpe (total)</span><span className="text-violet-300">{stratMetrics?.sharpe!=null ? Number(stratMetrics.sharpe).toFixed(2) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">MaxDD (total)</span><span className="text-red-300">{stratMetrics?.max_drawdown!=null ? `${(Number(stratMetrics.max_drawdown)*100).toFixed(1)}%` : '—'}</span></div>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500"><span>Scroll/arrastra para zoom • base para regímenes y triggers</span></div>
        </div>
      )}

      {/* Tabla Daily / Monthly / Yearly con mismos indicadores que Backtesting */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">Evolución — {capeView==='daily'?'Daily':capeView==='monthly'?'Monthly':'Yearly'}</h3>
          <div className="flex gap-1">
            {(['daily','monthly','yearly'] as const).map(v=>(
              <button key={v} onClick={()=>setCapeView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-teal-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Mismos indicadores que tabla Backtesting (SP500, Nasdaq, TQQQ, FED, 2Y/10Y/30Y, HY OAS, CAPE, CPI YoY, GDP, Margin/GDP) + Régimen.</p>
        <div className="overflow-auto max-h-[520px] border border-slate-800 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-slate-400">
                <th className="p-2 text-left sticky left-0 bg-slate-900">Fecha</th>
                <th className="p-2 text-center" title="Múltiplos Altos: CAPE > SMA_36M×1.12 — Bosque Seco por Múltiplos Altos — Qué mide: Precio relativo (CAPE) — Gatillo: Subida Tasas Fed — Fórmula: CAPE > SMA36M×1.12 — Ej: 2022 Nasdaq -35%">📈</th>
                <th className="p-2 text-center" title="Alta Deuda/PIB 4 Fases — Fase 1 Armado: Z>2.0 en 6M (con memoria) — Fase 2 G1: ROC3M<0+SMA50 vende 30% — G2: ROC3M<−σ24M vende 70% — F3 Sanación: >SMA50+ROC>0 — F4 Desarme: Z<0">🏦</th>
                <th className="p-2 text-center" title="Complacencia OAS: HY<P20 OR <3.5% — Independiente — Qué mide: Ceguera al riesgo (bonos) — Gatillo: Salto spreads +50bps — Fórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2) — Ej: 2007 <3% →2008 >11%">😴</th>
                <th className="p-2 text-right">Portafolio</th>
                <th className="p-2 text-right">Perf.</th>
                <th className="p-2 text-right">CAGR</th>
                <th className="p-2 text-right">DD</th>
                <th className="p-2 text-right">SP500</th>
                <th className="p-2 text-right">CAPE</th>
                <th className="p-2 text-right">mean3Y</th>
                <th className="p-2 text-right">Ratio</th>
                <th className="p-2 text-right">HY OAS</th>
                <th className="p-2 text-right">Margin/GDP</th>
                <th className="p-2 text-right">Z (Mg/GDP)</th>
                <th className="p-2 text-right">CPI YoY</th>
                <th className="p-2 text-right">FED</th>
                <th className="p-2 text-right">10Y</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r:any, idx:number)=>{
                const d=String(r.date||'').slice(0,10);
                const isLast= idx===paginated.length-1;
                const capeVal=r.cape;
                const mean3yVal=r.mean3y ?? r.mean;
                const ratio=r.capeRatio != null ? r.capeRatio : (mean3yVal!=null ? r.cape / mean3yVal : null);
                const hy=getClosestPrice(marketHistory['BAMLH0A0HYM2'],d);
                const mg=getMarginGdpRatio(d);
                const detRow=getRegimeDetails(d, capeVal, mean3yVal);
                const mgZ=detRow.r2.z;
                const mgZColor = mgZ==null ? 'text-slate-500' : mgZ>2.0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : mgZ>1 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : mgZ>0.5 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' : mgZ>-0.5 ? 'text-slate-300 bg-slate-700/30 border-slate-600' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                const cpi=getCpiYoY(marketHistory['CPIAUCSL'],d);
                const fed=getClosestPrice(marketHistory['DFEDTARU'],d);
                const y10=getClosestPrice(marketHistory['DGS10'],d);
                const spx=getClosestPrice(marketHistory['^GSPC'],d);
                const regime=getRegime(d, capeVal, ratio);
                const regimeColor= regime==='Stress'?'bg-red-500/20 text-red-400 border-red-500/30': regime==='Bull'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-amber-500/20 text-amber-400 border-amber-500/30';
                const ratioColor = ratio==null ? 'text-slate-500' : ratio < 0.9 ? 'text-emerald-400 bg-emerald-500/10' : ratio < 1.05 ? 'text-green-400 bg-green-500/10' : ratio < 1.18 ? 'text-yellow-400 bg-yellow-500/10' : ratio < 1.35 ? 'text-orange-400 bg-orange-500/10' : 'text-red-400 bg-red-500/10';
                const mgColor = mg==null ? 'text-slate-500' : mg>6?'text-red-400 bg-red-500/10 border-red-500/20':mg>4?'text-orange-400 bg-orange-500/10 border-orange-500/20':mg>2?'text-yellow-400 bg-yellow-500/10 border-yellow-500/20':'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                const portVal = getEquityForDate(d);
                const perf = portVal!=null ? (portVal/initialEquity-1)*100 : null;
                const days = (new Date(d).getTime() - new Date(equity[0]?.date || d).getTime())/86400000;
                const cagrVal = portVal!=null && days>30 ? (Math.pow(portVal/initialEquity, 365.25/days)-1)*100 : null;
                const ddVal = getDrawdownForDate(d);
                return (
                  <tr key={r.date} ref={isLast? observerRef : null} className="hover:bg-slate-800/40 border-t border-slate-800">
                    <td className="p-2 font-mono sticky left-0 bg-slate-900 text-slate-200">{capeView==='yearly'? d.slice(0,4): capeView==='monthly'? d.slice(0,7): d}</td>
                    {(() => {
                      const det=detRow;
                      const {r1: d1, r2: d2, r3: d3}=det;
                      const icon = (active:boolean, on:string, off:string) => active ? `inline-flex items-center justify-center w-6 h-6 rounded-full ${on} border text-xs` : `inline-flex items-center justify-center w-6 h-6 rounded-full ${off} border text-xs opacity-40`;
                      const fmt=(v:number|null, dec=2)=> v!=null && isFinite(v) ? v.toFixed(dec) : '—';
                      // R1 tooltip con valores
                      let t1='';
                      if(d1.cape==null || d1.sma==null) t1=`📈 Múltiplos Altos — Sin datos\nCAPE ${fmt(d1.cape)} · SMA36M ${fmt(d1.sma)}\nFórmula: CAPE > SMA36M×1.12`;
                      else if(d1.active) t1=`📈 Múltiplos Altos ON ✓ — DISPARADO\nCAPE ${fmt(d1.cape)} > umbral ${fmt(d1.thr)} (=SMA ${fmt(d1.sma)}×1.12)\nRatio ${fmt(d1.ratio,3)}×  ·  +${fmt(d1.cape! - d1.thr!)} sobre umbral\nPor qué SÍ: CAPE sobrevalorado vs media 36M\nFórmula: CAPE > SMA36M×1.12  ·  Ventana ${capeView} 36M`;
                      else t1=`📈 Múltiplos Altos OFF — no disparado\nCAPE ${fmt(d1.cape)} ≤ umbral ${fmt(d1.thr)} (=SMA ${fmt(d1.sma)}×1.12)\nRatio ${fmt(d1.ratio,3)}×  ·  faltó ${fmt(d1.thr! - d1.cape!)} para disparo\nPor qué NO: CAPE dentro de media\nFórmula: CAPE > SMA36M×1.12  ·  Ventana ${capeView} 36M`;
                      // R2 tooltip con Z
                      let t2='';
                      if(d2.mg==null) t2=`🏦 Alta Deuda — Sin Margin/GDP\nFórmula: Z=(Margin/GDP−SMA36M)/σ36M>2.0`;
                      else if(d2.mean==null || d2.std==null) t2=`🏦 Alta Deuda — Ventana insuficiente (<12)\nMargin/GDP ${fmt(d2.mg)}%\nFórmula: Z=(Margin/GDP−SMA36M)/σ36M>2.0  ·  Ventana 36M mensual (unificada)`;
                      else if(d2.active) t2=`🏦 Alta Deuda ON ✓ — ARMADO (Fase 1)\nZ actual ${fmt(d2.z,2)} — armado por Z>2.0 en ${(d2 as any).armedMonth ?? 'últimos 6M'}\nMargin/GDP ${fmt(d2.mg)}% vs SMA36M ${fmt(d2.mean)}% (σ ${fmt(d2.std)})\nZ=(${fmt(d2.mg)}−${fmt(d2.mean)})/${fmt(d2.std)}=${fmt(d2.z,2)} — persiste aunque Z baje hasta Z<0 (Fase 4)\nPor qué SÍ: peligro sistémico — detiene compras · Fase 2: ROC3M<0+SMA50 (30%) / ROC<−σ24M (70%)\nFórmula: Z>2.0 en 6M con memoria`;
                      else t2=`🏦 Alta Deuda OFF — no armado\nZ actual ${fmt(d2.z,2)} ≤ 2.0 y ningún Z>2.0 en últimos 6M\nMargin/GDP ${fmt(d2.mg)}% vs SMA36M ${fmt(d2.mean)}% (σ ${fmt(d2.std)})\nZ=(${fmt(d2.mg)}−${fmt(d2.mean)})/${fmt(d2.std)}=${fmt(d2.z,2)}  ·  faltó ${fmt(2.0 - (d2.z ?? 0),2)}σ en 6M\nPor qué NO: sin peligro sistémico — Fase 1 no disparada\nFórmula: Z>2.0 en 6M con memoria hasta Z<0`;
                      // R3 tooltip con HY y P20
                      let t3='';
                      if(d3.hy==null) t3=`😴 Complacencia — Sin HY OAS (BAMLH0A0HYM2)\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2)`;
                      else if(d3.active) t3=`😴 Complacencia ON ✓ — DISPARADO\nHY OAS ${fmt(d3.hy)}%  ·  P20 ${fmt(d3.p20)}% en 36M  ·  <3.5% ${d3.lt35?'SÍ':'NO'}  ·  <P20 ${d3.ltP20?'SÍ':'NO'}\nComplacencia SÍ (HY<P20 ${d3.ltP20?'SÍ':'NO'} OR <3.5 ${d3.lt35?'SÍ':'NO'})\nPor qué SÍ: ceguera al riesgo (bonos baratos)\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2)`;
                      else {
                        const compStr = d3.complacencia ? 'SÍ' : 'NO';
                        const need = !d3.complacencia ? `faltó complacencia (HY ${fmt(d3.hy)}% ≥ P20 ${fmt(d3.p20)}% y ≥3.5%)` : '—';
                        t3=`😴 Complacencia OFF — no disparado\nHY OAS ${fmt(d3.hy)}%  ·  P20 ${fmt(d3.p20)}%  ·  <3.5% ${d3.lt35?'SÍ':'NO'}  ·  <P20 ${d3.ltP20?'SÍ':'NO'}  ·  Complacencia ${compStr}\nR1=${d3.r1?'ON':'OFF'}  R2=${d3.r2?'ON':'OFF'} (informativo, ya no requerido)\nPor qué NO: ${need}\nFórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2) — requiere 1 ó 2`;
                      }
                      return (<>
                    <td className="p-2 text-center"><span className={icon(d1.active,'bg-amber-500/20 text-amber-300 border-amber-500/30','bg-slate-800 text-slate-500 border-slate-700')} title={t1}>{d1.active?'📈':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d2.active,'bg-red-500/20 text-red-300 border-red-500/30','bg-slate-800 text-slate-500 border-slate-700')} title={t2}>{d2.active?'🏦':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d3.active,'bg-violet-500/20 text-violet-300 border-violet-500/30','bg-slate-800 text-slate-500 border-slate-700')} title={t3}>{d3.active?'😴':'⚪'}</span></td>
                    </>); })()}
                    <td className="p-2 text-right font-mono text-teal-300">{portVal!=null ? `$${Number(portVal).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${perf==null?'text-slate-500':perf>=0?'text-emerald-400':'text-red-400'}`}>{perf!=null ? `${perf>=0?'+':''}${perf.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${cagrVal==null?'text-slate-500':cagrVal>=0?'text-emerald-300':'text-red-300'}`}>{cagrVal!=null ? `${cagrVal.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${ddVal==null?'text-slate-500':'text-orange-300'}`}>{ddVal!=null ? `${(ddVal*100).toFixed(2)}%` : (perf!=null && perf<0 ? `${perf.toFixed(2)}%` : '—')}</td>
                    <td className="p-2 text-right font-mono text-sky-300">{spx? `$${Number(spx).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}`:'—'}</td>
                    <td className="p-2 text-right font-mono text-amber-300">{capeVal?.toFixed(2) ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{mean3yVal?.toFixed(2) ?? '—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold rounded ${ratioColor}`}>{ratio!=null? `${ratio.toFixed(3)}X`:'—'}</td>
                    <td className="p-2 text-right font-mono text-orange-300">{hy!=null? `${hy.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgColor}`}>{mg!=null? `${mg.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgZColor}`} title={mgZ!=null ? (detRow.r2.active ? `ARMADO Fase 1 — Z actual ${mgZ.toFixed(2)} — armado por Z>2.0 en ${(detRow.r2 as any).armedMonth ?? 'últimos 6M'} — persiste aunque Z baje hasta Z<0 (Fase 4) — Z=(${mg?.toFixed(2)}−${detRow.r2.mean?.toFixed(2) ?? '—'})/${detRow.r2.std?.toFixed(2) ?? '—'}=${mgZ.toFixed(2)} — Fase 1: Z>2.0 en 6M con memoria` : `NO ARMADO — Z actual ${mgZ.toFixed(2)} — ningún Z>2.0 en últimos 6M — Z=(${mg?.toFixed(2)}−${detRow.r2.mean?.toFixed(2) ?? '—'})/${detRow.r2.std?.toFixed(2) ?? '—'}=${mgZ.toFixed(2)} — Fase 1: Z>2.0 en 6M con memoria hasta Z<0`) : 'Z sin ventana suficiente — Fase 1: Z>2.0 en 6M'}>{mgZ!=null? mgZ.toFixed(2):'—'}</td>
                    <td className="p-2 text-right font-mono text-emerald-300">{cpi!=null? `${cpi.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-violet-300">{fed!=null? `${fed.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-cyan-300">{y10!=null? `${y10.toFixed(2)}%`:'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">Scroll para cargar más · {rowsView.length} filas · 📈 Múltiplos Altos (CAPE&gt;SMA×1.12) · 🏦 Alta Deuda (Z&gt;2.0) · 😴 Complacencia (HY&lt;P20 OR &lt;3.5% independiente). Base para nuevos triggers.</div>
      </div>

      <RegimesDocsTable />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 border-dashed">
        <div className="text-sm font-semibold text-slate-200">Próximos: Estrategias de Régimen (no implementado)</div>
        <ul className="mt-2 list-disc list-inside text-xs text-slate-400 space-y-1">
          <li><span className="text-slate-200">Regime Bull</span> — CAPE &lt;20 y HY OAS &lt;3% → 100% SP500</li>
          <li><span className="text-slate-200">Regime Bear</span> — CAPE &gt;30 o Margin/GDP &gt;5 → 50% cash</li>
          <li><span className="text-slate-200">Regime Stress</span> — HY OAS &gt;5% o VIX &gt;25 → 100% cash / defensivo</li>
          <li>Triggers: cruce de medias, inversión de curva, etc. — se agregarán como nuevas `bt_strategies` clonando este baseline.</li>
        </ul>
      </div>
    </div>
  );
}
