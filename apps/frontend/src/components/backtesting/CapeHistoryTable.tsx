'use client';
import type React from 'react';
import { getApiBase } from '@/lib/apiBase';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { capeScoreColor } from './bhtBands';
import { Download } from 'lucide-react';
import { breadthValues, buildObvForce, buildObvMap, cagr, getClosestPrice, getCpiYoY, getRecentPrice, isPerf1YMature, marginGdpRatio, monthlyPctLive, oilRatioLive, perf1Y, perf1YElapsedMonths, perfTotal, periodChange, price1YLater } from '@/lib/seriesLookup';
import { exportToExcel } from '@/lib/exportExcel';
import { type ThermoLive, useLiveTicker } from './useThermoLive';
import { useBhtDetail, bhtLeaveGuard, BhtDetailPopover } from './BhtDetail';
import { BhtForwardTable } from './BhtForwardTable';

type Series = Map<string, number>;
export type ThermoHistRow = { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string };

// Tabla "CAPE de Shiller — S&P 500 / Nasdaq / TQQQ": vistas diaria/mensual/anual, orden, scroll infinito,
// export a Excel y popovers (BHT por fecha y rendimiento de SP500/Nasdaq/TQQQ). Estado propio; los datos
// los carga IndicatorsPanel. Las consultas en vivo se repiten aquí (react-query las comparte por clave).
export function CapeHistoryTable({ cape, capeRows, marketHistory, volHistory, thermoHist, regEps, hyBonusNow, liqBonusNow, oilBonusNow, liqM2Map, liqM0Map, liveBhtRef }: {
  cape: any[]; capeRows: any[];
  marketHistory: Record<string, Series>; volHistory: Record<string, Series>;
  thermoHist: Record<string, ThermoHistRow>; regEps: (d: string) => number | null;
  hyBonusNow: ThermoLive['hy']; liqBonusNow: ThermoLive['liq']; oilBonusNow: ThermoLive['oil'];
  liqM2Map: Series; liqM0Map: Series;
  liveBhtRef: React.MutableRefObject<{ v: number | null; d: string | null }>;
}) {
  const ti = useTranslations('Backtesting.indicators');
  const liveGspc = useLiveTicker('^GSPC');
  const liveIxic = useLiveTicker('^IXIC');
  const liveTqqq = useLiveTicker('TQQQ');
  const liveFed = useLiveTicker('DFEDTARU');
  const live2y = useLiveTicker('DGS2');
  const live10y = useLiveTicker('DGS10');
  const live30y = useLiveTicker('DGS30');
  const liveHyOas = useLiveTicker('BAMLH0A0HYM2');
  const liveHyEy = useLiveTicker('BAMLH0A0HYM2EY');
  const liveCpi = useLiveTicker('CPIAUCSL');
  const liveCore = useLiveTicker('CPILFESL');
  const liveGdp = useLiveTicker('GDP');
  const liveMsacsr = useLiveTicker('MSACSR');
  const liveVix = useLiveTicker('VIXCLS');
  const liveFg = useLiveTicker('FEAR_GREED');
  const getMarginGdpRatio = (d: string) => marginGdpRatio(marketHistory['FINRA_DEBIT'], marketHistory['GDP'], d);
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');

  const capeBhtDet = useBhtDetail();

  const [capeFwdCache, setCapeFwdCache] = useState<Record<string, any>>({});
  const loadCapeFwd = (d: string) => {
    if (capeFwdCache[d] !== undefined) return;
    setCapeFwdCache((m) => ({ ...m, [d]: null }));
    const from = new Date(d); from.setDate(from.getDate() - 7);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCapeFwdCache((m) => ({ ...m, [d]: rows.length ? rows[rows.length - 1] : null })))
      .catch(() => {});
  };

  const [visibleCount, setVisibleCount] = useState(15);
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [stockHover, setStockHover] = useState<null | {ticker:string; d:string; x:number; y:number; cape:number|null; ratio:number|null}>(null);
  const observerRef = useRef<HTMLTableRowElement | null>(null) as any;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // OBV SPY, fuerza diaria y Tend-OBV (ver lib/seriesLookup).
  const obvMap = useMemo(() => buildObvMap(marketHistory['SPY'], volHistory['SPY']), [marketHistory, volHistory]);
  const { fuerzaMap, obvzMap } = useMemo(() => buildObvForce(marketHistory['SPY'], volHistory['SPY']), [marketHistory, volHistory]);
  // Amplitud S&P 500: Net Advancing Volume y Up/Down Ratio (constituyentes actuales, 1993→hoy)
  const breadthVals = (d: string) => breadthValues(marketHistory['SPX_ADV_VOL'], marketHistory['SPX_DEC_VOL'], d);

  // Cierre en vivo de SP500/Nasdaq/TQQQ (null si el endpoint cayó a la BD).
  const liveClose = (ticker: string): number | null => {
    const q = ticker === '^GSPC' ? liveGspc : ticker === '^IXIC' ? liveIxic : ticker === 'TQQQ' ? liveTqqq : null;
    return q?.data?.close != null && q.data.source !== 'db-fallback' ? Number(q.data.close) : null;
  };
  // Cambio vs periodo anterior según tab: día / mes / año (view override para export Excel)
  const getChange = (d: string, view?: 'daily'|'monthly'|'yearly') => periodChange(marketHistory['^GSPC'], d, view ?? capeView, liveClose('^GSPC'));
  function changeLabel(): string {
    return capeView === 'monthly' ? 'Change Monthly' : capeView === 'yearly' ? 'Change Yearly' : 'Change Daily';
  }
  function changeTitle(d: string): string {
    return capeView === 'monthly' ? `SP500 ${d} vs mes anterior` : capeView === 'yearly' ? `SP500 ${d} vs año anterior` : `SP500 ${d} vs cierre anterior`;
  }
  const getPerf1Y = (d: string) => perf1Y(marketHistory['^GSPC'], d, getTodayPrice('^GSPC'));
  const getPerfTotal = (d: string) => perfTotal(marketHistory['^GSPC'], d, getTodayPrice('^GSPC'));
  const getCAGR = (d: string) => cagr(marketHistory['^GSPC'], d, getTodayPrice('^GSPC'));
  // Helpers genéricos por ticker para tooltip SP500/Nasdaq/TQQQ
  const getTickerPrice1Y = (ticker: string, d: string) => price1YLater(marketHistory[ticker], d);
  const getTickerPerf1Y = (ticker: string, d: string): number | null => {
    const price = getClosestPrice(marketHistory[ticker], d);
    const price1y = getTickerPrice1Y(ticker, d);
    return price == null || price1y == null ? null : (price1y / price - 1) * 100;
  };
  const getTickerPerfTotal = (ticker: string, d: string) => perfTotal(marketHistory[ticker], d, getTodayPrice(ticker));
  const getTickerCAGR = (ticker: string, d: string) => cagr(marketHistory[ticker], d, getTodayPrice(ticker));
  function getTodayPrice(ticker: string): number | null {
    return liveClose(ticker) ?? getClosestPrice(marketHistory[ticker], new Date().toISOString().slice(0, 10));
  }
  function toggleSort(col: string){
    setSortCol(prev => {
      if(prev===col){ setSortDir(d=> d==='asc'?'desc':'asc'); return prev; }
      setSortDir(col==='date' ? 'desc' : 'desc');
      return col;
    });
  }

  useEffect(()=>{ setVisibleCount(capeView==='yearly' ? 40 : 15); setSortCol('date'); setSortDir('desc'); }, [capeView]);
  // scroll listener robusto + observer como fallback
  useEffect(()=>{
    const el = scrollContainerRef.current;
    if(!el) {
      // reintentar en siguiente tick si aún no montado
      const t = setTimeout(()=> {
        const el2 = scrollContainerRef.current;
        if(el2){
          const onScroll2 = ()=>{
            if(el2.scrollTop + el2.clientHeight >= el2.scrollHeight - 80){
              setVisibleCount(prev=> Math.min(prev+15, 10000));
            }
          };
          el2.addEventListener('scroll', onScroll2);
          (el2 as any)._scrollCleanup = ()=> el2.removeEventListener('scroll', onScroll2);
        }
      }, 300);
      return ()=> clearTimeout(t);
    }
    const onScroll = ()=>{
      if(el.scrollTop + el.clientHeight >= el.scrollHeight - 80){
        setVisibleCount(prev=> Math.min(prev+15, 10000));
      }
    };
    el.addEventListener('scroll', onScroll);
    (el as any)._hasScrollListener = true;
    return ()=> { el.removeEventListener('scroll', onScroll); (el as any)._hasScrollListener = false; };
  }, [capeView, capeRows.length, visibleCount]);
  useEffect(()=>{
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries)=>{
      if (entries[0].isIntersecting) setVisibleCount((prev:number)=> Math.min(prev+15, 10000));
    }, { threshold: 0.1 });
    if (observerRef.current) observer.observe(observerRef.current);
    return ()=> observer.disconnect();
  }, [visibleCount, capeView, capeRows.length, sortCol, sortDir]);

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">{ti('capeChartTitle')}</h3>
          <div className="flex items-center gap-2">
          <button onClick={()=>{
            const buildSheet = (view: 'daily'|'monthly'|'yearly')=>{
              const headers = ['Fecha','SP500', view==='monthly' ? 'Change Monthly' : view==='yearly' ? 'Change Yearly' : 'Change Daily','BHT Index','Perf 1Y','Perf Total','CAGR','Nasdaq','TQQQ','SPX EPS','PE TTM','Fwd PE','CAPE Registrado','CAPE Ajustado','mean3y','RatioCape','FED Target','2Y','10Y','30Y','HY OAS','HY EY','HY 10Y+OAS','HY Bonus','LIQ Bonus','Oil Bonus','WTI','WTI xSMA36','M2','M2 YoY','M0','M0 Δ3M','CPI','Core CPI','GDP','FINRA Debit','Margin/GDP','MSACSR','VIX','F&G','Vol SPY','OBV','Fuerza','Tend-OBV','NetAdv','Up/Down','CAPE SMA 3Y','CAPE SMA 5Y','CAPE SMA 10Y','CAPE EMA 3Y','CAPE EMA 5Y','CAPE EMA 10Y'];
              let rowsView: any[] = capeRows;
              if(view==='monthly'){
                const byMonth = new Map<string, any>();
                for(const r of capeRows) byMonth.set((r.date||'').slice(0,7), r);
                rowsView = Array.from(byMonth.values());
              } else if(view==='yearly'){
                const byYear = new Map<string, any>();
                for(const r of capeRows) byYear.set((r.date||'').slice(0,4), r);
                rowsView = Array.from(byYear.values());
              }
              const sortedView: any[] = [...rowsView].sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
              if(sortCol!=='date'){
                const getVal = (r:any)=>{
                  const d=(r.date||'').slice(0,10);
                  if(sortCol==='spx') return getClosestPrice(marketHistory['^GSPC'], d) ?? -1e9;
                  if(sortCol==='change') return getChange(d) ?? -1e9;
                  if(sortCol==='perf1y') return getPerf1Y(d) ?? -1e9;
                  if(sortCol==='perfTotal') return getPerfTotal(d) ?? -1e9;
                  if(sortCol==='cagr') return getCAGR(d) ?? -1e9;
                  if(sortCol==='ndx') return getClosestPrice(marketHistory['^IXIC'], d) ?? -1e9;
                  if(sortCol==='tqqq') return getClosestPrice(marketHistory['TQQQ'], d) ?? -1e9;
                  if(sortCol==='cpi') return getCpiYoY(marketHistory['CPIAUCSL'], d) ?? -1e9;
                  if(sortCol==='core') return getCpiYoY(marketHistory['CPILFESL'], d) ?? -1e9;
                  if(sortCol==='gdp') return getRecentPrice(marketHistory['GDP'], d, 120) ?? -1e9;
                  if(sortCol==='finra') return getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45) ?? -1e9;
                  if(sortCol==='marginGdp') return getMarginGdpRatio(d) ?? -1e9;
                  if(sortCol==='msacsr') return getRecentPrice(marketHistory['MSACSR'], d, 35) ?? -1e9;
                  if(sortCol==='vix') return getClosestPrice(marketHistory['VIXCLS'], d) ?? -1e9;
                  if(sortCol==='fg') return getClosestPrice(marketHistory['FEAR_GREED'], d) ?? -1e9;
                  if(sortCol==='volspy') return getClosestPrice(volHistory['SPY'], d) ?? -1e9;
                  if(sortCol==='obv') return getClosestPrice(obvMap, d) ?? -1e9;
                  if(sortCol==='fuerza') return getClosestPrice(fuerzaMap, d) ?? -1e9;
                  if(sortCol==='obvt') return getClosestPrice(obvzMap, d) ?? -1e9;
                  if(sortCol==='netadv') return breadthVals(d).net ?? -1e9;
                  if(sortCol==='updown') return breadthVals(d).ratio ?? -1e9;
                  if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -1e9;
                  if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -1e9;
                  if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -1e9;
                  if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -1e9;
                  if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -1e9;
                  if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -1e9;
                  if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -1e9; }
                  if(sortCol==='spxeps') return regEps(d) ?? -1e9;
                  if(sortCol==='spxpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=regEps(d); return (p!=null&&e!=null&&e!==0)? p/e : -1e9; }
                  if(sortCol==='spxfwdpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130); return (p!=null&&e!=null&&e!==0)? p/e : -1e9; }
                  if(sortCol==='cape') return r.cape ?? -1e9;
                  if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -1e9);
                  if(sortCol==='ratio') return r.capeRatio ?? -1e9;
                  if(sortCol==='termo') return thermoHist[d]?.value ?? -1e9;
                  if(sortCol==='sma3y') return (r.mean3y ?? -1e9);
                  if(sortCol==='sma5y') return (r.mean5y ?? -1e9);
                  if(sortCol==='sma10y') return (r.mean10y ?? -1e9);
                  if(sortCol==='ema3y') return (r.mean3y_ema ?? (r as any).mean3yEma ?? -1e9);
                  if(sortCol==='ema5y') return (r.mean5y_ema ?? (r as any).mean5yEma ?? -1e9);
                  if(sortCol==='ema10y') return (r.mean10y_ema ?? (r as any).mean10yEma ?? -1e9);
                  if(sortCol==='sma3') return r.capeSma3 ?? -1e9;
                  if(sortCol==='sma5') return r.capeSma5 ?? -1e9;
                  if(sortCol==='sma10') return r.capeSma10 ?? -1e9;
                  if(sortCol==='ema3') return r.capeEma3 ?? -1e9;
                  if(sortCol==='ema5') return r.capeEma5 ?? -1e9;
                  if(sortCol==='ema10') return r.capeEma10 ?? -1e9;
                  return 0;
                };
                sortedView.sort((a:any,b:any)=>{
                  const av=getVal(a), bv=getVal(b);
                  if(av===bv) return b.date.localeCompare(a.date);
                  return sortDir==='desc' ? (bv as number)-(av as number) : (av as number)-(bv as number);
                });
              }
              const rowsData = sortedView.map((r:any)=>{
                const d=(r.date||'').slice(0,10);
                const label = view==='yearly' ? d.slice(0,4) : view==='monthly' ? d.slice(0,7) : d;
                const hyOas = getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
                const hyEy = getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d);
                const dgs10 = getClosestPrice(marketHistory['DGS10'], d);
                const hy10y = (dgs10!=null && hyOas!=null) ? dgs10 + hyOas : '';
                const thRow = thermoHist[d];
                const m2vX = getRecentPrice(marketHistory['M2SL'], d, 40);
                const m0vX = getRecentPrice(marketHistory['BOGMBASE'], d, 40);
                const m2yX = monthlyPctLive(marketHistory['M2SL'], d, 12);
                const m0dX = monthlyPctLive(marketHistory['BOGMBASE'], d, 3);
                const wtiX = getRecentPrice(marketHistory['DCOILWTICO'], d, 10);
                const wtiRtX = oilRatioLive(marketHistory['DCOILWTICO'], d).ratio;
                const cpi = getCpiYoY(marketHistory['CPIAUCSL'], d);
                const core = getCpiYoY(marketHistory['CPILFESL'], d);
                const perf1y = getPerf1Y(d);
                const varDia = getChange(d, view);
                const perfTot = getPerfTotal(d);
                const cagr = getCAGR(d);
                const gdp = getRecentPrice(marketHistory['GDP'], d, 120);
                const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45);
                const marginGdp = getMarginGdpRatio(d);
                const msacsrXls = getRecentPrice(marketHistory['MSACSR'], d, 35);
                const vixXls = getClosestPrice(marketHistory['VIXCLS'], d);
                const fgXls = getClosestPrice(marketHistory['FEAR_GREED'], d);
                const volXls = getClosestPrice(volHistory['SPY'], d);
                const obvXls = getClosestPrice(obvMap, d);
                const fuerzaXls = getClosestPrice(fuerzaMap, d);
                const obvtXls = getClosestPrice(obvzMap, d);
                const spxEpsXls = regEps(d);
                const spxXls = getClosestPrice(marketHistory['^GSPC'], d);
                const spxFwdEpsXls = getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130);
                const peTtmXls = (spxXls!=null && spxEpsXls!=null && spxEpsXls!==0) ? spxXls/spxEpsXls : null;
                const fwdPeXls = (spxXls!=null && spxFwdEpsXls!=null && spxFwdEpsXls!==0) ? spxXls/spxFwdEpsXls : null;
                const brXls = breadthVals(d);
                return [label, getClosestPrice(marketHistory['^GSPC'], d) ?? '', varDia != null ? Number(varDia.toFixed(2)) : '', thermoHist[d]?.value ?? '', perf1y != null ? Number(perf1y.toFixed(2)) : '', perfTot != null ? Number(perfTot.toFixed(2)) : '', cagr != null ? Number(cagr.toFixed(2)) : '', getClosestPrice(marketHistory['^IXIC'], d) ?? '', getClosestPrice(marketHistory['TQQQ'], d) ?? '', spxEpsXls != null ? Number(spxEpsXls.toFixed(2)) : '', peTtmXls != null ? Number(peTtmXls.toFixed(2)) : '', fwdPeXls != null ? Number(fwdPeXls.toFixed(2)) : '', r.cape ?? '', r.capeAdjusted ?? '', (r.mean3y ?? r.mean) ?? '', r.capeRatio ?? '', getClosestPrice(marketHistory['DFEDTARU'], d) ?? '', getClosestPrice(marketHistory['DGS2'], d) ?? '', getClosestPrice(marketHistory['DGS10'], d) ?? '', getClosestPrice(marketHistory['DGS30'], d) ?? '', hyOas ?? '', hyEy ?? '', hy10y, thRow?.bonus ?? '', thRow?.liqBonus ?? '', thRow?.oilBonus ?? '', wtiX ?? '', wtiRtX != null ? Number(wtiRtX.toFixed(3)) : '', m2vX ?? '', m2yX != null ? Number(m2yX.toFixed(2)) : '', m0vX ?? '', m0dX != null ? Number(m0dX.toFixed(2)) : '', cpi ?? '', core ?? '', gdp ?? '', finra ?? '', marginGdp != null ? Number(marginGdp.toFixed(2)) : '', msacsrXls ?? '', vixXls ?? '', fgXls ?? '', volXls ?? '', obvXls ?? '', fuerzaXls != null ? Number(fuerzaXls.toFixed(3)) : '', obvtXls != null ? Number(obvtXls.toFixed(3)) : '', brXls.net ?? '', brXls.ratio ?? '', (r.mean3y ?? -1e9) !== -1e9 ? (r.mean3y ?? r.mean) : '', r.mean5y ?? '', r.mean10y ?? '', (r.mean3y_ema ?? (r as any).mean3yEma) ?? '', (r.mean5y_ema ?? (r as any).mean5yEma) ?? '', (r.mean10y_ema ?? (r as any).mean10yEma) ?? ''];
              });
              return { name: `CAPE ${view}`, headers, rows: rowsData };
            };
            const sheets = [buildSheet('daily'), buildSheet('monthly'), buildSheet('yearly')];
            exportToExcel(`CAPE-Shiller-Completo-${new Date().toISOString().slice(0,10)}.xlsx`, sheets);
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold transition">
            <Download size={14} /> {ti('excel3')}
          </button>
          <div className="flex gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg">
            {(['daily','monthly','yearly'] as const).map(v=>(
              <button key={v} onClick={()=>setCapeView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-accent-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v==='daily'?'Daily':v==='monthly'?'Monthly':'Yearly'}</button>
            ))}
          </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">{ti('capeTableHint', { view: capeView })}</p>
        <div ref={scrollContainerRef} onScroll={(e)=>{
            const el = e.currentTarget as HTMLDivElement;
            if(el.scrollTop + el.clientHeight >= el.scrollHeight - 80){
              setVisibleCount(prev=> Math.min(prev+15, 10000));
            }
          }} className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">
          <table className="w-full text-xs relative">
            <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
              <tr>
                {[
                  {k:'date', label:'Fecha', cls:'text-left w-[92px] min-w-[92px] max-w-[92px] sticky left-0 bg-slate-900 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]'},
                  {k:'spx', label:'SP500', cls:'text-right text-sky-300'},
                  {k:'change', label:changeLabel(), cls:'text-right text-cyan-300'},
                  {k:'termo', label:'BHT Index', cls:'text-right'},
                  {k:'perf1y', label:'Perf 1Y', cls:'text-right text-lime-300'},
                  {k:'perfTotal', label:'Perf Total', cls:'text-right text-accent-300'},
                  {k:'cagr', label:'CAGR', cls:'text-right text-caution-300'},
                  {k:'ndx', label:'Nasdaq', cls:'text-right text-sky-300'},
                  {k:'tqqq', label:'TQQQ', cls:'text-right text-sky-300'},
                  {k:'spxeps', label:'SPX EPS', cls:'text-right text-accent-300'},
                  {k:'spxpe', label:'PE TTM', cls:'text-right text-accent-300'},
                  {k:'spxfwdpe', label:'Fwd PE', cls:'text-right text-accent-300'},
                  {k:'cape', label:'CAPE Reg.', cls:'text-right', title:'CAPE registrado: S&P 500 ÷ denominador (E10) del último mes que Shiller había publicado ese día. Es el que usan el termómetro y el RatioCape.'},
                  {k:'capeAdj', label:'CAPE Ajust.', cls:'text-right text-slate-400', title:'CAPE ajustado (informativo): S&P 500 ÷ E10 del propio mes, con el dato final de Shiller. No se conocía ese día; vacío hasta que Shiller publica el mes.'},
                  {k:'mean3y', label:'mean3y', cls:'text-right text-caution-300'},
                  {k:'ratio', label:'RatioCape', cls:'text-right'},
                  {k:'fed', label:'FED Target', cls:'text-right text-violet-300'},
                  {k:'dgs2', label:'2Y', cls:'text-right text-cyan-300'},
                  {k:'dgs10', label:'10Y', cls:'text-right text-cyan-300'},
                  {k:'dgs30', label:'30Y', cls:'text-right text-cyan-300'},
                  {k:'hyOas', label:'HY OAS', cls:'text-right text-elevated-300'},
                  {k:'hyEy', label:'HY EY', cls:'text-right text-elevated-300'},
                  {k:'hy10y', label:'HY 10Y+OAS', cls:'text-right text-elevated-300'},
                  {k:'hyBonus', label:'HY Bonus', cls:'text-right text-elevated-300'},
                  {k:'liqBonus', label:'LIQ Bonus', cls:'text-right text-favorable-300'},
                  {k:'oilBonus', label:'Oil Bonus', cls:'text-right text-caution-300'},
                  {k:'wti', label:'WTI', cls:'text-right text-caution-300'},
                  {k:'wtiRatio', label:'WTI ×SMA36', cls:'text-right text-caution-300'},
                  {k:'m2', label:'M2', cls:'text-right text-accent-300'},
                  {k:'m2yoy', label:'M2 YoY', cls:'text-right text-accent-300'},
                  {k:'m0', label:'M0', cls:'text-right text-accent-300'},
                  {k:'m0d3', label:'M0 Δ3M', cls:'text-right text-accent-300'},
                  {k:'cpi', label:'CPI', cls:'text-right text-favorable-300'},
                  {k:'core', label:'Core CPI', cls:'text-right text-favorable-300'},
                  {k:'gdp', label:'GDP', cls:'text-right text-indigo-300'},
                  {k:'finra', label:'FINRA Debit', cls:'text-right text-risk-300'},
                  {k:'marginGdp', label:'Margin/GDP', cls:'text-right text-risk-300'},
                  {k:'msacsr', label:'MSACSR', cls:'text-right text-caution-300'},
                  {k:'vix', label:'VIX', cls:'text-right text-risk-300'},
                  {k:'fg', label:'F&G', cls:'text-right text-favorable-300'},
                  {k:'volspy', label:'Vol SPY', cls:'text-right text-sky-300'},
                  {k:'obv', label:'OBV', cls:'text-right text-fuchsia-300'},
                  {k:'fuerza', label:'Fuerza', cls:'text-right text-risk-300'},
                  {k:'obvt', label:'Tend-OBV', cls:'text-right text-purple-300'},
                  {k:'netadv', label:'NetAdv', cls:'text-right text-lime-300'},
                  {k:'updown', label:'Up/Down', cls:'text-right text-blue-300'},
                  {k:'sma3y', label:'CAPE SMA 3Y', cls:'text-right'},
                  {k:'sma5y', label:'CAPE SMA 5Y', cls:'text-right'},
                  {k:'sma10y', label:'CAPE SMA 10Y', cls:'text-right'},
                  {k:'ema3y', label:'CAPE EMA 3Y', cls:'text-right'},
                  {k:'ema5y', label:'CAPE EMA 5Y', cls:'text-right'},
                  {k:'ema10y', label:'CAPE EMA 10Y', cls:'text-right'},
                ].map((col: { k: string; label: string; cls: string; title?: string })=>(
                  <th key={col.k} title={col.title} onClick={()=>toggleSort(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-accent-300 ${sortCol===col.k?'text-accent-300':''}`}>
                    {col.label} <span className="text-[10px]">{sortCol===col.k ? (sortDir==='asc'?'▲':'▼') : '↕'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {(()=>{
                let rows = capeRows;
                if (capeView==='monthly') {
                  const byMonth = new Map<string, any>();
                  for (const r of capeRows) byMonth.set((r.date||'').slice(0,7), r);
                  rows = Array.from(byMonth.values());
                } else if (capeView==='yearly') {
                  const byYear = new Map<string, any>();
                  for (const r of capeRows) byYear.set((r.date||'').slice(0,4), r);
                  rows = Array.from(byYear.values());
                }
                // determinar fecha más reciente en vista para resaltar como "Actual"
                const maxDate = rows.length ? rows.reduce((m:any, r:any)=> r.date>m?r.date:m, rows[0].date) : null;
                let sorted: any[] = [...rows];
                if(sortCol==='date'){
                  sorted.sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
                } else {
                  const getVal = (r:any)=>{
                    const d=(r.date||'').slice(0,10);
                    if(sortCol==='spx') return getClosestPrice(marketHistory['^GSPC'], d) ?? -Infinity;
                    if(sortCol==='change') return getChange(d) ?? -Infinity;
                    if(sortCol==='perf1y') return getPerf1Y(d) ?? -Infinity;
                    if(sortCol==='perfTotal') return getPerfTotal(d) ?? -Infinity;
                    if(sortCol==='cagr') return getCAGR(d) ?? -Infinity;
                    if(sortCol==='ndx') return getClosestPrice(marketHistory['^IXIC'], d) ?? -Infinity;
                    if(sortCol==='tqqq') return getClosestPrice(marketHistory['TQQQ'], d) ?? -Infinity;
                    if(sortCol==='cpi') return getCpiYoY(marketHistory['CPIAUCSL'], d) ?? -Infinity;
                    if(sortCol==='core') return getCpiYoY(marketHistory['CPILFESL'], d) ?? -Infinity;
                    if(sortCol==='gdp') return getRecentPrice(marketHistory['GDP'], d, 120) ?? -Infinity;
                    if(sortCol==='finra') return getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45) ?? -Infinity;
                    if(sortCol==='marginGdp') return getMarginGdpRatio(d) ?? -Infinity;
                    if(sortCol==='msacsr') return getRecentPrice(marketHistory['MSACSR'], d, 35) ?? -Infinity;
                    if(sortCol==='vix') return getClosestPrice(marketHistory['VIXCLS'], d) ?? -Infinity;
                    if(sortCol==='fg') return getClosestPrice(marketHistory['FEAR_GREED'], d) ?? -Infinity;
                    if(sortCol==='volspy') return getClosestPrice(volHistory['SPY'], d) ?? -Infinity;
                    if(sortCol==='obv') return getClosestPrice(obvMap, d) ?? -Infinity;
                    if(sortCol==='fuerza') return getClosestPrice(fuerzaMap, d) ?? -Infinity;
                    if(sortCol==='obvt') return getClosestPrice(obvzMap, d) ?? -Infinity;
                    if(sortCol==='netadv') return breadthVals(d).net ?? -Infinity;
                    if(sortCol==='updown') return breadthVals(d).ratio ?? -Infinity;
                    if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -Infinity;
                    if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -Infinity;
                    if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -Infinity;
                    if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -Infinity;
                    if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -Infinity;
                    if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -Infinity;
                    if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -Infinity; }
                    if(sortCol==='hyBonus') return thermoHist[d]?.bonus ?? -Infinity;
                    if(sortCol==='liqBonus') return thermoHist[d]?.liqBonus ?? -Infinity;
                    if(sortCol==='oilBonus') return thermoHist[d]?.oilBonus ?? -Infinity;
                    if(sortCol==='wti') return getRecentPrice(marketHistory['DCOILWTICO'], d, 10) ?? -Infinity;
                    if(sortCol==='wtiRatio') return oilRatioLive(marketHistory['DCOILWTICO'], d).ratio ?? -Infinity;
                    if(sortCol==='m2') return getRecentPrice(marketHistory['M2SL'], d, 40) ?? -Infinity;
                    if(sortCol==='m2yoy') return monthlyPctLive(marketHistory['M2SL'], d, 12) ?? -Infinity;
                    if(sortCol==='m0') return getRecentPrice(marketHistory['BOGMBASE'], d, 40) ?? -Infinity;
                    if(sortCol==='m0d3') return monthlyPctLive(marketHistory['BOGMBASE'], d, 3) ?? -Infinity;
                    if(sortCol==='spxeps') return regEps(d) ?? -Infinity;
                    if(sortCol==='spxpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=regEps(d); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='spxfwdpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='cape') return r.cape ?? -Infinity;
                    if(sortCol==='capeAdj') return r.capeAdjusted ?? -Infinity;
                    if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -Infinity);
                    if(sortCol==='ratio') return r.capeRatio ?? -Infinity;
                    if(sortCol==='termo') return thermoHist[d]?.value ?? -Infinity;
                    if(sortCol==='sma3y') return (r.mean3y ?? -Infinity);
                    if(sortCol==='sma5y') return (r.mean5y ?? -Infinity);
                    if(sortCol==='sma10y') return (r.mean10y ?? -Infinity);
                    if(sortCol==='ema3y') return (r.mean3y_ema ?? (r as any).mean3yEma ?? -Infinity);
                    if(sortCol==='ema5y') return (r.mean5y_ema ?? (r as any).mean5yEma ?? -Infinity);
                    if(sortCol==='ema10y') return (r.mean10y_ema ?? (r as any).mean10yEma ?? -Infinity);
                    if(sortCol==='sma3') return r.capeSma3 ?? -Infinity;
                    if(sortCol==='sma5') return r.capeSma5 ?? -Infinity;
                    if(sortCol==='sma10') return r.capeSma10 ?? -Infinity;
                    if(sortCol==='ema3') return r.capeEma3 ?? -Infinity;
                    if(sortCol==='ema5') return r.capeEma5 ?? -Infinity;
                    if(sortCol==='ema10') return r.capeEma10 ?? -Infinity;
                    return 0;
                  };
                  sorted.sort((a:any,b:any)=>{
                    const av=getVal(a), bv=getVal(b);
                    if(av===bv) return b.date.localeCompare(a.date);
                    return sortDir==='desc' ? (bv as number)-(av as number) : (av as number)-(bv as number);
                  });
                }
                const paginated = sorted.slice(0, visibleCount);
                const isLastPage = paginated.length >= sorted.length;
                return paginated.map((r:any, idx:number)=>{
                const ratio = r.capeRatio;
                const ratioColor = ratio==null ? 'text-slate-400' : ratio < 0.9 ? 'text-favorable-400' : ratio < 1.05 ? 'text-green-400' : ratio < 1.18 ? 'text-caution-400' : ratio < 1.35 ? 'text-elevated-400' : 'text-risk-400';
                const ratioBg = ratio==null ? '' : ratio < 0.9 ? 'bg-favorable-500/10' : ratio < 1.05 ? 'bg-green-500/10' : ratio < 1.18 ? 'bg-caution-500/10' : ratio < 1.35 ? 'bg-elevated-500/10' : 'bg-risk-500/10';
                const d = (r.date||'').slice(0,10);
                const spx = getClosestPrice(marketHistory['^GSPC'], d);
                const ndx = getClosestPrice(marketHistory['^IXIC'], d);
                const tqqq = getClosestPrice(marketHistory['TQQQ'], d);
                const cpi = getCpiYoY(marketHistory['CPIAUCSL'], d);
                const core = getCpiYoY(marketHistory['CPILFESL'], d);
                const gdpVal = getRecentPrice(marketHistory['GDP'], d, 120);
                const fed = getClosestPrice(marketHistory['DFEDTARU'], d);
                const dgs2 = getClosestPrice(marketHistory['DGS2'], d);
                const dgs10 = getClosestPrice(marketHistory['DGS10'], d);
                const dgs30 = getClosestPrice(marketHistory['DGS30'], d);
                const hyOas = getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
                const hyEy = getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d);
                const hy10y = (dgs10!=null && hyOas!=null) ? dgs10 + hyOas : null;
                const thR = thermoHist[d];
                const m2v = getRecentPrice(liqM2Map, d, 40);
                const m0v = getRecentPrice(liqM0Map, d, 40);
                const m2y = monthlyPctLive(liqM2Map, d, 12);
                const m0d = monthlyPctLive(liqM0Map, d, 3);
                const isLiveRow = sortCol==='date' && sortDir==='desc' && r.date===maxDate;
                const hyBO = isLiveRow ? hyBonusNow : null;
                const liqBO = isLiveRow ? liqBonusNow : null;
                const oilBO = isLiveRow ? oilBonusNow : null;
                const hyBv = isLiveRow ? (hyBO?.bonus ?? null) : (thR?.bonus ?? null);
                const hyBLbl = isLiveRow ? (hyBO?.label ?? '') : (thR?.bonusLabel ?? '');
                const liqBv = isLiveRow ? (liqBO?.bonus ?? null) : (thR?.liqBonus ?? null);
                const liqBLbl = isLiveRow ? (liqBO?.label ?? '') : (thR?.liqBonusLabel ?? '');
                const oilBv = isLiveRow ? (oilBO?.bonus ?? null) : (thR?.oilBonus ?? null);
                const oilBLbl = isLiveRow ? (oilBO?.label ?? '') : (thR?.oilBonusLabel ?? '');
                const oilRt = isLiveRow ? (oilBO?.ratio ?? null) : oilRatioLive(marketHistory['DCOILWTICO'], d).ratio;
                const oilPx = isLiveRow ? (oilBO?.price ?? null) : getRecentPrice(marketHistory['DCOILWTICO'], d, 10);
                const msacsr = getRecentPrice(marketHistory['MSACSR'], d, 35);
                const vix = getClosestPrice(marketHistory['VIXCLS'], d);
                const fg = getClosestPrice(marketHistory['FEAR_GREED'], d);
                const isLast = idx === paginated.length - 1 && !isLastPage;
                const isCurrent = sortCol==='date' && sortDir==='desc' && r.date===maxDate;
                // si es fila actual y tenemos live, sobre-escribir precios con live (solo cuando date==maxDate y esa fecha es hoy±1d)
                const useLive = isCurrent;
                const spxLive = useLive ? liveGspc.data?.close : null;
                const ndxLive = useLive ? liveIxic.data?.close : null;
                const tqqqLive = useLive ? liveTqqq.data?.close : null;
                const cpiLive = useLive ? liveCpi.data?.close : null;
                const coreLive = useLive ? liveCore.data?.close : null;
                const gdpLive = useLive ? liveGdp.data?.close : null;
                const fedLive = useLive ? liveFed.data?.close : null;
                const y2Live = useLive ? live2y.data?.close : null;
                const y10Live = useLive ? live10y.data?.close : null;
                const y30Live = useLive ? live30y.data?.close : null;
                const msacsrLive = useLive ? liveMsacsr.data?.close : null;
                const vixLive = useLive ? liveVix.data?.close : null;
                const fgLive = useLive ? liveFg.data?.close : null;
                const spxDisp = (spxLive!=null && liveGspc.data?.source!=='db-fallback') ? spxLive : spx;
                const ndxDisp = (ndxLive!=null && liveIxic.data?.source!=='db-fallback') ? ndxLive : ndx;
                const tqqqDisp = (tqqqLive!=null && liveTqqq.data?.source!=='db-fallback') ? tqqqLive : tqqq;
                const cpiDisp = (cpiLive!=null) ? (getCpiYoY(marketHistory['CPIAUCSL'], liveCpi.data?.date || d) ?? cpi) : cpi;
                const coreDisp = (coreLive!=null) ? (getCpiYoY(marketHistory['CPILFESL'], liveCore.data?.date || d) ?? core) : core;
                const gdpDisp = (gdpLive!=null) ? gdpLive : gdpVal;
                const fedDisp = (fedLive!=null) ? fedLive : fed;
                const dgs2Disp = (y2Live!=null) ? y2Live : dgs2;
                const dgs10Disp = (y10Live!=null) ? y10Live : dgs10;
                const dgs30Disp = (y30Live!=null) ? y30Live : dgs30;
                const msacsrDisp = (msacsrLive!=null) ? msacsrLive : msacsr;
                const vixDisp = (vixLive!=null && liveVix.data?.source!=='db-fallback') ? vixLive : vix;
                const fgDisp = (fgLive!=null && liveFg.data?.source!=='db-fallback') ? fgLive : fg;
                const volSpy = getClosestPrice(volHistory['SPY'], d);
                const obv = getClosestPrice(obvMap, d);
                const fuerza = getClosestPrice(fuerzaMap, d);
                const obvt = getClosestPrice(obvzMap, d);
                const spxEps = regEps(d);
                const spxFwdEps = getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130);
                const br = breadthVals(d);
                const fmtVol = (v:number|null) => v==null ? '—' : v>=1e9 ? `${(v/1e9).toFixed(2)}B` : `${(v/1e6).toFixed(1)}M`;
                const hyOasLive = useLive ? liveHyOas.data?.close : null;
                const hyEyLive = useLive ? liveHyEy.data?.close : null;
                const hyOasDisp = (hyOasLive!=null) ? hyOasLive : hyOas;
                const hyEyDisp = (hyEyLive!=null) ? hyEyLive : hyEy;
                const hy10yDisp = (hyOasDisp!=null && dgs10Disp!=null) ? dgs10Disp + hyOasDisp : hy10y;
                return (
                <tr key={r.date} ref={isLast ? observerRef : null} className={`${isCurrent ? 'bg-accent-500/[0.08] border-l-2 border-l-accent-500 ring-1 ring-accent-500/15' : 'hover:bg-slate-900/40'} transition-colors`}>
                  <td className={`p-1.5 px-2 font-mono whitespace-nowrap w-[92px] min-w-[92px] max-w-[92px] align-top sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.25)] ${isCurrent ? 'bg-slate-900' : 'bg-slate-950 group-hover:bg-slate-900'}`}><div className="flex flex-col items-start leading-none gap-0.5"><span className={`${isCurrent ? 'text-accent-300 font-bold' : 'text-slate-200'} text-xs`}>{capeView==='yearly' ? d.slice(0,4) : capeView==='monthly' ? d.slice(0,7) : d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500 text-white font-bold leading-none">Actual</span>}</div></td>
                  {(()=>{ if(spxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^GSPC', d, x: e.clientX, y: e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^GSPC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(spxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ const p=getChange(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>1?'text-favorable-400 bg-favorable-500/10':p>0.25?'text-green-400 bg-green-500/10':p>0?'text-caution-400 bg-caution-500/10':p>-0.5?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; const arrow = p>0?'▲':'▼'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={changeTitle(d)}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const th = thermoHist[d]; const isLive = isCurrent && liveBhtRef.current.v != null; if (th == null && !isLive) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const thv = isLive ? liveBhtRef.current.v! : th.value; const c = capeScoreColor(thv); return <td className="p-2 text-right font-mono font-semibold whitespace-nowrap cursor-help" style={{color:c}} onMouseEnter={(e)=>{ capeBhtDet.setHover({d, x:e.clientX, y:e.clientY}); capeBhtDet.load(d); loadCapeFwd(d); }} onMouseMove={(e)=> capeBhtDet.setHover((s)=> s && s.d===d ? {...s, x:e.clientX, y:e.clientY} : s)} onMouseLeave={(e)=> bhtLeaveGuard(e, capeBhtDet)}><span className="border-b border-dotted border-slate-400/40" title={isLive ? 'En vivo (igual que el semáforo)' : undefined}>{thv.toFixed(1)}{isLive && <span className="text-accent-300"> •</span>}</span></td>; })()}
                  {(()=>{ const p=getPerf1Y(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const mature=isPerf1YMature(d); const cls = !mature ? 'text-sky-300 bg-sky-500/10 italic' : p>15?'text-favorable-400 bg-favorable-500/10':p>5?'text-green-400 bg-green-500/10':p>0?'text-caution-400 bg-caution-500/10':p>-5?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; const arrow = p>0?'▲':'▼'; const tip = mature ? `SP500 ${d} → +12m` : `SP500 ${d} → hoy: parcial anualizado (${perf1YElapsedMonths(d)}m transcurridos, no maduro)`; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={tip}>{arrow} {!mature?'~ ':''}{p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getPerfTotal(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>100?'text-favorable-300 bg-favorable-500/15':p>50?'text-favorable-400 bg-favorable-500/10':p>15?'text-green-400 bg-green-500/10':p>0?'text-caution-400 bg-caution-500/10':p>-10?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; const arrow = p>0?'▲':'▼'; const todayS = new Date().toISOString().slice(0,10); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`SP500 ${d} → hoy ${todayS}`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getCAGR(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>15?'text-favorable-400 bg-favorable-500/10':p>10?'text-green-400 bg-green-500/10':p>5?'text-caution-400 bg-caution-500/10':p>0?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; const arrow = p>0?'▲':'▼'; const years = ((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`CAGR ${d} → hoy (${years}a): (Phoy/Pd)^(1/años)-1`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ if(ndxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^IXIC', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^IXIC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(ndxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ if(tqqqDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'TQQQ', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='TQQQ' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(tqqqDisp).toFixed(2)}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap" title={`S&P 500 EPS TTM registrado ${d} — último mes de Shiller (ie_data.xls) publicado a esa fecha`}>{spxEps!=null?`$${spxEps.toFixed(2)}`:'—'}</td>
                  {(()=>{ const pe=(spxDisp!=null&&spxEps!=null&&spxEps!==0)? spxDisp/spxEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap" title={`PE TTM ${d} — precio SPX / EPS TTM`}>{pe.toFixed(2)}</td>; })()}
                  {(()=>{ const pe=(spxDisp!=null&&spxFwdEps!=null&&spxFwdEps!==0)? spxDisp/spxFwdEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap" title={`Forward PE ${d} — precio SPX / EPS estimado 12m (operating)`}>{pe.toFixed(2)}</td>; })()}
                  <td className="p-2 text-right font-mono text-favorable-400 whitespace-nowrap" title={r.e10Month ? `CAPE registrado ${d}: S&P 500 ÷ E10 de ${String(r.e10Month).slice(0, 7)} (${r.e10 != null ? Number(r.e10).toFixed(2) : '—'})` : undefined}>{r.cape?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap" title={r.capeAdjusted == null ? 'Shiller aún no publica este mes' : 'Informativo: con el E10 final del propio mes'}>{r.capeAdjusted != null ? Number(r.capeAdjusted).toFixed(2) : '—'}</td>
                  <td className="p-2 text-right font-mono text-caution-300 whitespace-nowrap">{(r.mean3y ?? r.mean)?.toFixed(2) ?? '—'}</td>
                  <td className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${ratioColor} ${ratioBg} rounded`}>{ratio!=null ? `${ratio.toFixed(3)}X` : '—'}</td>
                  <td className="p-2 text-right font-mono text-violet-300 whitespace-nowrap">{fedDisp!=null?`${Number(fedDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs2Disp!=null?`${Number(dgs2Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs10Disp!=null?`${Number(dgs10Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs30Disp!=null?`${Number(dgs30Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-elevated-300 whitespace-nowrap" title="BAMLH0A0HYM2 OAS">{hyOasDisp!=null?`${Number(hyOasDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-elevated-300 whitespace-nowrap" title="BAMLH0A0HYM2EY Effective Yield">{hyEyDisp!=null?`${Number(hyEyDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-elevated-300 whitespace-nowrap" title="DGS10 + OAS">{hy10yDisp!=null?`${Number(hy10yDisp).toFixed(2)}%`:'—'}</td>
                  {(()=>{ if(hyBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=hyBv>0?'text-elevated-300 bg-elevated-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus HY Spread ${d}${hyBLbl?` — ${hyBLbl}`:''}`}>{hyBv>0?`+${hyBv}`:'0'}</td>; })()}
                  {(()=>{ if(liqBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=liqBv>0?'text-elevated-300 bg-elevated-500/10 font-semibold':liqBv<0?'text-favorable-300 bg-favorable-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus liquidez M2/M0 ${d}${liqBLbl?` — ${liqBLbl}`:''}`}>{liqBv!==0?`${liqBv>0?'+':''}${liqBv}`:'0'}</td>; })()}
                  {(()=>{ if(oilBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=oilBv>0?'text-elevated-300 bg-elevated-500/10 font-semibold':oilBv<0?'text-favorable-300 bg-favorable-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus petróleo WTI ${d}${oilBLbl?` — ${oilBLbl}`:''}`}>{oilBv!==0?`${oilBv>0?'+':''}${oilBv}`:'0'}</td>; })()}
                  {(()=>{ if(oilPx==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-caution-300 whitespace-nowrap" title={`WTI ${d} (FRED DCOILWTICO, $/barril)`}>${oilPx.toFixed(2)}</td>; })()}
                  {(()=>{ if(oilRt==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-slate-200 whitespace-nowrap" title={`WTI / SMA36M ${d} — shock ≥1.45, caro ≥1.20, barato <0.90, alivio <0.70`}>{oilRt.toFixed(2)}×</td>; })()}
                  <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap" title={`M2 oferta monetaria ${d} (FRED M2SL, billones $)`}>{m2v!=null?`$${(m2v/1000).toFixed(2)}T`:'—'}</td>
                  {(()=>{ if(m2y==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-slate-200 whitespace-nowrap" title={`M2 YoY ${d} — tailwind exige >4% y acelerando vs 3M atrás`}>{m2y>=0?'+':''}{m2y.toFixed(1)}%</td>; })()}
                  <td className="p-2 text-right font-mono text-accent-300 whitespace-nowrap" title={`M0 base monetaria ${d} (FRED BOGMBASE, billones $)`}>{m0v!=null?`$${(m0v/1000).toFixed(2)}T`:'—'}</td>
                  {(()=>{ if(m0d==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=m0d>=0?'text-favorable-300':'text-risk-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold ${cls}`} title={`M0 Δ3M ${d} — ${m0d<0?'≤0: veta el tailwind de liquidez':'positivo: permite tailwind'}`}>{m0d>=0?'+':''}{m0d.toFixed(1)}%</td>; })()}
                  <td className="p-2 text-right font-mono text-favorable-300 whitespace-nowrap">{cpiDisp!=null?`${Number(cpiDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-favorable-300 whitespace-nowrap">{coreDisp!=null?`${Number(coreDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-indigo-300 whitespace-nowrap">{gdpDisp!=null?`$${(Number(gdpDisp)/1000).toFixed(1)}T`:'—'}</td>
                  <td className="p-2 text-right font-mono text-risk-300 whitespace-nowrap">{(()=>{ const v=getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45); return v!=null? `$${(v/1000).toFixed(0)}B`:'—'; })()}</td>
                  {(()=>{ const v=getMarginGdpRatio(d); if(v==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=v>6?'text-risk-400 bg-risk-500/10 border-risk-500/20':v>4?'text-elevated-400 bg-elevated-500/10 border-elevated-500/20':v>2?'text-caution-400 bg-caution-500/10 border-caution-500/20':'text-favorable-400 bg-favorable-500/10 border-favorable-500/20'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold border rounded ${cls}`}>{v.toFixed(2)}%</td>; })()}
                  {(()=>{ if(msacsrDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=msacsrDisp>6?'text-risk-400 bg-risk-500/10':msacsrDisp>=4?'text-caution-400 bg-caution-500/10':'text-favorable-400 bg-favorable-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`MSACSR ${d} — meses de inventario casas nuevas`}>{Number(msacsrDisp).toFixed(1)} m</td>; })()}
                  {(()=>{ if(vixDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=vixDisp>30?'text-risk-400 bg-risk-500/10':vixDisp>20?'text-caution-400 bg-caution-500/10':vixDisp>=12?'text-slate-200':'text-favorable-400 bg-favorable-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`VIX ${d} — volatilidad implícita S&P 500`}>{Number(vixDisp).toFixed(2)}</td>; })()}
                  {(()=>{ if(fgDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=fgDisp>=55?'text-favorable-400 bg-favorable-500/10':fgDisp>=45?'text-slate-200':fgDisp>=25?'text-caution-400 bg-caution-500/10':'text-risk-400 bg-risk-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Fear & Greed ${d} — 0 miedo extremo / 100 codicia extrema`}>{Number(fgDisp).toFixed(0)}</td>; })()}
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap" title={`Volumen SPY ${d} (acciones)`}>{fmtVol(volSpy)}</td>
                  <td className="p-2 text-right font-mono text-fuchsia-300 whitespace-nowrap" title={`OBV SPY ${d} — acumulado con signo del cierre`}>{obv!=null?fmtVol(obv):'—'}</td>
                  {(()=>{ if(fuerza==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=fuerza>=1?'text-favorable-400 bg-favorable-500/10':fuerza>=0.5?'text-green-400 bg-green-500/10':fuerza>0?'text-slate-200':fuerza>-0.5?'text-slate-200':fuerza>-1?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Fuerza diaria ${d} — (OBV hoy−OBV ayer)/SMA20(Vol): >+1 bullish extremo, <−1 bearish extremo`}>{fuerza>=0?'+':''}{fuerza.toFixed(2)}</td>; })()}
                  {(()=>{ if(obvt==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=obvt>=2?'text-favorable-400 bg-favorable-500/10':obvt>=0?'text-green-400 bg-green-500/10':obvt>-2?'text-elevated-400 bg-elevated-500/10':'text-risk-400 bg-risk-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Tend-OBV ${d} — Z-Score 20d del OBV: >0 acumulación, <0 distribución`}>{obvt>=0?'+':''}{obvt.toFixed(2)}σ</td>; })()}
                  {(()=>{ if(br.net==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=br.net>=0?'text-favorable-400 bg-favorable-500/10':'text-risk-400 bg-risk-500/10'; const s=br.net>=0?'+':'−'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Net Advancing Volume ${d} — constituyentes S&P 500`}>{s}{fmtVol(Math.abs(br.net))}</td>; })()}
                  {(()=>{ if(br.ratio==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=br.ratio>=1?'text-favorable-400 bg-favorable-500/10':'text-risk-400 bg-risk-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Up/Down Volume Ratio ${d} — vol subida / vol bajada`}>{br.ratio.toFixed(2)}x</td>; })()}
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean3y ?? (r as any).mean ?? (r as any).mean3y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean5y ?? (r as any).mean5y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean10y ?? (r as any).mean10y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean3y_ema ?? (r as any).mean3yEma ?? (r as any).mean3y_ema)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean5y_ema ?? (r as any).mean5yEma ?? (r as any).mean5y_ema)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean10y_ema ?? (r as any).mean10yEma ?? (r as any).mean10y_ema)?.toFixed(2) ?? '—'}</td>
                </tr>
              )})})()}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">{ti('capeFootA', { n: capeRows.length })}{!cape.length && capeRows.length > 0 && <span className="text-caution-400"> · {ti('capeNoSeries')}</span>} · {ti('capeFootB')}</p>
      </div>
      <BhtForwardTable live={liveBhtRef} />
      {capeBhtDet.hover && <BhtDetailPopover hover={capeBhtDet.hover} detail={capeBhtDet.cache[capeBhtDet.hover.d]} forward={capeFwdCache[capeBhtDet.hover.d]} onLeave={() => capeBhtDet.scheduleClear()} onHold={() => capeBhtDet.cancelClear()} liveValue={(capeBhtDet.hover.d === liveBhtRef.current.d && liveBhtRef.current.v != null) ? liveBhtRef.current.v : null} />}
      {stockHover && (()=>{ const {ticker, d, x, y, cape:chCape, ratio:chRatio}=stockHover; const price=getClosestPrice(marketHistory[ticker], d); const p1y=getTickerPrice1Y(ticker,d); const perf1y=getTickerPerf1Y(ticker,d); const todayP=getTodayPrice(ticker); const perfTot=getTickerPerfTotal(ticker,d); const cagr=getTickerCAGR(ticker,d); const years=((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); const label=ticker==='^GSPC'?'SP500':ticker==='^IXIC'?'Nasdaq':ticker; const left = Math.min(Math.max(8, x+12), (typeof window!=='undefined'? window.innerWidth-332: 1000)); const top = Math.min(Math.max(8, y+12), (typeof window!=='undefined'? window.innerHeight-260: 800)); const nextD = (()=>{ const nd=new Date(d); nd.setMonth(nd.getMonth()+12); return nd.toISOString().slice(0,10); })(); return <div className="fixed z-[9999] w-[320px] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-relaxed text-slate-200 text-left" style={{left, top}} onMouseLeave={()=>setStockHover(null)}><div className="font-bold text-sky-300 mb-1.5 flex justify-between"><span>{label} · {d}</span><span className="text-slate-400 font-mono">CAPE {chCape?.toFixed(2) ?? '—'} · {chRatio!=null? chRatio.toFixed(2)+'×':'—'}</span></div><div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]"><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Precio entonces</div><div className="text-slate-100 font-bold">{price!=null? '$'+Number(price).toFixed(2):'—'}</div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Hoy {new Date().toISOString().slice(0,10)}</div><div className="text-slate-100 font-bold">{todayP!=null? '$'+Number(todayP).toFixed(2):'—'} <span className={perfTot!=null && perfTot>0?'text-favorable-400':'text-risk-400'}>{perfTot!=null? (perfTot>0?'▲ ':'▼ ')+perfTot.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">+1 año {nextD}</div><div className="text-slate-100 font-bold">{p1y!=null? '$'+Number(p1y).toFixed(2):'—'} <span className={perf1y!=null && perf1y>0?'text-favorable-400':'text-risk-400'}>{perf1y!=null? (perf1y>0?'▲ ':'▼ ')+perf1y.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">CAGR ({years}a)</div><div className="text-caution-300 font-bold">{cagr!=null? (cagr>0?'▲ ':'▼ ')+cagr.toFixed(2)+'%':'—'}</div></div></div><div className="text-[10px] text-slate-500 mt-1.5">{ticker==='TQQQ'?'TQQQ 3× Nasdaq · inception 2010-02-11':'S&P 500 / Nasdaq · valor nominal + performance 1Y y total'} · CAPE ratio = CAPE/mean3y</div></div>; })()}
    </>
  );
}
