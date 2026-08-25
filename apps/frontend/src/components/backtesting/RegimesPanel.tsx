'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RegimesDocsTable } from './RegimesDocsTable';
import { useTranslations } from 'next-intl';
import { createChart, ColorType, LineSeries, createSeriesMarkers } from 'lightweight-charts';

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
  const [bhRun, setBhRun] = useState<any>(null);
  const [bhEquity, setBhEquity] = useState<any[]>([]);
  const [bhMetrics, setBhMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<any>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedA, setSelectedA] = useState<string>('SPY_REGIMEN1');
  const [selectedB, setSelectedB] = useState<string>('SPY_BH_ORIGIN');
  const [tradesA, setTradesA] = useState<any[]>([]);
  const [tradesB, setTradesB] = useState<any[]>([]);
  // Tabla régimen: reutiliza misma data que IndicatorsPanel
  const [cape, setCape] = useState<any[]>([]);
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [visibleCount, setVisibleCount] = useState(15);
  const [filterYear, setFilterYear] = useState<string>('');
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
  // Core CPI mensual memoizado — YoY % (corrige puntos→% y fill 90d para Aug)
  const { cpiMonthlyMap, cpiKeys, cpiSma12Map, cpiYoYMap, cpiYoYSma12Map, monthLastDate } = useMemo(()=>{
    const cmap = new Map<string, number>();
    const lastMap = new Map<string, string>();
    for(const dd of allCapeDates){
      const mk=dd.slice(0,7);
      const v=marketHistory['CPILFESL']?.get(dd) ?? getClosestPrice(marketHistory['CPILFESL'], dd, 90) ?? getRecentPrice(marketHistory['CPILFESL'], dd, 90);
      if(v!=null){ cmap.set(mk, v); lastMap.set(mk, dd); }
    }
    const keys = Array.from(cmap.keys()).sort();
    const smaMap = new Map<string, number>();
    for(let i=0;i<keys.length;i++){
      const sKeys=keys.slice(Math.max(0,i-11),i+1);
      const vals=sKeys.map(k=> cmap.get(k)).filter((v):v is number=>v!=null) as number[];
      if(vals.length>=6) smaMap.set(keys[i], vals.reduce((a,b)=>a+b,0)/vals.length);
    }
    // YoY % a partir de niveles mensuales (evita getCpiYoY diario, más estable)
    const yoYMap = new Map<string, number>();
    for(let i=0;i<keys.length;i++){
      if(i>=12){
        const cur = cmap.get(keys[i]); const prev = cmap.get(keys[i-12]);
        if(cur!=null && prev!=null && prev!==0) yoYMap.set(keys[i], (cur/prev-1)*100);
      } else if(i>=1){
        // fallback: busca clave 12m atrás por fecha si índice no alineado (meses faltantes)
        const curMk = keys[i]; const d=new Date(curMk+'-15'); d.setFullYear(d.getFullYear()-1); const prevMk = d.toISOString().slice(0,7);
        const cur = cmap.get(curMk); const prev = cmap.get(prevMk);
        if(cur!=null && prev!=null && prev!==0) yoYMap.set(curMk, (cur/prev-1)*100);
      }
    }
    const yoYSmaMap = new Map<string, number>();
    for(let i=0;i<keys.length;i++){
      const mk=keys[i];
      if(!yoYMap.has(mk)) continue;
      const sKeys=keys.slice(Math.max(0,i-11),i+1).filter(k=> yoYMap.has(k));
      const vals=sKeys.map(k=> yoYMap.get(k)!).filter(v=> v!=null && isFinite(v));
      if(vals.length>=6) yoYSmaMap.set(mk, vals.reduce((a,b)=>a+b,0)/vals.length);
    }
    return { cpiMonthlyMap: cmap, cpiKeys: keys, cpiSma12Map: smaMap, cpiYoYMap: yoYMap, cpiYoYSma12Map: yoYSmaMap, monthLastDate: lastMap };
  }, [allCapeDates, marketHistory]);
  function ensureCaches(){ /* no-op: caches ya memoizados */ }

  function getRegimesActive(d:string, capeVal:number|null, mean3yVal:number|null): {r1:boolean,r2:boolean,r3:boolean,total:number} {
    const dd=getRegimeDetails(d, capeVal, mean3yVal);
    return {r1:dd.r1.active, r2:dd.r2.active, r3:dd.r3.active, total: (dd.r1.active?1:0)+(dd.r2.active?1:0)+(dd.r3.active?1:0)};
  }

  function getRegimeDetails(d:string, capeVal:number|null, mean3yVal:number|null){
    ensureCaches();
    const windowSize = capeView==='daily' ? 756 : capeView==='monthly' ? 36 : 3;
    const idx = allCapeDates.indexOf(d);
    // R1 — Condición Estructural 4 fases: CAPE>1.18 AND Core CPI YoY≥4.0 & >SMA12×1.20 (SMA12M YoY %)
    let r1Active=false; let r1Thr:number|null=null; let r1Ratio:number|null=null; let r1Cpi:number|null=null; let r1CpiSma12:number|null=null; let r1Armed=false;
    // Core CPI YoY % — corrige puntos→% + ffill 90d para Aug
    let r1CoreCpiYoY:number|null=null;
    {
      const curMk = d.slice(0,7);
      let y = cpiYoYMap.get(curMk) ?? null;
      if(y==null){
        let b=-1; for(let i=0;i<cpiKeys.length;i++) if(cpiKeys[i]<=curMk) b=i;
        if(b>=0) y = cpiYoYMap.get(cpiKeys[b]) ?? null;
      }
      let sma = cpiYoYSma12Map.get(curMk) ?? null;
      if(sma==null){
        let b=-1; for(let i=0;i<cpiKeys.length;i++) if(cpiKeys[i]<=curMk) b=i;
        if(b>=0) sma = cpiYoYSma12Map.get(cpiKeys[b]) ?? null;
      }
      r1Cpi = y;
      r1CpiSma12 = sma;
      r1CoreCpiYoY = y;
    }
    // fallback: si aún null por gap >90d, usa getCpiYoY directo (forward-fill último)
    if(r1Cpi==null){
      const y2 = getCpiYoY(marketHistory['CPILFESL'], d);
      if(y2!=null) r1Cpi = y2;
    }
    if(capeVal!=null && mean3yVal!=null){ r1Thr=mean3yVal*1.18; r1Ratio=capeVal/mean3yVal; const capeOk=capeVal > r1Thr; const cpiOk = r1Cpi!=null && r1CpiSma12!=null ? r1Cpi >=4.0 && r1Cpi > r1CpiSma12*1.20 : false; r1Active=capeOk && cpiOk; r1Armed=r1Active; }
    // R2 — Z(Margin/GDP) 4 fases: Fase 1 armado con memoria 6M (Z>2.0 en ÚLTIMOS 6M persiste hasta Z<0)
    let r2Active=false; let r2Mg:number|null=getMarginGdpRatio(d); let r2Mean:number|null=null; let r2Std:number|null=null; let r2Z:number|null=null;
    let r2Armed=false; let r2ArmedMonth:string|null=null; let r2ArmedDate:string|null=null; let r2DisarmedDate:string|null=null;
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
            if(z2>2.0){ found=true; r2ArmedMonth=mKey2; r2ArmedDate = monthLastDate.get(mKey2) ?? mKey2; break; }
          }
        }
        // Si estamos armados, mantenemos r2Active=true aunque Z ACTUAL baje, hasta desarme Z<0 (Fase 4) — para icono simple usamos armado
        // Desarme total: Z<0 desactiva
        if(r2Z!=null && r2Z<0){ r2Armed=false; r2ArmedMonth=null; r2ArmedDate=null; r2DisarmedDate=d; r2Active=false; }
        else if(found){ r2Armed=true; r2Active=true; r2DisarmedDate=null; }
        else { r2Armed=false; r2ArmedDate=null; r2DisarmedDate=null; r2Active=false; }
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
      r1:{active:r1Active, cape:capeVal, sma:mean3yVal, thr:r1Thr, ratio:r1Ratio, cpi:r1Cpi, cpiSma12:r1CpiSma12, armed:r1Armed},
      r2:{active:r2Active, mg:r2Mg, mean:r2Mean, std:r2Std, z:r2Z, armed:r2Armed, armedMonth:r2ArmedMonth, armedDate:r2ArmedDate, disarmedDate:r2DisarmedDate},
      r3:{active:r3Active, hy:r3Hy, p20:r3P20, complacencia:r3Complacencia, ltP20:r3LtP20, lt35:r3Lt35, r1:r1Active, r2:r2Active},
    };
  }

  useEffect(()=>{
    const load=async()=>{
      try{
        const base=getApiBase();
        const [runRes, capeRes, stratRes, bhResInit] = await Promise.all([
          fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/strategies`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`,{cache:'no-store'}),
        ]);
        if(stratRes.ok){
          const s=await stratRes.json();
          const list = Array.isArray(s)? s : [];
          // mostrar todas las estrategias para comparación dual (prioriza BH y REGIMEN1)
          const filtered = list;
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
            if(first?.id){
              const trRes=await fetch(`${base}/api/backtesting/runs/${first.id}/trades`,{cache:'no-store'});
              if(trRes.ok){ const tr=await trRes.json(); setTradesA(Array.isArray(tr)? tr : []); } else setTradesA([]);
            } else setTradesA([]);
          } else {
            setRun(null); setMetrics(null); setEquity([]); setTradesA([]);
          }
          // Segunda estrategia (B) — comparativa
          if(bhResInit.ok){
            const bhRuns=await bhResInit.json();
            const bhFirst=Array.isArray(bhRuns)?bhRuns[0]:bhRuns;
            if(bhFirst?.id){
              setBhRun(bhFirst);
              if(bhFirst.metrics) setBhMetrics(bhFirst.metrics);
              const [bhEqRes, bhTrRes]=await Promise.all([
                fetch(`${base}/api/backtesting/runs/${bhFirst.id}/equity`,{cache:'no-store'}),
                fetch(`${base}/api/backtesting/runs/${bhFirst.id}/trades`,{cache:'no-store'}),
              ]);
              if(bhEqRes.ok){
                const bheq=await bhEqRes.json();
                setBhEquity(bheq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null})));
              } else setBhEquity([]);
              if(bhTrRes.ok){ const bhtr=await bhTrRes.json(); setTradesB(Array.isArray(bhtr)? bhtr : []); } else setTradesB([]);
            } else { setBhEquity([]); setTradesB([]); }
          } else { setBhEquity([]); setTradesB([]); }
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
  },[selectedA, selectedB]);

  // Reload runs A/B sin refetch cape/marketHistory
  useEffect(()=>{
    if(!selectedA && !selectedB) return;
    const reloadRun = async()=>{
      try{
        const base=getApiBase();
        setLoading(true);
        if(equityChartApiRef.current){ try{ equityChartApiRef.current.remove(); }catch{}; equityChartApiRef.current=null; }
        setEquity([]); setBhEquity([]); setTradesA([]); setTradesB([]);
        const [r, bhR] = await Promise.all([
          fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`,{cache:'no-store'}),
        ]);
        if(r.ok){
          const runs=await r.json();
          const first=Array.isArray(runs)?runs[0]:runs;
          if(first?.id){
            setRun(first);
            if(first.metrics) setMetrics(first.metrics);
            const [eqRes, trRes]=await Promise.all([
              fetch(`${base}/api/backtesting/runs/${first.id}/equity`,{cache:'no-store'}),
              fetch(`${base}/api/backtesting/runs/${first.id}/trades`,{cache:'no-store'}),
            ]);
            if(eqRes.ok){
              const eq=await eqRes.json();
              setEquity(eq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null})));
            } else setEquity([]);
            if(trRes.ok){ const tr=await trRes.json(); setTradesA(Array.isArray(tr)? tr : []); } else setTradesA([]);
          } else { setRun(null); setMetrics(null); setEquity([]); setTradesA([]); }
        } else { setTradesA([]); }
        if(bhR.ok){
          const bhRuns=await bhR.json();
          const bhFirst=Array.isArray(bhRuns)?bhRuns[0]:bhRuns;
          if(bhFirst?.id){
            setBhRun(bhFirst);
            if(bhFirst.metrics) setBhMetrics(bhFirst.metrics);
            const [bhEqRes, bhTrRes]=await Promise.all([
              fetch(`${base}/api/backtesting/runs/${bhFirst.id}/equity`,{cache:'no-store'}),
              fetch(`${base}/api/backtesting/runs/${bhFirst.id}/trades`,{cache:'no-store'}),
            ]);
            if(bhEqRes.ok){
              const bheq=await bhEqRes.json();
              setBhEquity(bheq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null})));
            } else setBhEquity([]);
            if(bhTrRes.ok){ const bhtr=await bhTrRes.json(); setTradesB(Array.isArray(bhtr)? bhtr : []); } else setTradesB([]);
          } else { setBhEquity([]); setTradesB([]); }
        } else { setBhEquity([]); setTradesB([]); }
      }catch{} finally{ setLoading(false); }
    };
    if(strategies.length) reloadRun();
  },[selectedA, selectedB]);

    // Equity chart dual: Estrategia (teal) vs BH Baseline (gris punteado)
  useEffect(() => {
    if (!equity.length && !bhEquity.length) return;
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
        const sorted = [...equity].filter(d => d.date && d.value != null && isFinite(d.value)).sort((a,b)=> a.date.localeCompare(b.date));
        const bhSorted = [...bhEquity].filter(d => d.date && d.value != null && isFinite(d.value)).sort((a,b)=> a.date.localeCompare(b.date));
        const series = chart.addSeries(LineSeries as any, { color: '#14b8a6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, title: 'Estrategia', priceFormat: { type:'custom', formatter: (p:number)=> Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any } as any);
        const bhSeries = bhSorted.length ? chart.addSeries(LineSeries as any, { color: '#64748b', lineWidth: 1.5, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, title: 'BH SPY', priceFormat: { type:'custom', formatter: (p:number)=> Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any } as any) : null;
        const data = sorted.map(p => ({ time: p.date.slice(0,10) as any, value: Number(p.value) }));
        const bhData = bhSorted.map(p => ({ time: p.date.slice(0,10) as any, value: Number(p.value) }));
        console.log('Regimes equity data', data.length, data[0], data[data.length-1], 'BH', bhData.length);
        series.setData(data as any);
        if(bhSeries) bhSeries.setData(bhData as any);
        // Marcadores G1-G4 / Sanación — iconos grandes con emoji + colores del bosque
        const markerMeta = (g:string)=>{
          const s=g||'';
          if(s.includes('G1')) return { color: '#f97316', emoji: '⚠️', label: 'G1' }; // naranja
          if(s.includes('G2')) return { color: '#ef4444', emoji: '🚨', label: 'G2' }; // rojo
          if(s.includes('G3')) return { color: '#0ea5e9', emoji: '🎯', label: 'G3' }; // azul
          if(s.includes('G4')) return { color: '#10b981', emoji: '🚀', label: 'G4' }; // verde
          if(s.toLowerCase().includes('sanac')) return { color: '#a855f7', emoji: '💜', label: 'SAN' }; // morado
          return { color: '#94a3b8', emoji: '●', label: '●' };
        };
        const toMarkers = (trs:any[], isA:boolean)=> trs.map((tr:any)=>{
          const d=(tr.datetime || tr.date || '').slice(0,10);
          if(!d) return null;
          const g=String(tr.gatilho || tr.gatillo || tr.indicators?.gatilho || tr.reason || tr.indicators?.reason || tr.side || '');
          const m=markerMeta(g);
          // texto con emoji grande + prefijo A/B para distinguir
          const txt = `${m.emoji} ${isA?'A':'B'}:${m.label}`;
          return { time: d as any, position: isA ? 'aboveBar' as const : 'belowBar' as const, color: m.color, shape: 'circle' as const, text: txt, size: 2 } as any;
        }).filter(Boolean);
        const markersA = toMarkers(tradesA, true);
        const markersB = toMarkers(tradesB, false);
        try{
          if(markersA.length){
            if(typeof (series as any).setMarkers==='function') (series as any).setMarkers(markersA as any);
            else if(typeof createSeriesMarkers==='function') createSeriesMarkers(series as any, markersA as any);
          }
          if(bhSeries && markersB.length){
            if(typeof (bhSeries as any).setMarkers==='function') (bhSeries as any).setMarkers(markersB as any);
            else if(typeof createSeriesMarkers==='function') createSeriesMarkers(bhSeries as any, markersB as any);
          }
        }catch(e){ console.warn('markers error', e); }
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
          // BH values for same date
          const bhVal = getBhEquityForDate(iso);
          const bhPerf = bhVal!=null ? (bhVal/initialBhEquity-1)*100 : null;
          const bhCagr = bhVal!=null && days>30 ? (Math.pow(bhVal/initialBhEquity,365.25/days)-1)*100 : null;
          const diff = (bhVal!=null && val!=null) ? val - bhVal : null;
          // regime for that date
          const capeRow = capeMap.get(iso) ?? cape.find((c:any)=>String(c.date).slice(0,10)===iso);
          const capeVal = capeRow?.cape ?? null;
          const mean3yVal = capeRow?.mean3y ?? capeRow?.mean ?? null;
          const ratio = capeRow?.capeRatio ?? (mean3yVal!=null && capeVal!=null ? capeVal/mean3yVal : null);
          const regime = getRegime(iso, capeVal, ratio);
          const det = getRegimeDetails(iso, capeVal, mean3yVal);
          const {r1,r2,r3,total} = { r1: det.r1.active, r2: det.r2.active, r3: det.r3.active, total: (det.r1.active?1:0)+(det.r2.active?1:0)+(det.r3.active?1:0) };
          // indicadores semaforizados para tooltip
          const cpiVal = det.r1.cpi;
          const cpiSma = det.r1.cpiSma12;
          const cpiThr = cpiSma!=null ? cpiSma*1.20 : null;
          const zVal = det.r2.z;
          const mgVal = det.r2.mg;
          const hyVal = det.r3.hy;
          const p20Val = det.r3.p20;
          const rat = ratio;
          const thr = det.r1.thr;
          const fedVal = getClosestPrice(marketHistory['DFEDTARU'], iso);
          const dgs10Val = getClosestPrice(marketHistory['DGS10'], iso);
          const sma200Val = (()=>{ const k=iso; // aproximado: no tenemos serie 10Y SMA200 en frontend, usar null
            return null; })();
          const indSnap = { cape: capeVal, mean3y: mean3yVal, thr, ratio: rat, cpi: cpiVal, cpiSma, cpiThr, z: zVal, mg: mgVal, hy: hyVal, p20: p20Val, fed: fedVal, dgs10: dgs10Val, det };
          // buscar gatillo del día (si lo hay) para mostrar detalle completo
          const findTrade = (trs:any[])=> trs.find((tr:any)=> String(tr.datetime||tr.date||'').slice(0,10)===iso) || trs.find((tr:any)=> Math.abs(new Date(String(tr.datetime||tr.date||'').slice(0,10)).getTime() - new Date(iso).getTime()) < 86400000*2);
          const tradeA = findTrade(tradesA);
          const tradeB = findTrade(tradesB);
          const markerMetaFor = (tr:any)=>{
            if(!tr) return null;
            const g=String(tr.gatilho||tr.gatillo||tr.indicators?.gatilho||tr.reason||tr.indicators?.reason||'');
            if(g.includes('G1')) return { emoji:'⚠️', color:'text-orange-400', bg:'bg-orange-500/20 border-orange-500/30', label:'G1 Alerta' };
            if(g.includes('G2')) return { emoji:'🚨', color:'text-red-400', bg:'bg-red-500/20 border-red-500/30', label:'G2 Venta Total' };
            if(g.includes('G3')) return { emoji:'🎯', color:'text-sky-400', bg:'bg-sky-500/20 border-sky-500/30', label:'G3 Asalto' };
            if(g.includes('G4')) return { emoji:'🚀', color:'text-emerald-400', bg:'bg-emerald-500/20 border-emerald-500/30', label:'G4 Confirmación' };
            if(g.toLowerCase().includes('sanac')) return { emoji:'💜', color:'text-purple-400', bg:'bg-purple-500/20 border-purple-500/30', label:'Sanación' };
            return { emoji:'●', color:'text-slate-400', bg:'bg-slate-700 border-slate-600', label: g.slice(0,12) };
          };
          const metaA = tradeA ? markerMetaFor(tradeA) : null;
          const metaB = tradeB ? markerMetaFor(tradeB) : null;
          const chosenMeta = metaA || metaB;
          const rect = el.getBoundingClientRect();
          const cw = rect?.width ?? 600;
          const tx = Math.max(8, Math.min(param.point.x + 16, cw - 340));
          const ty = Math.max(8, Math.min(param.point.y - 140, 360));
          setEquityTooltip({x:tx,y:ty,date:iso,value:val,bhValue:bhVal,perf,bhPerf,diff,cagr,bhCagr,regime,drawdown:dd, r1,r2,r3,total, tradeA, tradeB, markerMeta: chosenMeta, ind: indSnap} as any);
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
  }, [equity, bhEquity, cape, marketHistory, capeView, tradesA, tradesB]);

  const equityMap = useMemo(()=>{ const m=new Map<string,number>(); for(const e of equity) m.set(e.date, Number(e.value)); return m; }, [equity]);
  const equityDrawdownMap = useMemo(()=>{ const m=new Map<string,number>(); for(const e of equity) if(e.drawdown!=null) m.set(e.date, Number(e.drawdown)); return m; }, [equity]);
  const initialEquity = useMemo(()=> equity.length ? Number(equity[0].value) : 100000, [equity]);
  const bhEquityMap = useMemo(()=>{ const m=new Map<string,number>(); for(const e of bhEquity) m.set(e.date, Number(e.value)); return m; }, [bhEquity]);
  const capeMap = useMemo(()=>{ const m=new Map<string,any>(); for(const c of cape) m.set(String(c.date).slice(0,10), c); return m; }, [cape]);
  const initialBhEquity = useMemo(()=> bhEquity.length ? Number(bhEquity[0].value) : 100000, [bhEquity]);
  const getBhEquityForDate = useCallback((iso:string)=> getClosestPrice(bhEquityMap, iso) ?? getRecentPrice(bhEquityMap, iso), [bhEquityMap]);
  const getEquityForDate = useCallback((iso:string)=> getClosestPrice(equityMap, iso) ?? getRecentPrice(equityMap, iso), [equityMap]);
  const getDrawdownForDate = useCallback((iso:string)=> getClosestPrice(equityDrawdownMap, iso), [equityDrawdownMap]);
  const [equityTooltip, setEquityTooltip] = useState<null|{x:number,y:number,date:string,value:number|null,bhValue:number|null,perf:number|null,bhPerf:number|null,diff:number|null,cagr:number|null,bhCagr:number|null,regime:string,drawdown:number|null,r1?:boolean,r2?:boolean,r3?:boolean,total?:number, tradeA?:any, tradeB?:any, markerMeta?:any, ind?:any}>(null);
  const [tableTip, setTableTip] = useState<null|{x:number,y:number,node:React.ReactNode}>(null);

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
              <div className="text-xs font-semibold text-slate-300">Estrategias — comparativa dual</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-teal-400 font-semibold mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block"></span> A — Estrategia</div>
                  <select value={selectedA} onChange={e=>setSelectedA(e.target.value)} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-teal-500/30 text-xs text-slate-200">
                    {strategies.map((s:any)=> <option key={'a-'+s.code} value={s.code}>{s.code} — {s.name}</option>)}
                    { !strategies.find((s:any)=>s.code===selectedA) && <option value={selectedA}>{selectedA}</option>}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block"></span> B — Base</div>
                  <select value={selectedB} onChange={e=>setSelectedB(e.target.value)} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200">
                    {strategies.map((s:any)=> <option key={'b-'+s.code} value={s.code}>{s.code} — {s.name}</option>)}
                    { !strategies.find((s:any)=>s.code===selectedB) && <option value={selectedB}>{selectedB}</option>}
                  </select>
                </div>
              </div>
            </div>
            {loading ? (
              <div className="mt-2 h-16 bg-slate-700/30 rounded animate-pulse" />
            ) : stratMetrics ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Final <span className="text-teal-300">Estrat</span></div><div className="text-teal-300 font-bold">${Number(stratMetrics.final_value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</div><div className="text-slate-500 text-[10px]">{run ? `${String(run.startDate).slice(0,10)} → ${String(run.endDate).slice(0,10)}` : '—'} · {(stratMetrics.num_trades ?? 0)} trades</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Final <span className="text-slate-400">BH</span></div><div className="text-slate-300 font-bold">{bhMetrics ? `$${Number(bhMetrics.finalValue ?? bhMetrics.final_value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</div><div className="text-slate-500 text-[10px]">CAGR {bhMetrics ? (Number(bhMetrics.cagr)*100).toFixed(2)+'%' : '—'} · vs BH {bhMetrics && stratMetrics ? `${((stratMetrics.final_value/Number(bhMetrics.finalValue ?? bhMetrics.final_value)-1)*100).toFixed(1)}%` : '—'}</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">CAGR Estrat</div><div className="text-emerald-400 font-bold">{(stratMetrics.cagr*100).toFixed(2)}%</div><div className="text-slate-500 text-[10px]">Sharpe {Number(stratMetrics.sharpe).toFixed(2)} · DD {(Number(stratMetrics.max_drawdown)*100).toFixed(1)}% · BH {(bhMetrics ? (Number(bhMetrics.cagr)*100).toFixed(2)+'%' : '—')}</div></div>
                <div className="bg-slate-900 rounded p-2 border border-slate-800"><div className="text-slate-500">Δ vs BH</div><div className={bhMetrics && stratMetrics.final_value >= Number(bhMetrics.finalValue ?? bhMetrics.final_value) ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{bhMetrics ? `${stratMetrics.final_value >= Number(bhMetrics.finalValue ?? bhMetrics.final_value) ? '+' : ''}$${(stratMetrics.final_value - Number(bhMetrics.finalValue ?? bhMetrics.final_value)).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}` : '—'}</div><div className="text-slate-500 text-[10px]">{bhMetrics ? `${((stratMetrics.total_return - Number(bhMetrics.totalReturn ?? bhMetrics.total_return))*100).toFixed(1)}pp outperf` : '—'}</div></div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-2">No se encontró run {selectedA} / {selectedB}</div>
            )}
          </div>
        </div>
      </div>

      {!loading && equity.length > 0 && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold text-slate-100">Equity — <span className="text-teal-300">{run?.strategy?.code || selectedA}</span> <span className="text-slate-500">vs</span> <span className="text-slate-400">{bhRun?.strategy?.code || selectedB}</span> {run?.startDate ? `· ${String(run.startDate).slice(0,10)}→${String(run.endDate).slice(0,10)}` : ''} — {Math.max(equity.length,bhEquity.length).toLocaleString('en-US')} pts · escala log</h3>
              <div className="flex items-center gap-2 mt-1 text-xs font-mono"><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-teal-400 inline-block"></span> Estrategia</span><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block border-dashed border-t border-slate-500"></span> BH</span></div>
            </div>
            <span className="text-xs font-mono text-slate-400 text-right">{equity[0]?.date.slice(0,4)} → {equity[equity.length-1]?.date.slice(0,10)}<br/><span className="text-teal-300">{((equity[equity.length-1]?.value/100000-1)*100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}% ${equity[equity.length-1] ? '$'+Number(equity[equity.length-1].value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}</span> <span className="text-slate-500">vs</span> <span className="text-slate-400">{bhEquity.length ? `${((bhEquity[bhEquity.length-1]?.value/100000-1)*100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}% $${Number(bhEquity[bhEquity.length-1].value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span> {bhEquity.length && equity.length ? (<span className={Number(equity[equity.length-1].value) >= Number(bhEquity[bhEquity.length-1].value) ? 'text-emerald-400' : 'text-red-400'}> Δ {(Number(equity[equity.length-1].value)-Number(bhEquity[bhEquity.length-1].value)).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})} ({(((Number(equity[equity.length-1].value)/Number(bhEquity[bhEquity.length-1].value)-1)*100).toFixed(1))}%)</span>) : null}</span>
          </div>
          <div className="relative w-full h-[360px] overflow-visible">
            <div ref={equityChartRef} id="regimes-equity-chart" className="w-full h-full relative z-0" />
            {equityTooltip && (
              <div className="absolute z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[300px] max-w-[360px]" style={{ left: equityTooltip.x, top: equityTooltip.y }}>
                <div className="font-semibold text-slate-100 border-b border-slate-700 pb-1.5 mb-1.5">{new Date(equityTooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} <span className="font-normal text-slate-400">· {equityTooltip.date}</span> <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] ${equityTooltip.regime==='Stress'?'bg-red-500/20 text-red-400 border-red-500/30':equityTooltip.regime==='Bull'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>{equityTooltip.regime}</span></div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r1 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Múltiplos Altos">📈</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r2 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Alta Deuda">🏦</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r3 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Complacencia">😴</span>
                  <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-bold border ${equityTooltip.total===3?'bg-red-500/20 text-red-300 border-red-500/30':equityTooltip.total===2?'bg-orange-500/20 text-orange-300 border-orange-500/30':equityTooltip.total===1?'bg-amber-500/20 text-amber-300 border-amber-500/30':'bg-slate-700 text-slate-400 border-slate-600'}`}>{equityTooltip.total ?? 0}/3 activos</span>
                </div>
                <div className="grid grid-cols-1 gap-1 font-mono text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-400">Estrategia</span><span className="text-teal-300 font-bold">{equityTooltip.value!=null ? `$${Number(equityTooltip.value).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">BH Base</span><span className="text-slate-300 font-bold">{(equityTooltip as any).bhValue!=null ? `$${Number((equityTooltip as any).bhValue).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Δ (val)</span><span className={(equityTooltip as any).diff!=null && (equityTooltip as any).diff>=0 ? 'text-emerald-400' : 'text-red-400'}>{(equityTooltip as any).diff!=null ? `${(equityTooltip as any).diff>=0?'+':''}$${Number((equityTooltip as any).diff).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Perf. Estrat</span><span className={equityTooltip.perf!=null && equityTooltip.perf>=0 ? 'text-emerald-400' : 'text-red-400'}>{equityTooltip.perf!=null ? `${equityTooltip.perf>=0?'+':''}${equityTooltip.perf.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Perf. BH</span><span className={(equityTooltip as any).bhPerf!=null && (equityTooltip as any).bhPerf>=0 ? 'text-emerald-400' : 'text-slate-400'}>{(equityTooltip as any).bhPerf!=null ? `${(equityTooltip as any).bhPerf>=0?'+':''}${(equityTooltip as any).bhPerf.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">CAGR Estrat</span><span className="text-sky-300">{equityTooltip.cagr!=null ? `${equityTooltip.cagr.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">CAGR BH</span><span className="text-slate-400">{(equityTooltip as any).bhCagr!=null ? `${(equityTooltip as any).bhCagr.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">DD</span><span className="text-orange-300">{equityTooltip.drawdown!=null ? `${(equityTooltip.drawdown*100).toFixed(2)}%` : '—'}</span></div>
                  {/* Indicadores semaforizados */}
                  {(equityTooltip as any).ind && (
                    <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Indicadores del día</div>
                      {(()=>{ const ind=(equityTooltip as any).ind; const det=ind.det; const fmt=(v:any, d=2)=> v!=null && isFinite(v) ? Number(v).toFixed(d) : '—'; const ratio=ind.ratio; const thr=ind.thr; const ratioColor = ratio==null ? 'text-slate-500' : ratio>=1.18 ? 'text-red-400 bg-red-500/10 border-red-500/30' : ratio>=1.05 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; const cpiOk = ind.cpi!=null && ind.cpiSma!=null && ind.cpi>=4.0 && ind.cpi > (ind.cpiThr ?? 1e9); const cpiColor = ind.cpi==null ? 'text-slate-500' : cpiOk ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'; const zColor = ind.z==null ? 'text-slate-500' : ind.z>=2.0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : ind.z>=1.0 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : ind.z<0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-300 bg-slate-700/30 border-slate-600'; const hyOk = ind.hy!=null && (ind.hy < (ind.p20 ?? 1e9) || ind.hy < 3.5); const hyColor = ind.hy==null ? 'text-slate-500' : hyOk ? 'text-violet-300 bg-violet-500/10 border-violet-500/20' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'; return (
                        <>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${ratioColor}`}><span className="text-slate-400">CAPE</span><span className="font-mono font-bold">{fmt(ind.cape)} / SMA3y {fmt(ind.mean3y)} → {fmt(thr)} · {ratio!=null? ratio.toFixed(3)+'x': '—'} {ratio!=null ? (ratio>=1.18 ? '🔴' : ratio>=1.05 ? '🟡' : '🟢') : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${cpiColor}`}><span className="text-slate-400">Core CPI YoY</span><span className="font-mono font-bold">{ind.cpi!=null? fmt(ind.cpi)+'%':'—'} vs SMA12 {ind.cpiSma!=null? fmt(ind.cpiSma)+'%':'—'} ×1.20={ind.cpiThr!=null? fmt(ind.cpiThr)+'%':'—'} {cpiOk ? '🔴' : ind.cpi!=null ? '🟢' : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${zColor}`}><span className="text-slate-400">Z Mg/GDP</span><span className="font-mono font-bold">{ind.z!=null? fmt(ind.z,2):'—'} (Mg {ind.mg!=null? fmt(ind.mg)+'%':'—'}) {ind.z!=null ? (ind.z>=2.0 ? '🔴 armado' : ind.z<0 ? '🟢 desarmado' : '🟡') : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${hyColor}`}><span className="text-slate-400">HY OAS</span><span className="font-mono font-bold">{ind.hy!=null? fmt(ind.hy)+'%':'—'} vs P20 {ind.p20!=null? fmt(ind.p20)+'%':'—'} {hyOk ? '🟣 complacencia' : '🟢'}</span></div>
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500"><span>FED {ind.fed!=null? fmt(ind.fed)+'%':'—'} · 10Y {ind.dgs10!=null? fmt(ind.dgs10)+'%':'—'}</span><span className={det.r1.active||det.r2.active||det.r3.active ? 'text-amber-300' : 'text-slate-500'}>{det.r1.active||det.r2.active||det.r3.active ? '⚠️ régimen activo' : '✓ sin régimen'}</span></div>
                        </>
                      ); })()}
                    </div>
                  )}
                  {(equityTooltip as any).tradeA || (equityTooltip as any).tradeB ? (
                    <div className="mt-2 pt-2 border-t border-slate-700 space-y-1.5">
                      {(equityTooltip as any).tradeA && (
                        <div className={`rounded-md border px-2 py-1.5 ${(equityTooltip as any).markerMeta?.bg || 'bg-slate-700/50 border-slate-600'}`}>
                          <div className={`flex items-center gap-1.5 font-semibold ${(equityTooltip as any).markerMeta?.color || 'text-slate-200'}`}>
                            <span>{(equityTooltip as any).markerMeta?.emoji}</span> <span>A — {(equityTooltip as any).tradeA.gatilho || (equityTooltip as any).tradeA.gatillo || (equityTooltip as any).tradeA.side}</span>
                            <span className="ml-auto text-[10px] font-mono text-slate-400">{(equityTooltip as any).tradeA.side} {Number((equityTooltip as any).tradeA.size).toLocaleString('en-US')} × ${Number((equityTooltip as any).tradeA.price).toFixed(2)}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 mt-1">
                            <span className={(equityTooltip as any).tradeA.side==='SELL' ? 'text-red-300' : 'text-emerald-300'}>{(equityTooltip as any).tradeA.side==='SELL' ? 'Vende' : 'Compra'} {Number((equityTooltip as any).tradeA.size).toLocaleString('en-US')} @ ${Number((equityTooltip as any).tradeA.price).toFixed(2)} = ${Number((equityTooltip as any).tradeA.value || Number((equityTooltip as any).tradeA.size)*Number((equityTooltip as any).tradeA.price)).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                            <span className="text-slate-500"> · {(equityTooltip as any).tradeA.target_pct!=null ? `→ ${(Number((equityTooltip as any).tradeA.target_pct)*100).toFixed(0)}% riesgo` : ''}</span>
                          </div>
                          {((equityTooltip as any).tradeA.reason || (equityTooltip as any).tradeA.indicators?.reason) && <div className="text-[10px] leading-tight mt-1 text-slate-400 break-words whitespace-normal">{String((equityTooltip as any).tradeA.reason || (equityTooltip as any).tradeA.indicators?.reason).slice(0,220)}</div>}
                        </div>
                      )}
                      {(equityTooltip as any).tradeB && (equityTooltip as any).tradeB !== (equityTooltip as any).tradeA && (
                        <div className="rounded-md border px-2 py-1.5 bg-slate-700/30 border-slate-600">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                            <span>⬜</span> <span>B — {(equityTooltip as any).tradeB.gatilho || (equityTooltip as any).tradeB.gatillo || (equityTooltip as any).tradeB.side}</span>
                            <span className="ml-auto text-[10px] font-mono text-slate-400">{(equityTooltip as any).tradeB.side} {Number((equityTooltip as any).tradeB.size).toLocaleString('en-US')} × ${Number((equityTooltip as any).tradeB.price).toFixed(2)}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-1">{(equityTooltip as any).tradeB.side==='SELL' ? 'Vende' : 'Compra'} {Number((equityTooltip as any).tradeB.size).toLocaleString('en-US')} → ${Number((equityTooltip as any).tradeB.value || 0).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-between"><span className="text-slate-500">Sharpe (total)</span><span className="text-violet-300">{stratMetrics?.sharpe!=null ? Number(stratMetrics.sharpe).toFixed(2) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">MaxDD (total)</span><span className="text-red-300">{stratMetrics?.max_drawdown!=null ? `${(Number(stratMetrics.max_drawdown)*100).toFixed(1)}%` : '—'}</span></div>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 text-xs items-center">
            <span className="text-slate-500">Scroll/arrastra para zoom</span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span> G1</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> G2</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span> G3</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> G4</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Sanación</span>
            <span className="text-slate-600">·</span>
            <span className="text-teal-400">A: arriba</span><span className="text-slate-400">B: abajo</span>
            {tradesA.length? <span className="text-slate-500">· A {tradesA.length} gatillos</span>: null}
            {tradesB.length? <span className="text-slate-500">· B {tradesB.length} gatillos</span>: null}
          </div>
        </div>
      )}

      {/* Tabla Daily / Monthly / Yearly con mismos indicadores que Backtesting */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">Evolución — {capeView==='daily'?'Daily':capeView==='monthly'?'Monthly':'Yearly'} <span className="text-slate-500 font-normal text-xs">· {sorted.length.toLocaleString('en-US')} filas{filterYear?` · ${filterYear}`:''}</span></h3>
          <div className="flex items-center gap-2">
            <select value={filterYear} onChange={e=>{ setFilterYear(e.target.value); if(scrollRef.current) scrollRef.current.scrollTop=0; }} className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-teal-500">
              <option value="">Todos ({rowsView.length.toLocaleString('en-US')})</option>
              {availableYears.map(y=>{ const c=rowsView.filter((r:any)=> String(r.date).slice(0,4)===y).length; return <option key={y} value={y}>{y} · {c.toLocaleString('en-US')} filas</option> })}
            </select>
            <div className="flex gap-1">
              {(['daily','monthly','yearly'] as const).map(v=>(
                <button key={v} onClick={()=>{ setCapeView(v); setFilterYear(''); }} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-teal-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Mismos indicadores que tabla Backtesting (SP500, Nasdaq, TQQQ, FED, 2Y/10Y/30Y, HY OAS, CAPE, CPI YoY, GDP, Margin/GDP) + Régimen.</p>
        <div ref={scrollRef} className="overflow-auto max-h-[520px] border border-slate-800 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr className="text-slate-400">
                <th className="p-2 text-left sticky left-0 bg-slate-900">Fecha</th>
                <th className="p-2 text-center" title="Múltiplos Altos 4 Fases — F0 Armado: CAPE>1.18 & Core CPI YoY≥4.0 & >SMA12×1.20 (12M YoY %) — G1: Fed>0 o 10Y>1.10 (30%) — G2: (FED>G1 & CPI>1.30 y crec) OR (CPI>4.5 & >CPI_G1 y crec) + hike 3m & SPY<SMA50 (70%) — G3: 3M caídas o Pausa2M (35%) — G4: CPI<1.05 o Fed<0 + SMA50 (65%) — Sanación CPI<1.05+SMA50">📈</th>
                <th className="p-2 text-center" title="Alta Deuda/PIB 4 Fases — Fase 1 Armado: Z>2.0 en 6M (con memoria) — Fase 2 G1: ROC3M<0+SMA50 vende 30% — G2: ROC3M<−σ24M vende 70% — F3 Sanación: >SMA50+ROC>0 — F4 Desarme: Z<0">🏦</th>
                <th className="p-2 text-center" title="Complacencia OAS: HY<P20 OR <3.5% — Independiente — Qué mide: Ceguera al riesgo (bonos) — Gatillo: Salto spreads +50bps — Fórmula: HY<P20 OR HY<3.5%  ·  Ventana 36M  (independiente de R1/R2) — Ej: 2007 <3% →2008 >11%">😴</th>
                <th className="p-2 text-right text-teal-300">Port. Estrat</th>
                <th className="p-2 text-right text-slate-400">BH</th>
                <th className="p-2 text-right">Δ $</th>
                <th className="p-2 text-right">Δ %</th>
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
                <th className="p-2 text-right">Core CPI YoY</th>
                <th className="p-2 text-right">SMA12 YoY</th>
                <th className="p-2 text-right">Umbral SMA×1.20</th>
                <th className="p-2 text-right">CPI YoY</th>
                <th className="p-2 text-right">FED</th>
                <th className="p-2 text-right">10Y</th>
              </tr>
            </thead>
            <tbody>
              {paddingTop>0 && (<tr><td colSpan={24} style={{ height: paddingTop }} /></tr>)}
              {virtualItems.map((virtualRow:any)=>{
                const r:any = sorted[virtualRow.index];
                const idx = virtualRow.index;
                const d=String(r.date||'').slice(0,10);
                const isLast= false;
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
                const bhVal = getBhEquityForDate(d);
                const perf = portVal!=null ? (portVal/initialEquity-1)*100 : null;
                const bhPerf = bhVal!=null ? (bhVal/initialBhEquity-1)*100 : null;
                const days = (new Date(d).getTime() - new Date(equity[0]?.date || d).getTime())/86400000;
                const cagrVal = portVal!=null && days>30 ? (Math.pow(portVal/initialEquity, 365.25/days)-1)*100 : null;
                const ddVal = getDrawdownForDate(d);
                const diffVal = (portVal!=null && bhVal!=null) ? portVal - bhVal : null;
                const diffPct = (portVal!=null && bhVal!=null && bhVal!==0) ? (portVal/bhVal-1)*100 : null;
                return (
                  <tr key={r.date} ref={isLast? observerRef : null} className="hover:bg-slate-800/40 border-t border-slate-800">
                    <td className="p-2 font-mono sticky left-0 bg-slate-900 text-slate-200">{capeView==='yearly'? d.slice(0,4): capeView==='monthly'? d.slice(0,7): d}</td>
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
                    <td className="p-2 text-center"><span className={icon(d1.active,'bg-amber-500/20 text-amber-300 border-amber-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const c=d1.cape, s=d1.sma, th=d1.thr; const isRed = d1.active; const cpi=(d1 as any).cpi; const cpiSma=(d1 as any).cpiSma12; const cpiThr=cpiSma!=null?cpiSma*1.20:null; const capeOk=c!=null&&th!=null&&c>th; const cpiOk=cpi!=null&&cpiSma!=null&&(cpi>=4.0)&&cpi>cpiThr!; const ratioVal=(d1 as any).ratio; const faltCape = th!=null && c!=null ? (th - c).toFixed(2) : '—'; const faltCpi = cpiThr!=null && cpi!=null ? (cpiThr - cpi).toFixed(2)+'pp' : '—'; const node=isRed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-red-400">📈 MÚLTIPLOS ALTOS ON ✓ — BOSQUE SECO (F0 ARMADO) <span className="text-red-400" style={{fontSize:'11px'}}>·  +18% CAPE &   +20% CPI YoY</span></div><div className="font-mono text-[12px]">CAPE <span className="text-red-300 font-black">{fmt(c)}</span> <span className="text-red-400">&gt;</span> UMBRAL <span className="text-slate-100 font-bold">{fmt(th)}</span> <span className="text-slate-400">(=SMA</span> <span className="text-slate-200">{fmt(s)}</span><span className="text-slate-400">×1.18)</span> <span className="text-slate-500">ratio {ratioVal!=null?ratioVal.toFixed(3):'—'}×</span></div><div className="font-mono text-[12px]">CORE CPI <span className="text-red-300 font-black">{cpi!=null?cpi.toFixed(2)+'%':'—'}</span> <span className="text-red-400">&gt;</span> UMBRAL <span className="text-slate-100 font-bold">{cpiThr!=null?cpiThr.toFixed(2)+'%':'—'}</span> <span className="text-slate-400">(SMA12 {cpiSma!=null?cpiSma.toFixed(2)+'%':'—'}×1.20)</span> <span className="text-red-400">+{(cpi!=null&&cpiThr!=null?(cpi-cpiThr).toFixed(2)+'pp':'—')}</span></div><div className="text-[11px]"><span className="text-red-400">F0 ARMADO:</span> <span className="text-red-300"> +18% CAPE Y   +20% CPI YoY — DETIENE COMPRAS</span></div><div className="text-[11px] text-slate-400 border-t border-slate-700 pt-1.5 mt-1 leading-tight"><span className="text-orange-300">G1 30%:</span> ΔFED&gt;0 O 10Y&gt;SMA200×1.10 <span className="text-slate-500">·</span> <span className="text-red-300">G2 70%:</span> FED acum≥0.50% en 60d &amp; CPI YoY&gt;1.30 y creciente <span className="text-slate-500">·</span> <span className="text-sky-300">G3 35%:</span> CPI 3M↓ O PAUSA 2M <span className="text-slate-500">·</span> <span className="text-emerald-300">G4 65%:</span> (CPI&lt;1.05 O FED&lt;0) & SMA50</div><div className="text-[11px]"><span className="text-emerald-400">SANACIÓN:</span> <span className="text-emerald-300">TRAS G1 (70/30) SIN G2 + CPI&lt;1.05 & SMA50 → 100%</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-emerald-400">📈 MÚLTIPLOS ALTOS OFF — DESARMADO <span className="text-emerald-400" style={{fontSize:'11px'}}>· BOSQUE NO SECO — {d} · {capeOk?'CAPE OK':'CAPE NO'} / {cpiOk?'CPI OK':'CPI NO'}</span></div><div className="font-mono text-[12px]">CAPE <span className={capeOk?"text-red-300 font-bold":"text-emerald-300 font-black"}>{fmt(c)}</span> <span className={capeOk?"text-red-400":"text-slate-500"}>{capeOk?">":"≤"}</span> UMBRAL <span className="text-slate-100 font-bold">{fmt(th)}</span> <span className="text-slate-400">(=SMA</span> <span className="text-slate-200">{fmt(s)}</span><span className="text-slate-400">×1.18)</span> <span className={capeOk?"text-red-400":"text-emerald-400"}>{capeOk?`+${(c!-th!).toFixed(2)}`:`faltó ${faltCape}`}</span></div><div className="font-mono text-[12px]">CORE CPI <span className={cpiOk?"text-red-300 font-bold":"text-emerald-300 font-black"}>{cpi!=null?cpi.toFixed(2)+'%':'—'}</span> <span className={cpiOk?"text-red-400":"text-slate-500"}>{cpiOk?">":"≤"}</span> UMBRAL <span className="text-slate-100 font-bold">{cpiThr!=null?cpiThr.toFixed(2)+'%':'—'}</span> <span className="text-slate-400">(SMA12 {cpiSma!=null?cpiSma.toFixed(2)+'%':'—'}×1.20)</span> <span className={cpiOk?"text-red-400":"text-emerald-400"}>{cpiOk?`+${(cpi!-cpiThr!).toFixed(2)}pp`:`faltó ${faltCpi}`}</span></div><div className="text-[11px]"><span className="text-emerald-400">ESTADO:</span> <span className="text-emerald-300">DESARMADO — {!capeOk && !cpiOk ? "CAPE Y CPI DENTRO DE MEDIA" : !capeOk ? `CAPE DENTRO DE MEDIA (faltó ${faltCape})` : `CPI DENTRO DE MEDIA (faltó ${faltCpi})`} — F0 NO ARMADO</span></div><div className="text-[11px] text-slate-500">F0: CAPE &gt; SMA36M×1.18 AND Core CPI YoY≥4.0 & &gt;SMA12 YoY×1.20 · {d}</div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d1.active?'📈':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d2.active,'bg-sky-500/20 text-sky-300 border-sky-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const isArmed=d2.active; const isDesarme=d2.z!=null && d2.z<0; const node=isArmed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-sky-400">🏦 ALTA DEUDA ON ✓ — ARMADO (FASE 1) <span className="text-sky-400" style={{fontSize:'11px'}}>· MEMORIA 6M</span></div><div>Z ACTUAL <span className={(d2.z??0)>2?"text-red-300 font-black":"text-sky-300 font-black"}>{fmt(d2.z,2)}</span> <span className="text-sky-400">— ARMADO POR</span> <span className="text-sky-300 font-bold">Z&gt;2.0 EN {(d2 as any).armedMonth ?? 'ÚLTIMOS 6M'}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{fmt(d2.mg)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{fmt(d2.mean)}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{fmt(d2.std)}</span><span className="text-slate-400">=</span><span className="text-sky-300 font-black">{fmt(d2.z,2)}</span> <span className="text-sky-400 font-bold">— PERSISTE HASTA Z&lt;0 (FASE 4)</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-emerald-400">🏦 ALTA DEUDA OFF — {isDesarme?'DESARMADO (FASE 4)':'NO ARMADO'} <span className="text-emerald-400" style={{fontSize:'11px'}}>{isDesarme?`· DESARMADO EL ${(d2 as any).disarmedDate ?? d} — Z<0 PURGA COMPLETA`:'· SIN Z>2.0 EN 6M'}</span></div><div>Z ACTUAL <span className="text-emerald-400 font-bold">{fmt(d2.z,2)}</span> <span className="text-slate-500">≤ 2.0</span></div><div className="text-[11px]"><span className="text-emerald-400">ESTADO:</span> <span className="text-emerald-300">{isDesarme?'DESARMADO — Z<0 DESACTIVA (FASE 4)':'NO ARMADO — SIN PELIGRO SISTÉMICO'}</span></div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d2.active?'🏦':'⚪'}</span></td>
                    <td className="p-2 text-center"><span className={icon(d3.active,'bg-violet-500/20 text-violet-300 border-violet-500/30','bg-slate-800 text-slate-500 border-slate-700')} onMouseEnter={(e)=>{ const isRed=d3.active; const node=isRed?(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-red-400">😴 COMPLACENCIA ON ✓ — DISPARADO</div><div>HY OAS <span className="text-red-300 font-black">{fmt(d3.hy)}%</span> <span className="text-slate-400">· P20</span> <span className="text-slate-300 font-bold">{fmt(d3.p20)}%</span></div></div>):(<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-emerald-400">😴 COMPLACENCIA OFF — DESARMADO</div><div>HY OAS <span className="text-emerald-300 font-bold">{fmt(d3.hy)}%</span> <span className="text-slate-400">· P20</span> <span className="text-slate-300 font-bold">{fmt(d3.p20)}%</span></div><div className="text-[11px]"><span className="text-emerald-400">ESTADO:</span> <span className="text-emerald-300">DESARMADO — SIN COMPLACENCIA</span></div></div>); showTip(e,node); }} onMouseLeave={hideTip} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{d3.active?'😴':'⚪'}</span></td>
                    </>); })()}
                    <td className="p-2 text-right font-mono text-teal-300">{portVal!=null ? `$${Number(portVal).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</td>
                    <td className="p-2 text-right font-mono text-slate-400">{bhVal!=null ? `$${Number(bhVal).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${diffVal==null?'text-slate-500':diffVal>=0?'text-emerald-400':'text-red-400'}`}>{diffVal!=null ? `${diffVal>=0?'+':''}$${Math.abs(diffVal).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0})}` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${diffPct==null?'text-slate-500':diffPct>=0?'text-emerald-400':'text-red-400'}`}>{diffPct!=null ? `${diffPct>=0?'+':''}${diffPct.toFixed(1)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${perf==null?'text-slate-500':perf>=0?'text-emerald-400':'text-red-400'}`}>{perf!=null ? `${perf>=0?'+':''}${perf.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${cagrVal==null?'text-slate-500':cagrVal>=0?'text-emerald-300':'text-red-300'}`}>{cagrVal!=null ? `${cagrVal.toFixed(2)}%` : '—'}</td>
                    <td className={`p-2 text-right font-mono ${ddVal==null?'text-slate-500':'text-orange-300'}`}>{ddVal!=null ? `${(ddVal*100).toFixed(2)}%` : (perf!=null && perf<0 ? `${perf.toFixed(2)}%` : '—')}</td>
                    <td className="p-2 text-right font-mono text-sky-300">{spx? `$${Number(spx).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}`:'—'}</td>
                    <td className="p-2 text-right font-mono text-amber-300">{capeVal?.toFixed(2) ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{mean3yVal?.toFixed(2) ?? '—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold rounded ${ratioColor}`}>{ratio!=null? `${ratio.toFixed(3)}X`:'—'}</td>
                    <td className="p-2 text-right font-mono text-orange-300">{hy!=null? `${hy.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgColor}`}>{mg!=null? `${mg.toFixed(2)}%`:'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold border rounded ${mgZColor} cursor-help`} onMouseEnter={(e)=>{ const n= mgZ!=null ? (detRow.r2.active ? (<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-sky-400">ARMADO Fase 1 — Z ACTUAL <span className="text-sky-400">{mgZ.toFixed(2)}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{mg?.toFixed(2)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{detRow.r2.mean?.toFixed(2) ?? '—'}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{detRow.r2.std?.toFixed(2) ?? '—'}</span><span className="text-slate-400">=</span><span className="text-sky-300 font-black">{mgZ.toFixed(2)}</span> <span className="text-sky-400">— ARMADO POR Z&gt;2.0 EL {(detRow.r2 as any).armedDate ?? (detRow.r2 as any).armedMonth ?? 'ÚLTIMOS 6M'} — PERSISTE HASTA Z&lt;0</span></div></div>) : (<div className="space-y-1.5 text-left uppercase tracking-wide leading-tight text-slate-200"><div className="font-semibold text-emerald-400">{(detRow.r2 as any).disarmedDate ? `DESARMADO EL ${(detRow.r2 as any).disarmedDate}` : 'NO ARMADO'} — Z ACTUAL <span className="text-emerald-400">{mgZ.toFixed(2)}</span></div><div className="font-mono text-[11px]">Z=(<span className="text-slate-200 font-bold">{mg?.toFixed(2)}</span><span className="text-slate-400">−</span><span className="text-slate-300">{detRow.r2.mean?.toFixed(2) ?? '—'}</span><span className="text-slate-400">)/</span><span className="text-slate-300">{detRow.r2.std?.toFixed(2) ?? '—'}</span><span className="text-slate-400">=</span><span className="text-emerald-300 font-black">{mgZ.toFixed(2)}</span> <span className="text-slate-500">{(detRow.r2 as any).disarmedDate ? `· DESARMADO EL ${(detRow.r2 as any).disarmedDate} — Z<0` : '· NINGÚN Z>2.0 EN 6M'}</span></div><div className="text-[11px]"><span className="text-emerald-400">ESTADO:</span> <span className="text-emerald-300">DESARMADO — SIN PELIGRO SISTÉMICO</span></div></div>)) : (<div className="text-slate-400">Z SIN VENTANA</div>); const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip({x:r.left+r.width/2, y:r.top, node:n}); }} onMouseLeave={()=>setTableTip(null)} onMouseMove={(e)=>{ const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setTableTip(prev=> prev? {...prev, x:r.left+r.width/2, y:r.top}:prev); }}>{mgZ!=null? mgZ.toFixed(2):'—'}</td>
                    <td className={`p-2 text-right font-mono font-semibold ${detRow.r1.cpi!=null && detRow.r1.cpiSma12!=null && detRow.r1.cpi! >=4.0 && detRow.r1.cpi! > detRow.r1.cpiSma12!*1.20 ? 'text-red-300 bg-red-500/10' : detRow.r1.cpi!=null ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-500'} cursor-help`} title={`Core CPI YoY ${detRow.r1.cpi?.toFixed(2) ?? '—'}% vs SMA12 YoY ${detRow.r1.cpiSma12?.toFixed(2) ?? '—'}%×1.20=${detRow.r1.cpiSma12!=null?(detRow.r1.cpiSma12*1.20).toFixed(2):'—'}% — ${detRow.r1.cpi!=null && detRow.r1.cpiSma12!=null ? ((detRow.r1.cpi! >=4.0 && detRow.r1.cpi! > detRow.r1.cpiSma12!*1.20) ? 'SÍ supera umbral (+20% y ≥4.0%)' : `NO supera — faltó ${(detRow.r1.cpiSma12!*1.20 - detRow.r1.cpi!).toFixed(2)}pp`) : 'sin datos'}`}>{detRow.r1.cpi!=null? `${detRow.r1.cpi.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-sky-300" title="SMA12 Core CPI YoY — media 12M YoY">{detRow.r1.cpiSma12!=null? `${detRow.r1.cpiSma12.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-slate-300" title="Umbral = SMA12 YoY ×1.05">{detRow.r1.cpiSma12!=null? `${(detRow.r1.cpiSma12*1.05).toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-emerald-300">{cpi!=null? `${cpi.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-violet-300">{fed!=null? `${fed.toFixed(2)}%`:'—'}</td>
                    <td className="p-2 text-right font-mono text-cyan-300">{y10!=null? `${y10.toFixed(2)}%`:'—'}</td>
                  </tr>
                );
              })}
              {paddingBottom>0 && (<tr><td colSpan={21} style={{ height: paddingBottom }} /></tr>)}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">Virtualizado · {sorted.length.toLocaleString('en-US')} filas visibles de {rowsView.length.toLocaleString('en-US')} totales · {virtualItems.length} renderizadas · 📈 CAPE&gt;1.18 &amp; CPI YoY≥4.0 &amp; &gt;1.20 · 🏦 Z&gt;2.0 (6M) · 😴 HY&lt;P20 — filtro Año para saltar rápido.</div>
      </div>

      <RegimesDocsTable />
      {tableTip && (
        <div className="fixed z-[100] pointer-events-none bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-3.5 text-xs max-w-[520px] min-w-[340px] ring-1 ring-white/10 text-slate-200" style={{ left: (()=>{ const half=260; const w=typeof window!=='undefined'?window.innerWidth:1200; return Math.min(Math.max(half+8, tableTip.x), w-half-8); })(), top: Math.max(8, tableTip.y - 8), transform: 'translate(-50%, -100%)' }}>
          {tableTip.node}
        </div>
      )}

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
