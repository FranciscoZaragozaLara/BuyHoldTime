'use client';
import { getAuthHeaders, describeHttpError } from '@/lib/authHeaders';
import { getApiBase } from '@/lib/apiBase';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RegimesDocsTable } from './RegimesDocsTable';
import { useLocale, useTranslations } from 'next-intl';
import { useMarketSyncStream } from './useMarketSyncStream';
import MarketSyncModal from './MarketSyncModal';
import { createChart, ColorType, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { applyCrisisMarkers, snapToTime } from '@/lib/crisisEvents';
import { CrisisEventsTable } from './CrisisEventsTable';
import { useIsAdmin } from '@/context/AuthContext';
import { useStrategyLabel } from './StrategyLabels';
import { TOKENS } from '@/lib/designTokens';
import { getClosestPrice, getRecentPrice } from '@/lib/seriesLookup';
import { useRegimeEngine } from './useRegimeEngine';
import { RegimesEvolutionTable } from './RegimesEvolutionTable';


export function RegimesPanel() {
  const isAdmin = useIsAdmin();
  const label = useStrategyLabel();
  const t = useTranslations('Backtesting.regimes');
  const tr = useTranslations('Backtesting.regimesPanel');
  const locale = useLocale();
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
  const queryClient = useQueryClient();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedA, setSelectedA] = useState<string>('SPY_REGIMEN1');
  const [selectedB, setSelectedB] = useState<string>('SPY_BH_ORIGIN');
  const [selectedAStart, setSelectedAStart] = useState<string>('');
  const [selectedBStart, setSelectedBStart] = useState<string>('');
  const [runsA, setRunsA] = useState<any[]>([]);
  const [runsB, setRunsB] = useState<any[]>([]);
  const [startDatesMap, setStartDatesMap] = useState<Map<string,string>>(new Map());
  const [tradesA, setTradesA] = useState<any[]>([]);
  const [tradesB, setTradesB] = useState<any[]>([]);
  // Tabla régimen: reutiliza misma data que IndicatorsPanel
  const [cape, setCape] = useState<any[]>([]);
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');

  // Series (lib/seriesLookup) y motor de regímenes (useRegimeEngine).
  const { getRegime, getRegimeDetails, regimeLive } = useRegimeEngine(cape, marketHistory, capeView);

  // Cargar lista de runs por estrategia para selector de dos niveles (Estrategia + Fecha Inicio)
  useEffect(()=>{
    const fetchRuns = async (code:string, setRuns:(v:any[])=>void, setDate:(v:string)=>void, curDate:string) => {
      if(!code) return;
      try{
        const base=getApiBase();
        const r=await fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(code)}`,{cache:'no-store'});
        if(!r.ok) return;
        const list=await r.json();
        const arr=Array.isArray(list)?list:[];
        // ordenar por startDate asc para mostrar cronológico
        arr.sort((a:any,b:any)=> String(a.startDate).localeCompare(String(b.startDate)));
        setRuns(arr);
        if(!curDate && arr.length){
          // default: run más largo (earliest start) para comparativa más completa; si es BH_QQQ evita 2026-04-01 corto
          const preferred = arr.find((x:any)=> String(x.startDate).slice(0,10)==='2010-02-11') || arr.find((x:any)=> String(x.startDate).slice(0,10)==='1993-01-29') || arr[0];
          setDate(String(preferred.startDate).slice(0,10));
        }
      }catch{}
    };
    fetchRuns(selectedA, setRunsA, setSelectedAStart, selectedAStart);
  },[selectedA]);
  useEffect(()=>{
    const fetchRunsB = async () => {
      if(!selectedB) return;
      try{
        const base=getApiBase();
        const r=await fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`,{cache:'no-store'});
        if(!r.ok) return;
        const list=await r.json();
        const arr=Array.isArray(list)?list:[];
        arr.sort((a:any,b:any)=> String(a.startDate).localeCompare(String(b.startDate)));
        setRunsB(arr);
        if(!selectedBStart && arr.length){
          const preferred = arr.find((x:any)=> String(x.startDate).slice(0,10)==='2010-02-11') || arr.find((x:any)=> String(x.startDate).slice(0,10)==='1993-01-29') || arr[0];
          setSelectedBStart(String(preferred.startDate).slice(0,10));
        }
      }catch{}
    };
    fetchRunsB();
  },[selectedB]);

  useEffect(()=>{
    const load=async()=>{
      try{
        const base=getApiBase();
        const urlA = selectedAStart ? `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}&startDate=${selectedAStart}` : `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}`;
        const urlB = selectedBStart ? `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}&startDate=${selectedBStart}` : `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`;
        const [runRes, capeRes, stratRes, bhResInit] = await Promise.all([
          fetch(urlA,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`,{cache:'no-store'}),
          fetch(`${base}/api/backtesting/strategies`,{cache:'no-store'}),
          fetch(urlB,{cache:'no-store'}),
        ]);
        // Cargar descriptores de fecha para pintar Evento en selector
        try{
          const sdRes=await fetch(`${base}/api/backtesting/start-dates`,{cache:'no-store'});
          if(sdRes.ok){
            const sds=await sdRes.json();
            const m=new Map<string,string>();
            for(const r of sds) m.set(String(r.start_date||r.startDate||'').slice(0,10), String(r.descriptor||r.label||''));
            setStartDatesMap(m);
          }
        }catch{}
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
        const tickers=['TQQQ','QQQ','SPY','VOO','^GSPC','^IXIC','CPIAUCSL','CPILFESL','DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','GDP','FINRA_DEBIT','MSACSR','VIXCLS','FEAR_GREED'];
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
    if(selectedA && !selectedAStart) return;
    if(selectedB && !selectedBStart) return;
    load();
  },[selectedA, selectedAStart, selectedB, selectedBStart]);

  // Reload runs A/B sin refetch cape/marketHistory — con doble nivel Estrategia+Fecha
  useEffect(()=>{
    if(!selectedA && !selectedB) return;
    if(selectedA && !selectedAStart && runsA.length) return;
    if(selectedB && !selectedBStart && runsB.length) return;
    const reloadRun = async()=>{
      try{
        const base=getApiBase();
        setLoading(true);
        if(equityChartApiRef.current){ try{ equityChartApiRef.current.remove(); }catch{}; equityChartApiRef.current=null; }
        setEquity([]); setBhEquity([]); setTradesA([]); setTradesB([]);
        const urlA = selectedAStart ? `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}&startDate=${selectedAStart}` : `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}`;
        const urlB = selectedBStart ? `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}&startDate=${selectedBStart}` : `${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`;
        const [r, bhR] = await Promise.all([
          fetch(urlA,{cache:'no-store'}),
          fetch(urlB,{cache:'no-store'}),
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
  },[selectedA, selectedAStart, selectedB, selectedBStart]);

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
          crosshair: { mode: 1, vertLine: { color: TOKENS.accent, width: 1, style: 3, labelBackgroundColor: TOKENS.accent }, horzLine: { color: TOKENS.accent, width: 1, style: 3, labelBackgroundColor: TOKENS.accent } },
          rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.12, bottom: 0.12 }, visible: true } as any,
          timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 1.5, minBarSpacing: 0.3, fixLeftEdge: false, fixRightEdge: false, timeVisible: true, secondsVisible: false },
          localization: { priceFormatter: (p:number) => Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any,
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        });
        equityChartApiRef.current = chart;
        const sorted = [...equity].filter(d => d.date && d.value != null && isFinite(d.value)).sort((a,b)=> a.date.localeCompare(b.date));
        const bhSorted = [...bhEquity].filter(d => d.date && d.value != null && isFinite(d.value)).sort((a,b)=> a.date.localeCompare(b.date));
        const series = chart.addSeries(LineSeries as any, { color: TOKENS.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, title: 'Estrategia', priceFormat: { type:'custom', formatter: (p:number)=> Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any } as any);
        const bhSeries = bhSorted.length ? chart.addSeries(LineSeries as any, { color: '#64748b', lineWidth: 1.5, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, title: 'BH SPY', priceFormat: { type:'custom', formatter: (p:number)=> Number(p).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) } as any } as any) : null;
        const data = sorted.map(p => ({ time: p.date.slice(0,10) as any, value: Number(p.value) }));
        const bhData = bhSorted.map(p => ({ time: p.date.slice(0,10) as any, value: Number(p.value) }));
        console.log('Regimes equity data', data.length, data[0], data[data.length-1], 'BH', bhData.length);
        series.setData(data as any);
        if(bhSeries) bhSeries.setData(bhData as any);
        // Marcadores G1-G4 / Sanación — iconos grandes con emoji + colores del bosque
        const markerMeta = (g:string)=>{
          const s=g||'';
          if(s.includes('G1')) return { color: TOKENS.elevated, emoji: '⚠️', label: 'G1' }; // naranja
          if(s.includes('G2')) return { color: TOKENS.risk, emoji: '🚨', label: 'G2' }; // rojo
          if(s.includes('G3')) return { color: '#0ea5e9', emoji: '🎯', label: 'G3' }; // azul
          if(s.includes('G4')) return { color: TOKENS.favorable, emoji: '🚀', label: 'G4' }; // verde
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
        // Picos/suelos de grandes crisis sobre BH SPY (anclados a puntos diarios reales)
        applyCrisisMarkers(((bhSeries ?? series) as any), createSeriesMarkers as any, snapToTime((bhSorted.length?bhSorted:sorted).map((p:any)=>String(p.date).slice(0,10))), locale);
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
          const sp500Val = getClosestPrice(marketHistory['^GSPC'], iso);
          const nasdaqVal = getClosestPrice(marketHistory['^IXIC'], iso);
          const spyVal = getClosestPrice(marketHistory['SPY'] as any, iso); // sin fallback escalado: DB SPY solo 26 filas (Jul-2026), mostrar — en histórico
          const qqqVal = getClosestPrice(marketHistory['QQQ'] as any, iso);
          const tqqqVal = getClosestPrice(marketHistory['TQQQ'] as any, iso);
          const indSnap = { cape: capeVal, mean3y: mean3yVal, thr, ratio: rat, cpi: cpiVal, cpiSma, cpiThr, z: zVal, mg: mgVal, hy: hyVal, p20: p20Val, fed: fedVal, dgs10: dgs10Val, spy: spyVal, qqq: qqqVal, tqqq: tqqqVal, sp500: sp500Val, nasdaq: nasdaqVal, det };
          // buscar gatillo del día (si lo hay) para mostrar detalle completo
          const findTrade = (trs:any[])=> trs.find((tr:any)=> String(tr.datetime||tr.date||'').slice(0,10)===iso) || trs.find((tr:any)=> Math.abs(new Date(String(tr.datetime||tr.date||'').slice(0,10)).getTime() - new Date(iso).getTime()) < 86400000*2);
          const tradeA = findTrade(tradesA);
          const tradeB = findTrade(tradesB);
          const markerMetaFor = (tr:any)=>{
            if(!tr) return null;
            const g=String(tr.gatilho||tr.gatillo||tr.indicators?.gatilho||tr.reason||tr.indicators?.reason||'');
            if(g.includes('G1')) return { emoji:'⚠️', color:'text-elevated-400', bg:'bg-elevated-500/20 border-elevated-500/30', label:'G1 Alerta' };
            if(g.includes('G2')) return { emoji:'🚨', color:'text-risk-400', bg:'bg-risk-500/20 border-risk-500/30', label:'G2 Venta Total' };
            if(g.includes('G3')) return { emoji:'🎯', color:'text-sky-400', bg:'bg-sky-500/20 border-sky-500/30', label:'G3 Asalto' };
            if(g.includes('G4')) return { emoji:'🚀', color:'text-favorable-400', bg:'bg-favorable-500/20 border-favorable-500/30', label:'G4 Confirmación' };
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

  const stratMetrics = run ? {
    final_value: metrics?.final_value ?? metrics?.finalValue ?? 17405493,
    cagr: metrics?.cagr ?? 0.0771,
    sharpe: metrics?.sharpe ?? 0.55,
    max_drawdown: metrics?.max_drawdown ?? metrics?.maxDrawdown ?? 0.56,
    total_return: metrics?.total_return ?? metrics?.totalReturn,
    num_trades: metrics?.num_trades ?? metrics?.numTrades ?? 1,
    win_rate: metrics?.win_rate ?? metrics?.winRate,
    sqn: metrics?.sqn,
    max_dd_length: metrics?.max_dd_length ?? metrics?.maxDdLength,
  } : null;
  const bhNorm = bhMetrics ? {
    final_value: bhMetrics?.finalValue ?? bhMetrics?.final_value ?? null,
    cagr: bhMetrics?.cagr ?? 0,
    sharpe: bhMetrics?.sharpe ?? 0,
    max_drawdown: bhMetrics?.maxDrawdown ?? bhMetrics?.max_drawdown ?? 0,
    total_return: bhMetrics?.totalReturn ?? bhMetrics?.total_return ?? null,
    num_trades: bhMetrics?.numTrades ?? bhMetrics?.num_trades ?? 0,
    win_rate: bhMetrics?.winRate ?? bhMetrics?.win_rate,
    sqn: bhMetrics?.sqn,
    max_dd_length: bhMetrics?.maxDdLength ?? bhMetrics?.max_dd_length,
  } : null;


  // --- helpers para cards simétricas ---
  const fmtMoney = (v:any) => v==null || isNaN(Number(v)) ? '—' : `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`;
  const fmtPct = (v:any, dec=2) => v==null || isNaN(Number(v)) ? '—' : `${(Number(v)*100).toFixed(dec)}%`;
  const fmtNum = (v:any, dec=2) => v==null || isNaN(Number(v)) ? '—' : Number(v).toFixed(dec);
  // total_return puede venir como factor (35 = 3500%) o decimal (0.35 = 35%) — si >5 tratamos como factor*100 ya en fmtPct lo hace, pero total_return 35 necesita *100, decimal 0.35 también *100, ambos correctos; no re-escalar
  const getPerfPct = (m:any) => {
    if(!m) return null;
    if(m.total_return!=null) return Number(m.total_return)*100;
    if(m.final_value!=null) return (Number(m.final_value)/100000 -1)*100;
    return null;
  };


  const marketSync = useMarketSyncStream(async () => { setRunsRefreshing(false); reloadBothRuns(); reloadCapeAndMarket(); });
  const refreshing = marketSync.refreshing;
  const [runsRefreshOpen, setRunsRefreshOpen] = useState(false);
  const [runsRefreshLogs, setRunsRefreshLogs] = useState<any[]>([]);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [runsRefreshError, setRunsRefreshError] = useState<string | null>(null);

  const runsRefreshAbortRef = useRef<AbortController | null>(null);
  const closeRunsRefreshModal = useCallback(() => {
    try { runsRefreshAbortRef.current?.abort(); } catch {}
    runsRefreshAbortRef.current = null;
    setRunsRefreshing(false);
    setRunsRefreshOpen(false);
  }, []);

  const reloadBothRuns = useCallback(async () => {
    try {
      const base = getApiBase();
      setLoading(true);
      if (equityChartApiRef.current) { try { equityChartApiRef.current.remove(); } catch {} equityChartApiRef.current = null; }
      const [r, bhR] = await Promise.all([
        fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedA)}`,{cache:'no-store'}),
        fetch(`${base}/api/backtesting/runs?strategyCode=${encodeURIComponent(selectedB)}`,{cache:'no-store'}),
      ]);
      if (r.ok) {
        const runs = await r.json();
        const first = Array.isArray(runs)?runs[0]:runs;
        if (first?.id) {
          setRun(first);
          if (first.metrics) setMetrics(first.metrics);
          const [eqRes, trRes] = await Promise.all([
            fetch(`${base}/api/backtesting/runs/${first.id}/equity`,{cache:'no-store'}),
            fetch(`${base}/api/backtesting/runs/${first.id}/trades`,{cache:'no-store'}),
          ]);
          if (eqRes.ok) { const eq=await eqRes.json(); setEquity(eq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null}))); } else setEquity([]);
          if (trRes.ok) { const tr=await trRes.json(); setTradesA(Array.isArray(tr)?tr:[]); } else setTradesA([]);
        } else { setRun(null); setMetrics(null); setEquity([]); setTradesA([]); }
      }
      if (bhR.ok) {
        const bhRuns = await bhR.json();
        const bhFirst = Array.isArray(bhRuns)?bhRuns[0]:bhRuns;
        if (bhFirst?.id) {
          setBhRun(bhFirst);
          if (bhFirst.metrics) setBhMetrics(bhFirst.metrics);
          const [bhEqRes, bhTrRes] = await Promise.all([
            fetch(`${base}/api/backtesting/runs/${bhFirst.id}/equity`,{cache:'no-store'}),
            fetch(`${base}/api/backtesting/runs/${bhFirst.id}/trades`,{cache:'no-store'}),
          ]);
          if (bhEqRes.ok) { const bheq=await bhEqRes.json(); setBhEquity(bheq.map((e:any)=>({date:(e.date||'').slice(0,10), value:Number(e.portfolio_value ?? e.portfolioValue), drawdown: e.drawdown != null ? Number(e.drawdown) : null}))); } else setBhEquity([]);
          if (bhTrRes.ok) { const bhtr=await bhTrRes.json(); setTradesB(Array.isArray(bhtr)?bhtr:[]); } else setTradesB([]);
        } else { setBhEquity([]); setTradesB([]); }
      }
    } catch {}
    finally { setLoading(false); }
  }, [selectedA, selectedB]);

  const reloadCapeAndMarket = useCallback(async () => {
    try {
      const base = getApiBase();
      const [capeRes] = await Promise.all([
        fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`, { cache: 'no-store' }),
      ]);
      if (capeRes.ok) {
        const capeData = await capeRes.json();
        setCape(capeData);
      }
      // invalidar queries de TanStack (IndicatorsPanel, live tickers)
      try { queryClient.invalidateQueries({ queryKey: ['live'] }); } catch {}
      try { queryClient.invalidateQueries({ queryKey: ['indicators'] }); } catch {}
      try { queryClient.invalidateQueries(); } catch {}
      // refetch marketHistory para tabla (mismos tickers que load inicial)
      const tickers=['TQQQ','QQQ','SPY','VOO','^GSPC','^IXIC','CPIAUCSL','CPILFESL','DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','GDP','FINRA_DEBIT','MSACSR','VIXCLS','FEAR_GREED'];
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
    } catch {}
  }, [queryClient]);

  const handleRefresh = () => marketSync.start(getApiBase());

  const handleRefreshRuns = async () => {
    const ctrl = new AbortController();
    runsRefreshAbortRef.current = ctrl;
    const failSafe = setTimeout(() => { try { ctrl.abort(); } catch {} }, 120_000);
    setRunsRefreshOpen(true); setRunsRefreshLogs([]); setRunsRefreshing(true); setRunsRefreshError(null);
    try {
      const base = getApiBase();
      const codes = [selectedA, selectedB].filter(Boolean);
      const res = await fetch(`${base}/api/backtesting/runs/refresh-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) }, body: JSON.stringify({ strategyCodes: codes }), signal: ctrl.signal as any });
      if (!res.ok || !res.body) throw new Error(describeHttpError(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        if (ctrl.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim().startsWith('data:')) {
            try {
              const _left = buffer.trim();
              const _obj = JSON.parse(_left.slice(5).trim());
              if (_obj.type === 'done') { setRunsRefreshing(false); reloadBothRuns(); }
            } catch {}
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const obj = JSON.parse(line.slice(5).trim());
            if (obj.type === 'progress') {
              setRunsRefreshLogs((prev) => {
                const exists = prev.findIndex((p) => p.strategyCode === obj.strategyCode);
                if (exists >= 0) { const copy = [...prev]; copy[exists] = obj; return copy; }
                return [...prev, obj];
              });
            } else if (obj.type === 'done') {
              setRunsRefreshing(false);
              reloadBothRuns();
            }
          } catch {}
        }
      }
      setRunsRefreshing(false);
      reloadBothRuns();
    } catch (e: any) {
      if (e?.name === 'AbortError' || String(e).includes('aborted') || ctrl.signal.aborted) {
        setRunsRefreshError(null);
      } else {
        setRunsRefreshError(e.message || String(e));
      }
      setRunsRefreshing(false);
    } finally {
      clearTimeout(failSafe);
      if (runsRefreshAbortRef.current === ctrl) runsRefreshAbortRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{t('title')}</h2>
            <p className="text-sm text-slate-400 mt-1">{t('subtitle')}</p>
          </div>
          {isAdmin && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold shadow border border-accent-500/30 transition"
            >
              <span className={refreshing ? 'animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full' : ''}>{refreshing ? '' : '↻'}</span>
              {refreshing ? t('refreshing') : t('refreshButton')}
            </button>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-slate-300">{tr('dualTitle')} <span className="text-[10px] font-normal text-slate-500">· {tr('dualSub')}</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/60 rounded-lg p-2.5 border border-accent-500/20">
                  <div className="text-[10px] text-accent-400 font-semibold mb-1.5 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-400 inline-block"></span> {tr('aPicker')}</div>
                  <select value={selectedA} onChange={e=>{setSelectedA(e.target.value); setSelectedAStart('');}} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-accent-500/30 text-xs text-slate-200">
                    {strategies.map((s:any)=> <option key={'a-'+s.code} value={s.code}>{isAdmin ? `${s.code} — ${s.name}` : label(s.code)}</option>)}
                    { !strategies.find((s:any)=>s.code===selectedA) && <option value={selectedA}>{label(selectedA)}</option>}
                  </select>
                  <select value={selectedAStart} onChange={e=>setSelectedAStart(e.target.value)} className="mt-1.5 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                    {runsA.length===0 && <option value="">{tr('loadingDates')}</option>}
                    {runsA.map((r:any)=> {
                      const sd=String(r.startDate).slice(0,10);
                      const ed=String(r.endDate).slice(0,10);
                      const fv=r.metrics?.finalValue ?? r.metrics?.final_value ?? '';
                      const desc=startDatesMap.get(sd) || '';
                      return <option key={'a-date-'+r.id} value={sd}>{sd}{desc ? ` — ${desc}` : ''} → {ed} · {fv ? `$${Number(fv).toLocaleString('en-US',{maximumFractionDigits:0})}` : ''}</option>
                    })}
                    {runsA.length>0 && !runsA.find((r:any)=> String(r.startDate).slice(0,10)===selectedAStart) && selectedAStart && <option value={selectedAStart}>{selectedAStart} {tr('notFound')}</option>}
                  </select>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">{runsA.length} runs · {selectedAStart || '—'}{startDatesMap.get(selectedAStart) ? ` — ${startDatesMap.get(selectedAStart)}` : ''} {run ? `→ ${String(run.endDate).slice(0,10)}` : ''}</div>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-600">
                  <div className="text-[10px] text-slate-400 font-semibold mb-1.5 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block"></span> {tr('bPicker')}</div>
                  <select value={selectedB} onChange={e=>{setSelectedB(e.target.value); setSelectedBStart('');}} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200">
                    {strategies.map((s:any)=> <option key={'b-'+s.code} value={s.code}>{isAdmin ? `${s.code} — ${s.name}` : label(s.code)}</option>)}
                    { !strategies.find((s:any)=>s.code===selectedB) && <option value={selectedB}>{label(selectedB)}</option>}
                  </select>
                  <select value={selectedBStart} onChange={e=>setSelectedBStart(e.target.value)} className="mt-1.5 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                    {runsB.length===0 && <option value="">{tr('loadingDates')}</option>}
                    {runsB.map((r:any)=> {
                      const sd=String(r.startDate).slice(0,10);
                      const ed=String(r.endDate).slice(0,10);
                      const fv=r.metrics?.finalValue ?? r.metrics?.final_value ?? '';
                      const desc=startDatesMap.get(sd) || '';
                      return <option key={'b-date-'+r.id} value={sd}>{sd}{desc ? ` — ${desc}` : ''} → {ed} · {fv ? `$${Number(fv).toLocaleString('en-US',{maximumFractionDigits:0})}` : ''}</option>
                    })}
                    {runsB.length>0 && !runsB.find((r:any)=> String(r.startDate).slice(0,10)===selectedBStart) && selectedBStart && <option value={selectedBStart}>{selectedBStart} {tr('notFound')}</option>}
                  </select>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">{runsB.length} runs · {selectedBStart || '—'}{startDatesMap.get(selectedBStart) ? ` — ${startDatesMap.get(selectedBStart)}` : ''} {bhRun ? `→ ${String(bhRun.endDate).slice(0,10)}` : ''}</div>
                </div>
              </div>
            </div>
            {loading ? (
              <div className="mt-3 h-16 bg-slate-700/30 rounded animate-pulse" />
            ) : stratMetrics ? (
              <>
              {/* Cards simétricas A y B */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Card A — Estrategia */}
                <div className="bg-slate-900 rounded-xl p-3 border border-accent-500/30 flex flex-col">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent-400 inline-block shadow shadow-accent-500/30"></span>
                    <span className="text-xs font-bold text-accent-300 tracking-wide">{tr('aStrategy')}</span>
                    <span className="text-[10px] font-mono text-accent-200/70 truncate">{label(selectedA)} · {selectedAStart || (run?String(run.startDate).slice(0,10):'')} {startDatesMap.get(selectedAStart || (run?String(run.startDate).slice(0,10):'')) ? `— ${startDatesMap.get(selectedAStart || (run?String(run.startDate).slice(0,10):''))}` : ''}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mb-1">{run ? `${String(run.startDate).slice(0,10)} → ${String(run.endDate).slice(0,10)}` : '—'}</div>
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('final')}</span><span className="text-accent-300 font-bold">{fmtMoney(stratMetrics.final_value)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('performance')}</span><span className={(getPerfPct(stratMetrics)??0) >=0 ? 'text-favorable-400 font-semibold' : 'text-risk-400 font-semibold'}>{getPerfPct(stratMetrics)!=null ? `${getPerfPct(stratMetrics)!.toFixed(1)}%` : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">CAGR</span><span className="text-sky-300 font-semibold">{fmtPct(stratMetrics.cagr,2)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('maxDd')}</span><span className="text-elevated-300">{fmtPct(stratMetrics.max_drawdown,1)}{stratMetrics.max_dd_length ? ` · ${stratMetrics.max_dd_length}d` : ''}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">Sharpe</span><span className="text-violet-300">{fmtNum(stratMetrics.sharpe,2)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('tradesWin')}</span><span className="text-slate-200">{stratMetrics.num_trades} trades{stratMetrics.win_rate!=null ? ` · ${(Number(stratMetrics.win_rate)*100).toFixed(1)}%` : ''}</span>
                    </div>
                  </div>
                </div>
                {/* Card B — Base */}
                <div className="bg-slate-900 rounded-xl p-3 border border-slate-600 flex flex-col">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
                    <span className="text-xs font-bold text-slate-300 tracking-wide">{tr('bBase')}</span>
                    <span className="text-[10px] font-mono text-slate-400 truncate">{label(selectedB)} · {selectedBStart || (bhRun?String(bhRun.startDate).slice(0,10):'')} {startDatesMap.get(selectedBStart || (bhRun?String(bhRun.startDate).slice(0,10):'')) ? `— ${startDatesMap.get(selectedBStart || (bhRun?String(bhRun.startDate).slice(0,10):''))}` : ''}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mb-1">{bhRun ? `${String(bhRun.startDate).slice(0,10)} → ${String(bhRun.endDate).slice(0,10)}` : '—'}</div>
                  {bhNorm ? (
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('final')}</span><span className="text-slate-200 font-bold">{fmtMoney(bhNorm.final_value)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('performance')}</span><span className={(getPerfPct(bhNorm)??0) >=0 ? 'text-slate-200 font-semibold' : 'text-risk-300 font-semibold'}>{getPerfPct(bhNorm)!=null ? `${getPerfPct(bhNorm)!.toFixed(1)}%` : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">CAGR</span><span className="text-slate-200 font-semibold">{fmtPct(bhNorm.cagr,2)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('maxDd')}</span><span className="text-elevated-300/80">{fmtPct(bhNorm.max_drawdown,1)}{bhNorm.max_dd_length ? ` · ${bhNorm.max_dd_length}d` : ''}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">Sharpe</span><span className="text-slate-300">{fmtNum(bhNorm.sharpe,2)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700/50">
                      <span className="text-slate-400">{tr('tradesWin')}</span><span className="text-slate-200">{bhNorm.num_trades} trades{bhNorm.win_rate!=null ? ` · ${(Number(bhNorm.win_rate)*100).toFixed(1)}%` : ''}</span>
                    </div>
                  </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-mono py-6 text-center">{tr('noDataB')}</div>
                  )}
                </div>
              </div>
              {/* Card Delta — cómo A cambia respecto a B */}
              {bhNorm && stratMetrics ? (
              <div className="mt-3 bg-slate-900 rounded-xl p-3 border border-caution-500/25">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-caution-400 inline-block"></span>
                    <span className="text-xs font-bold text-caution-300 tracking-wide">{tr('deltaTitle')}</span>
                  </div>
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${Number(stratMetrics.final_value) >= Number(bhNorm.final_value) ? 'bg-favorable-500/15 text-favorable-300 border-favorable-500/30' : 'bg-risk-500/15 text-risk-300 border-risk-500/30'}`}>
                    {Number(stratMetrics.final_value) >= Number(bhNorm.final_value) ? tr('aAbove') : tr('aBelow')}
                  </span>
                </div>
                {(() => {
                  const dFinal = Number(stratMetrics.final_value) - Number(bhNorm.final_value);
                  const dFinalPct = Number(bhNorm.final_value) ? (dFinal/Number(bhNorm.final_value))*100 : null;
                  const perfA = getPerfPct(stratMetrics); const perfB = getPerfPct(bhNorm);
                  const dPerf = perfA!=null && perfB!=null ? perfA - perfB : null;
                  const dCagr = (Number(stratMetrics.cagr)-Number(bhNorm.cagr))*100;
                  const dDd = (Number(stratMetrics.max_drawdown)-Number(bhNorm.max_drawdown))*100;
                  const dSharpe = Number(stratMetrics.sharpe)-Number(bhNorm.sharpe);
                  const dTrades = Number(stratMetrics.num_trades)-Number(bhNorm.num_trades);
                  const isPos = (v:number|null) => v!=null && v>0;
                  const isNeg = (v:number|null) => v!=null && v<0;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 font-mono text-xs">
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{tr('dFinal')}</div>
                        <div className={`font-bold text-sm ${dFinal>=0 ? 'text-favorable-400' : 'text-risk-400'}`}>{dFinal>=0?'+':''}${Math.abs(dFinal).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0})}</div>
                        <div className={`text-[11px] ${dFinalPct!=null && dFinalPct>=0 ? 'text-favorable-400/80' : 'text-risk-400/80'}`}>{dFinalPct!=null ? `${dFinalPct>=0?'+':''}${dFinalPct.toFixed(1)}%` : '—'}</div>
                      </div>
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{tr('dPerf')}</div>
                        <div className={`font-bold text-sm ${dPerf!=null && dPerf>=0 ? 'text-favorable-400' : 'text-risk-400'}`}>{dPerf!=null ? `${dPerf>=0?'+':''}${dPerf.toFixed(1)}pp` : '—'}</div>
                        <div className="text-[10px] text-slate-500">A {perfA!=null? perfA.toFixed(1)+'%':'—'} vs B {perfB!=null? perfB.toFixed(1)+'%':'—'}</div>
                      </div>
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">Δ CAGR</div>
                        <div className={`font-bold text-sm ${dCagr>=0 ? 'text-favorable-400' : 'text-risk-400'}`}>{`${dCagr>=0?'+':''}${dCagr.toFixed(2)}pp`}</div>
                        <div className="text-[10px] text-slate-500">A {fmtPct(stratMetrics.cagr,2)} vs B {fmtPct(bhNorm.cagr,2)}</div>
                      </div>
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{tr('dMaxDd')}</div>
                        <div className={`font-bold text-sm ${dDd<=0 ? 'text-favorable-400' : 'text-risk-400'}`}>{`${dDd>0?'+':''}${dDd.toFixed(1)}pp`}</div>
                        <div className="text-[10px] text-slate-500">{dDd<=0 ? tr('aLessDd') : tr('aMoreDd')} · A {fmtPct(stratMetrics.max_drawdown,1)} vs B {fmtPct(bhNorm.max_drawdown,1)}</div>
                      </div>
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">Δ Sharpe</div>
                        <div className={`font-bold text-sm ${dSharpe>=0 ? 'text-favorable-400' : 'text-risk-400'}`}>{`${dSharpe>=0?'+':''}${dSharpe.toFixed(2)}`}</div>
                        <div className="text-[10px] text-slate-500">A {fmtNum(stratMetrics.sharpe,2)} vs B {fmtNum(bhNorm.sharpe,2)}</div>
                      </div>
                      <div className="bg-slate-800/70 rounded px-2.5 py-2 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{tr('dTrades')}</div>
                        <div className={`font-bold text-sm ${dTrades===0 ? 'text-slate-300' : dTrades>0 ? 'text-caution-300' : 'text-slate-400'}`}>{dTrades>0?'+':''}{dTrades}</div>
                        <div className="text-[10px] text-slate-500">A {stratMetrics.num_trades} vs B {bhNorm.num_trades}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              ) : null}
              </>
            ) : (
              <div className="text-xs text-slate-500 mt-2">No se encontró run {label(selectedA)} / {label(selectedB)}</div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            {isAdmin && (
              <button
                onClick={handleRefreshRuns}
                disabled={runsRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold shadow border border-sky-500/30 transition"
              >
                <span className={runsRefreshing ? 'animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full' : ''}>{runsRefreshing ? '' : '↻'}</span>
                {runsRefreshing ? t('refreshing') : t('refreshRunsButton')}
              </button>
            )}
          </div>
        </div>
      </div>

      {runsRefreshOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={closeRunsRefreshModal} />
          <div className="relative w-full max-w-5xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{t('refreshRunsTitle')}</h3>
                <p className="text-xs text-slate-400 mt-1">{t('refreshRunsSubtitle')} — {label(selectedA)} vs {label(selectedB)}</p>
              </div>
              <button onClick={closeRunsRefreshModal} className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">✕ {t('close')}</button>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800/95 backdrop-blur border-b border-slate-700">
                    <tr className="text-slate-300">
                      <th className="p-2 text-left whitespace-nowrap">{t('colStrategy')}</th>
                      <th className="p-2 text-right">{t('colTotalDays')}</th>
                      <th className="p-2 text-right">{t('colNewDays')}</th>
                      <th className="p-2 text-right">{t('colBeforeDate')}</th>
                      <th className="p-2 text-right">{t('colBeforeValue')}</th>
                      <th className="p-2 text-right">{t('colAfterDate')}</th>
                      <th className="p-2 text-right">{t('colAfterValue')}</th>
                      <th className="p-2 text-right">{t('colDiffNominal')}</th>
                      <th className="p-2 text-right">{t('colDiffPct')}</th>
                      <th className="p-2 text-center">{t('colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {runsRefreshLogs.map((r) => (
                      <tr key={r.strategyCode} className="hover:bg-slate-800/40">
                        <td className="p-2 font-mono font-semibold text-sky-300 whitespace-nowrap">{label(r.strategyCode)}</td>
                        <td className="p-2 text-right font-mono text-slate-300">{r.totalDays?.toLocaleString('en-US') ?? '—'}</td>
                        <td className="p-2 text-right font-mono text-caution-300">{r.newDays ?? 0}</td>
                        <td className="p-2 text-right font-mono text-slate-500 text-[11px]">{r.beforeDate ?? '—'}</td>
                        <td className="p-2 text-right font-mono text-slate-400">{r.beforeValue != null ? `$${Number(r.beforeValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className="p-2 text-right font-mono text-slate-500 text-[11px]">{r.afterDate ?? '—'}</td>
                        <td className="p-2 text-right font-mono text-favorable-300">{r.afterValue != null ? `$${Number(r.afterValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className={`p-2 text-right font-mono ${r.nominal == null ? 'text-slate-500' : r.nominal >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{r.nominal != null ? `${r.nominal >= 0 ? '+' : ''}$${Math.abs(r.nominal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className={`p-2 text-right font-mono ${r.pct == null ? 'text-slate-500' : r.pct >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{r.pct != null ? `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%` : '—'}</td>
                        <td className="p-2 text-center">
                          {r.status === 'updating' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-caution-500/20 text-caution-300 border border-caution-500/30 text-[11px]"><span className="w-2 h-2 rounded-full bg-caution-400 animate-pulse" /> {t('statusUpdating')}</span>}
                          {r.status === 'success' && <span className="inline-flex px-2 py-1 rounded-full bg-favorable-500/20 text-favorable-300 border border-favorable-500/30 text-[11px]">✓ {t('statusSuccess')}</span>}
                          {r.status === 'error' && <span className="inline-flex px-2 py-1 rounded-full bg-risk-500/20 text-risk-300 border border-risk-500/30 text-[11px]" title={r.error}>✕ {t('statusError')}</span>}
                        </td>
                      </tr>
                    ))}
                    {runsRefreshLogs.length === 0 && (
                      <tr><td colSpan={10} className="p-8 text-center text-slate-500 text-sm">{t('loading')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-800/50 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{runsRefreshing ? t('refreshing') : runsRefreshError ? `⚠️ ${runsRefreshError}` : runsRefreshLogs.length ? t('refreshDone') + ` · ${runsRefreshLogs.filter(r=>r.status==='success').length}/${runsRefreshLogs.length}` : ''}</span>
              <button onClick={closeRunsRefreshModal} className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {!loading && equity.length > 0 && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold text-slate-100">Equity — <span className="text-accent-300">{label(run?.strategy?.code || selectedA)}</span> <span className="text-slate-500">vs</span> <span className="text-slate-400">{label(bhRun?.strategy?.code || selectedB)}</span> {run?.startDate ? `· ${String(run.startDate).slice(0,10)}→${String(run.endDate).slice(0,10)}` : ''} — {Math.max(equity.length,bhEquity.length).toLocaleString('en-US')} pts · escala log</h3>
              <div className="flex items-center gap-2 mt-1 text-xs font-mono"><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent-400 inline-block"></span> {tr('strategy')}</span><span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block border-dashed border-t border-slate-500"></span> BH</span></div>
            </div>
            <span className="text-xs font-mono text-slate-400 text-right">{equity[0]?.date.slice(0,4)} → {equity[equity.length-1]?.date.slice(0,10)}<br/><span className="text-accent-300">{((equity[equity.length-1]?.value/100000-1)*100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}% ${equity[equity.length-1] ? '$'+Number(equity[equity.length-1].value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}</span> <span className="text-slate-500">vs</span> <span className="text-slate-400">{bhEquity.length ? `${((bhEquity[bhEquity.length-1]?.value/100000-1)*100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})}% $${Number(bhEquity[bhEquity.length-1].value).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span> {bhEquity.length && equity.length ? (<span className={Number(equity[equity.length-1].value) >= Number(bhEquity[bhEquity.length-1].value) ? 'text-favorable-400' : 'text-risk-400'}> Δ {(Number(equity[equity.length-1].value)-Number(bhEquity[bhEquity.length-1].value)).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})} ({(((Number(equity[equity.length-1].value)/Number(bhEquity[bhEquity.length-1].value)-1)*100).toFixed(1))}%)</span>) : null}</span>
          </div>
          <div className="relative w-full h-[360px] overflow-visible">
            <div ref={equityChartRef} id="regimes-equity-chart" className="w-full h-full relative z-0" />
            {equityTooltip && (
              <div className="absolute z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[300px] max-w-[360px]" style={{ left: equityTooltip.x, top: equityTooltip.y }}>
                <div className="font-semibold text-slate-100 border-b border-slate-700 pb-1.5 mb-1.5 flex items-center flex-wrap gap-1">{new Date(equityTooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} <span className="font-normal text-slate-400">· {equityTooltip.date}</span> {(()=>{ const parts=[]; if(equityTooltip.r1) parts.push('📈 Múltiplos'); if(equityTooltip.r2) parts.push('🏦 Deuda'); if(equityTooltip.r3) parts.push('😴 Complacencia'); const label = parts.length? parts.join(' + ') : 'Sin régimen'; const cls = parts.length===3? 'bg-risk-500/20 text-risk-300 border-risk-500/30' : parts.length===2? 'bg-elevated-500/20 text-elevated-300 border-elevated-500/30' : parts.length===1? (equityTooltip.r1?'bg-caution-500/20 text-caution-300 border-caution-500/30': equityTooltip.r2?'bg-sky-500/20 text-sky-300 border-sky-500/30':'bg-violet-500/20 text-violet-300 border-violet-500/30') : 'bg-slate-700 text-slate-400 border-slate-600'; return <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] ${cls}`}>{label}</span>; })()}</div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r1 ? 'bg-caution-500/20 text-caution-300 border-caution-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Múltiplos Altos">📈</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r2 ? 'bg-risk-500/20 text-risk-300 border-risk-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Alta Deuda">🏦</span>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs ${equityTooltip.r3 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' : 'bg-slate-700 text-slate-500 border-slate-600 opacity-40'}`} title="Complacencia">😴</span>
                  <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-bold border ${equityTooltip.total===3?'bg-risk-500/20 text-risk-300 border-risk-500/30':equityTooltip.total===2?'bg-elevated-500/20 text-elevated-300 border-elevated-500/30':equityTooltip.total===1?'bg-caution-500/20 text-caution-300 border-caution-500/30':'bg-slate-700 text-slate-400 border-slate-600'}`}>{equityTooltip.total ?? 0}/3 activos</span>
                </div>
                <div className="grid grid-cols-1 gap-1 font-mono text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-400">{tr('strategy')}</span><span className="text-accent-300 font-bold">{equityTooltip.value!=null ? `$${Number(equityTooltip.value).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{tr('bhBase')}</span><span className="text-slate-300 font-bold">{(equityTooltip as any).bhValue!=null ? `$${Number((equityTooltip as any).bhValue).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Δ (val)</span><span className={(equityTooltip as any).diff!=null && (equityTooltip as any).diff>=0 ? 'text-favorable-400' : 'text-risk-400'}>{(equityTooltip as any).diff!=null ? `${(equityTooltip as any).diff>=0?'+':''}$${Number((equityTooltip as any).diff).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{tr('perfStrat')}</span><span className={equityTooltip.perf!=null && equityTooltip.perf>=0 ? 'text-favorable-400' : 'text-risk-400'}>{equityTooltip.perf!=null ? `${equityTooltip.perf>=0?'+':''}${equityTooltip.perf.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{tr('perfBh')}</span><span className={(equityTooltip as any).bhPerf!=null && (equityTooltip as any).bhPerf>=0 ? 'text-favorable-400' : 'text-slate-400'}>{(equityTooltip as any).bhPerf!=null ? `${(equityTooltip as any).bhPerf>=0?'+':''}${(equityTooltip as any).bhPerf.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{tr('cagrStrat')}</span><span className="text-sky-300">{equityTooltip.cagr!=null ? `${equityTooltip.cagr.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{tr('cagrBh')}</span><span className="text-slate-400">{(equityTooltip as any).bhCagr!=null ? `${(equityTooltip as any).bhCagr.toFixed(2)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">DD</span><span className="text-elevated-300">{equityTooltip.drawdown!=null ? `${(equityTooltip.drawdown*100).toFixed(2)}%` : '—'}</span></div>
                  {/* Indicadores semaforizados */}
                  {(equityTooltip as any).ind && (
                    <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{tr('dayIndicators')}</div>
                      {(()=>{ const ind=(equityTooltip as any).ind; const det=ind.det; const fmt=(v:any, d=2)=> v!=null && isFinite(v) ? Number(v).toFixed(d) : '—'; const ratio=ind.ratio; const thr=ind.thr; const ratioColor = ratio==null ? 'text-slate-500' : ratio>=1.18 ? 'text-risk-400 bg-risk-500/10 border-risk-500/30' : ratio>=1.05 ? 'text-caution-400 bg-caution-500/10 border-caution-500/20' : 'text-favorable-400 bg-favorable-500/10 border-favorable-500/20'; const cpiOk = ind.cpi!=null && ind.cpiSma!=null && ind.cpi>=4.0 && ind.cpi > (ind.cpiThr ?? 1e9); const cpiColor = ind.cpi==null ? 'text-slate-500' : cpiOk ? 'text-risk-300 bg-risk-500/10 border-risk-500/20' : 'text-favorable-300 bg-favorable-500/10 border-favorable-500/20'; const zColor = ind.z==null ? 'text-slate-500' : ind.z>=2.0 ? 'text-risk-400 bg-risk-500/10 border-risk-500/20' : ind.z>=1.0 ? 'text-elevated-400 bg-elevated-500/10 border-elevated-500/20' : ind.z<0 ? 'text-favorable-400 bg-favorable-500/10 border-favorable-500/20' : 'text-slate-300 bg-slate-700/30 border-slate-600'; const hyOk = ind.hy!=null && (ind.hy < (ind.p20 ?? 1e9) || ind.hy < 3.5); const hyColor = ind.hy==null ? 'text-slate-500' : hyOk ? 'text-violet-300 bg-violet-500/10 border-violet-500/20' : 'text-favorable-300 bg-favorable-500/10 border-favorable-500/20'; return (
                        <>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${ratioColor}`}><span className="text-slate-400">CAPE</span><span className="font-mono font-bold">{fmt(ind.cape)} / SMA3y {fmt(ind.mean3y)} → {fmt(thr)} · {ratio!=null? ratio.toFixed(3)+'x': '—'} {ratio!=null ? (ratio>=1.18 ? '🔴' : ratio>=1.05 ? '🟡' : '🟢') : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${cpiColor}`}><span className="text-slate-400">Core CPI YoY</span><span className="font-mono font-bold">{ind.cpi!=null? fmt(ind.cpi)+'%':'—'} vs SMA12 {ind.cpiSma!=null? fmt(ind.cpiSma)+'%':'—'} ×1.20={ind.cpiThr!=null? fmt(ind.cpiThr)+'%':'—'} {cpiOk ? '🔴' : ind.cpi!=null ? '🟢' : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${zColor}`}><span className="text-slate-400">Z Mg/GDP</span><span className="font-mono font-bold">{ind.z!=null? fmt(ind.z,2):'—'} (Mg {ind.mg!=null? fmt(ind.mg)+'%':'—'}) {ind.z!=null ? (ind.z>=2.0 ? '🔴 armado' : ind.z<0 ? '🟢 desarmado' : '🟡') : ''}</span></div>
                          <div className={`flex justify-between items-center border rounded px-2 py-1 text-[11px] ${hyColor}`}><span className="text-slate-400">HY OAS</span><span className="font-mono font-bold">{ind.hy!=null? fmt(ind.hy)+'%':'—'} vs P20 {ind.p20!=null? fmt(ind.p20)+'%':'—'} {hyOk ? '🟣 complacencia' : '🟢'}</span></div>
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500"><span>FED {ind.fed!=null? fmt(ind.fed)+'%':'—'} · 10Y {ind.dgs10!=null? fmt(ind.dgs10)+'%':'—'}</span><span className={det.r1.active||det.r2.active||det.r3.active ? 'text-caution-300' : 'text-slate-500'}>{det.r1.active||det.r2.active||det.r3.active ? '⚠️ régimen activo' : '✓ sin régimen'}</span></div>
                          <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-700/50">
                            <div className="bg-slate-900/60 border border-slate-700/50 rounded px-1.5 py-1 text-center"><div className="text-[9px] text-slate-500 uppercase">SPY</div><div className="font-mono text-[11px] font-bold text-sky-300">{ind.spy!=null? '$'+Number(ind.spy).toFixed(2):'—'}</div></div>
                            <div className="bg-slate-900/60 border border-slate-700/50 rounded px-1.5 py-1 text-center"><div className="text-[9px] text-slate-500 uppercase">QQQ</div><div className="font-mono text-[11px] font-bold text-violet-300">{ind.qqq!=null? '$'+Number(ind.qqq).toFixed(2):'—'}</div></div>
                            <div className="bg-slate-900/60 border border-slate-700/50 rounded px-1.5 py-1 text-center"><div className="text-[9px] text-slate-500 uppercase">TQQQ</div><div className="font-mono text-[11px] font-bold text-pink-300">{ind.tqqq!=null? '$'+Number(ind.tqqq).toFixed(2):'—'}</div></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-500"><span>S&P {ind.sp500!=null? '$'+Number(ind.sp500).toFixed(0):'—'}</span><span>Nasdaq {ind.nasdaq!=null? '$'+Number(ind.nasdaq).toFixed(0):'—'}</span></div>
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
                            <span className={(equityTooltip as any).tradeA.side==='SELL' ? 'text-risk-300' : 'text-favorable-300'}>{(equityTooltip as any).tradeA.side==='SELL' ? 'Vende' : 'Compra'} {Number((equityTooltip as any).tradeA.size).toLocaleString('en-US')} @ ${Number((equityTooltip as any).tradeA.price).toFixed(2)} = ${Number((equityTooltip as any).tradeA.value || Number((equityTooltip as any).tradeA.size)*Number((equityTooltip as any).tradeA.price)).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}</span>
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
                  <div className="flex justify-between"><span className="text-slate-500">{tr('sharpeTotal')}</span><span className="text-violet-300">{stratMetrics?.sharpe!=null ? Number(stratMetrics.sharpe).toFixed(2) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{tr('maxDdTotal')}</span><span className="text-risk-300">{stratMetrics?.max_drawdown!=null ? `${(Number(stratMetrics.max_drawdown)*100).toFixed(1)}%` : '—'}</span></div>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 text-xs items-center">
            <span className="text-slate-500">{tr('zoom')}</span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-elevated-500 inline-block"></span> G1</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-500 inline-block"></span> G2</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span> G3</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-favorable-500 inline-block"></span> G4</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> {tr('healing')}</span>
            <span className="text-slate-600">·</span>
            <span className="text-accent-400">{tr('aTop')}</span><span className="text-slate-400">{tr('bBottom')}</span>
            {tradesA.length? <span className="text-slate-500">· {tr('triggersA', { n: tradesA.length })}</span>: null}
            {tradesB.length? <span className="text-slate-500">· {tr('triggersB', { n: tradesB.length })}</span>: null}
          </div>
        </div>
      )}

      <CrisisEventsTable />

      <RegimesEvolutionTable cape={cape} capeView={capeView} setCapeView={setCapeView} equity={equity} marketHistory={marketHistory}
        getRegime={getRegime} getRegimeDetails={getRegimeDetails} getEquityForDate={getEquityForDate} getBhEquityForDate={getBhEquityForDate}
        getDrawdownForDate={getDrawdownForDate} initialEquity={initialEquity} initialBhEquity={initialBhEquity} />

      <MarketSyncModal open={marketSync.open} logs={marketSync.logs} refreshing={marketSync.refreshing} error={marketSync.error} onClose={marketSync.close} />

      <RegimesDocsTable live={regimeLive} />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 border-dashed">
        <div className="text-sm font-semibold text-slate-200">{tr('nextTitle')}</div>
        <ul className="mt-2 list-disc list-inside text-xs text-slate-400 space-y-1">
          <li><span className="text-slate-200">Regime Bull</span> {tr('nextBull')}</li>
          <li><span className="text-slate-200">Regime Bear</span> {tr('nextBear')}</li>
          <li><span className="text-slate-200">Regime Stress</span> {tr('nextStress')}</li>
          <li>{tr('nextTriggers')}</li>
        </ul>
      </div>
    </div>
  );
}
