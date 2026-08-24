'use client';
import { useEffect, useState, useRef } from 'react';
import { MarginGdpChart } from './MarginGdpChart';
import { Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import { useQuery } from '@tanstack/react-query';
import { getLiveStaleTime, isMarketOpen } from '@/lib/queryClient';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

function useLiveTicker(ticker: string){
  return useQuery({
    queryKey: ['live', ticker],
    queryFn: async ()=>{
      const base = getApiBase();
      const r = await fetch(`${base}/api/backtesting/market-data/live?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      if(!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ticker:string; close:number|null; date:string; source:string}>;
    },
    staleTime: getLiveStaleTime(ticker),
    gcTime: 10*60*1000,
    refetchOnWindowFocus: false,
    refetchInterval: (q)=>{
      const t = (q.queryKey as string[])[1];
      if (['DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','CAPE'].includes(t)) return false as any;
      return isMarketOpen() ? 5*60*1000 : false as any;
    },
  });
}

export function IndicatorsPanel() {
  const [indicators, setIndicators] = useState<any[]>([]);
  const [cape, setCape] = useState<any[]>([]);
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [markets, setMarkets] = useState<Record<string, number | null>>({});
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [stockHover, setStockHover] = useState<null | {ticker:string; d:string; x:number; y:number; cape:number|null; ratio:number|null}>(null);
  const observerRef = useRef<HTMLTableRowElement | null>(null) as any;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // live tickers para fila actual (mercado + FRED); CAPE sigue desde DB/csv (mensual)
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
  const liveGdpc1 = useLiveTicker('GDPC1');
  const liveFinra = useLiveTicker('FINRA_DEBIT');
  const liveMap: Record<string, any> = { '^GSPC': liveGspc, '^IXIC': liveIxic, 'TQQQ': liveTqqq, 'CPIAUCSL': liveCpi, 'CPILFESL': liveCore, 'DFEDTARU': liveFed, 'DGS2': live2y, 'DGS10': live10y, 'DGS30': live30y, 'BAMLH0A0HYM2': liveHyOas, 'BAMLH0A0HYM2EY': liveHyEy, 'GDP': liveGdp, 'GDPC1': liveGdpc1, 'FINRA_DEBIT': liveFinra };
  // Historial para gráfica: merge BD + live más reciente para siempre estar al día
  const chartHistory = (() => {
    const merged: Record<string, Map<string, number>> = {};
    for (const [k, mp] of Object.entries(marketHistory)) merged[k] = new Map(mp as Map<string, number>);
    for (const [tk, q] of Object.entries(liveMap as Record<string, any>)) {
      const d = (q as any)?.data?.date?.slice(0,10);
      const v = (q as any)?.data?.close;
      const src = (q as any)?.data?.source;
      if (d && v!=null && src!=='db-fallback') {
        if (!merged[tk]) merged[tk] = new Map();
        merged[tk].set(d, Number(v));
      }
    }
    return merged;
  })();
  function getClosestPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    if (!map) return null;
    for (let i = 0; i < lookback; i++) {
      const d = new Date(isoDate);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const v = map.get(k);
      if (v != null) return v;
    }
    return null;
  }
  function getRecentPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    const v = getClosestPrice(map, isoDate, lookback);
    if (v != null) return v;
    if (!map || map.size===0) return null;
    // forward-fill: último disponible <= isoDate (para mensuales/trimestrales con lag)
    let best: string | null = null;
    for (const k of map.keys()) {
      if (k <= isoDate && (best==null || k > best)) best = k;
    }
    return best ? map.get(best)! : null;
  }
  function getMarginGdpRatio(isoDate: string): number | null {
    const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], isoDate, 45);
    const gdp = getRecentPrice(marketHistory['GDP'], isoDate, 120);
    if (finra==null || gdp==null || gdp===0) return null;
    return (finra/1000)/gdp*100;
  }
  function getCpiYoY(map: Map<string, number> | undefined, isoDate: string): number | null {
    // Inflación mensual: no se mueve diario — usar mes más reciente <= isoDate
    if (!map || map.size===0) return null;
    let curDate: string | null = null;
    for (let i=0;i<40;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); if(map.has(k)){ curDate=k; break; } }
    if(!curDate){ for(const k of map.keys()) if(k<=isoDate && (curDate==null || k>curDate)) curDate=k; }
    if(!curDate) return null;
    const cur = map.get(curDate)!;
    const cd = new Date(curDate); cd.setFullYear(cd.getFullYear()-1);
    const prevIso = cd.toISOString().slice(0,10);
    const prev = getRecentPrice(map, prevIso, 40);
    if (prev==null || prev===0) return null;
    return (cur/prev -1)*100;
  }
  function getPerf1Y(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null) return null;
    const d = new Date(isoDate);
    d.setMonth(d.getMonth() + 12);
    const targetIso = d.toISOString().slice(0, 10);
    // si target es futuro (hoy es 2026-08-20), no hay dato
    if (new Date(targetIso) > new Date()) return null;
    const price1y = getClosestPrice(marketHistory['^GSPC'], targetIso);
    if (price1y == null) return null;
    return (price1y / price - 1) * 100;
  }
  function getPerfTotal(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    // preferir live de hoy si existe, sino último cierre disponible (lookback 7d)
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let todayPrice: number | null = null;
    if (liveToday != null && liveSrc !== 'db-fallback') todayPrice = Number(liveToday);
    else todayPrice = getClosestPrice(marketHistory['^GSPC'], todayIso);
    if (todayPrice == null || todayPrice === 0) return null;
    // si es hoy mismo, performance 0
    if (isoDate.slice(0,10) === todayIso) return 0;
    return (todayPrice / price - 1) * 100;
  }
  function getCAGR(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null || price <= 0) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let todayPrice: number | null = null;
    if (liveToday != null && liveSrc !== 'db-fallback') todayPrice = Number(liveToday);
    else todayPrice = getClosestPrice(marketHistory['^GSPC'], todayIso);
    if (todayPrice == null || todayPrice <= 0) return null;
    if (isoDate.slice(0,10) === todayIso) return 0;
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const years = (new Date(todayIso).getTime() - new Date(isoDate.slice(0,10)).getTime()) / msPerYear;
    if (years <= 0.08) return null; // < ~1 mes => CAGR no significativo
    return (Math.pow(todayPrice / price, 1 / years) - 1) * 100;
  }
  // Helpers genéricos por ticker para tooltip SP500/Nasdaq/TQQQ
  function getTickerPrice1Y(ticker: string, isoDate: string): number | null {
    const d = new Date(isoDate); d.setMonth(d.getMonth()+12);
    const targetIso = d.toISOString().slice(0,10);
    if (new Date(targetIso) > new Date()) return null;
    return getClosestPrice(marketHistory[ticker], targetIso);
  }
  function getTickerPerf1Y(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    const price1y = getTickerPrice1Y(ticker, isoDate);
    if (price==null || price1y==null) return null;
    return (price1y/price -1)*100;
  }
  function getTickerPerfTotal(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    if (price==null) return null;
    const todayIso = new Date().toISOString().slice(0,10);
    if (isoDate.slice(0,10)===todayIso) return 0;
    const liveMapAny: any = liveMap;
    let todayPrice: number | null = null;
    // intentar live específico del ticker si existe
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') todayPrice = Number(liveGspc.data.close);
    else if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') todayPrice = Number(liveIxic.data.close);
    else if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') todayPrice = Number(liveTqqq.data.close);
    else todayPrice = getClosestPrice(marketHistory[ticker], todayIso);
    if (todayPrice==null || todayPrice===0) return null;
    return (todayPrice/price -1)*100;
  }
  function getTickerCAGR(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    if (price==null || price<=0) return null;
    const todayIso = new Date().toISOString().slice(0,10);
    if (isoDate.slice(0,10)===todayIso) return 0;
    let todayPrice: number | null = null;
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') todayPrice = Number(liveGspc.data.close);
    else if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') todayPrice = Number(liveIxic.data.close);
    else if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') todayPrice = Number(liveTqqq.data.close);
    else todayPrice = getClosestPrice(marketHistory[ticker], todayIso);
    if (todayPrice==null || todayPrice<=0) return null;
    const years = (new Date(todayIso).getTime() - new Date(isoDate.slice(0,10)).getTime())/(365.25*24*60*60*1000);
    if (years<=0.08) return null;
    return (Math.pow(todayPrice/price, 1/years)-1)*100;
  }
  function getTodayPrice(ticker: string): number | null {
    const todayIso = new Date().toISOString().slice(0,10);
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') return Number(liveGspc.data.close);
    if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') return Number(liveIxic.data.close);
    if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') return Number(liveTqqq.data.close);
    return getClosestPrice(marketHistory[ticker], todayIso);
  }
  function toggleSort(col: string){
    setSortCol(prev => {
      if(prev===col){ setSortDir(d=> d==='asc'?'desc':'asc'); return prev; }
      setSortDir(col==='date' ? 'desc' : 'desc');
      return col;
    });
  }

  useEffect(() => {
    const load = async () => {
      try {
        const base = getApiBase();
        const [indRes, capeRes] = await Promise.all([
          fetch(`${base}/indicators`, { cache: 'no-store' }),
          fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`, { cache: 'no-store' }),
        ]);
        if (indRes.ok) setIndicators(await indRes.json());
        if (capeRes.ok) {
          const j = await capeRes.json();
          // ya viene sin fines de semana desde backend/pipeline
          setCape(j);
        }
        const tickers = ['TQQQ', 'QQQ', 'SCHD', 'JEPQ', 'SQQQ', 'VOO', 'SPY', '^GSPC', '^IXIC', 'CPIAUCSL', 'CPILFESL', 'DFEDTARU', 'DGS2', 'DGS10', 'DGS30', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'GDP', 'GDPC1', 'FINRA_DEBIT'];
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const m: Record<string, number | null> = {};
        const hist: Record<string, Map<string, number>> = {};
        await Promise.all(
          tickers.map(async (t) => {
            try {
              // para tabla CAPE necesitamos histórico largo (1990) para SPX/Nasdaq/TQQQ
              const longFrom = '1990-01-01';
              const r = await fetch(`${base}/api/backtesting/market-data?ticker=${encodeURIComponent(t)}&from=${longFrom}&to=${to}`, { cache: 'no-store' });
              if (r.ok) {
                const j = await r.json();
                const mp = new Map<string, number>();
                for (const row of j) mp.set((row.date||'').slice(0,10), Number(row.close));
                hist[t] = mp;
                const last = j[j.length - 1];
                m[t] = last ? Number(last.close) : null;
              } else { m[t]=null; hist[t]=new Map(); }
            } catch { m[t]=null; hist[t]=new Map(); }
          })
        );
        setMarkets(m);
        setMarketHistory(hist);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const base = getApiBase();
      const r = await fetch(`${base}/api/market-sync/daily`, { method: 'POST' });
      if (r.ok) setSyncMsg('Sync OK — TQQQ/QQQ/SCHD/JEPQ/SQQQ + CAPE actualizados');
      else setSyncMsg(`Error: ${(await r.text()).slice(0,200)}`);
    } catch (e: any) { setSyncMsg(`Error: ${e.message}`); }
    setSyncing(false);
  };

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
  }, [capeView, cape.length, visibleCount]);
  useEffect(()=>{
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries)=>{
      if (entries[0].isIntersecting) setVisibleCount((prev:number)=> Math.min(prev+15, 10000));
    }, { threshold: 0.1 });
    if (observerRef.current) observer.observe(observerRef.current);
    return ()=> observer.disconnect();
  }, [visibleCount, capeView, cape.length, sortCol, sortDir]);

  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500">Cargando indicadores...</div>;

  const capeLast = cape[cape.length - 1];
  const liveFreshMin = (iso?: string) => {
    if(!iso) return null;
    const mins = Math.round((Date.now() - new Date(iso).getTime())/60000);
    if (mins < 60) return `hace ${mins} min`;
    const h = Math.floor(mins/60); return `hace ${h}h`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="font-semibold text-slate-100">Indicadores diarios — actualización automática</h3>
          <button onClick={runSync} disabled={syncing} className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm disabled:opacity-50">
            {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Cron <code className="text-teal-400">L-V 22:05 America/New_York</code> → <code>daily_update.py</code> (yfinance <code>auto_adjust</code> + <code>verify_splits</code>) + <code>build_shiller_daily()</code>.
          Último CAPE: <span className="text-emerald-400 font-mono">{capeLast?.cape?.toFixed(2) ?? '—'}</span> ratio {capeLast?.capeRatio?.toFixed(3) ?? '—'} @ {capeLast?.date?.slice(0,10) ?? '—'}
          <span className="ml-2 text-[11px] text-slate-500">· Precios/Bonos live vía API con caché (mercado 5 min / FRED 1h), CAPE diario desde DB</span>
          {syncMsg && <span className="ml-3 text-teal-400">{syncMsg}</span>}
        </p>
      </div>

      {/* === Cards agrupadas por categoría + tooltips === */}
      {(() => {
        const tooltipMap: Record<string, string> = {
          schiller_pe: 'CAPE = Precio / promedio 10a ganancias reales. >30 sobrevalorado (vender/reducir), 20-30 normal, <20 barato (comprar). Ratio = CAPE/mean3y.',
          pe_ratio: 'S&P 500 PE = Precio / EPS 12m. Alto = mercado caro vs beneficios. Complementa CAPE (corto plazo).',
          inflation: 'CPI YoY = (CPI_t / CPI_{t-12} -1)*100. >3% presiona Fed a subir tasas. Dato mensual FRED CPIAUCSL.',
          core_inflation: 'Core CPI sin alimentos/energía. Más estable, la Fed lo mira para decidir tasas.',
          fed_rate: 'FED Target Upper (DFEDTARU). 0.25% 2008-2015 ZIRP, hoy ~3.75%. Sube para frenar inflación.',
          treasury_30y: 'Treasury 30Y = tasa libre de riesgo larga. Base para valorar acciones vs bonos.',
          vix: 'VIX = volatilidad implícita S&P 500. >30 pánico, <15 complacencia.',
          fear_greed: 'Fear & Greed 0-100. <25 miedo (oportunidad), >75 avaricia (riesgo).',
          '^GSPC': 'S&P 500 (^GSPC) = índice 500 grandes USA. Referencia del mercado.',
          '^IXIC': 'Nasdaq (^IXIC) = tecnológico. Más volátil que S&P.',
          'TQQQ': 'TQQQ = 3× QQQ diario. Decae con volatilidad, solo para tácticas cortas.',
          'QQQ': 'QQQ = Nasdaq-100. Base para señal Mallik.',
          'SPY': 'SPY = S&P 500 ETF. Buy&Hold benchmark.',
          'VOO': 'VOO = S&P 500 Vanguard. Alternativa SPY.',
          'SCHD': 'SCHD = Dividendos calidad. Inception 2011-10-20.',
          'JEPQ': 'JEPQ = Nasdaq con covered calls + yield. Inception 2022-05-03.',
          'SQQQ': 'SQQQ = -3× QQQ (inverso). Cobertura bajista.',
          'DFEDTARU': 'FED Target Upper. Ver fed_rate.',
          'DGS2': 'Treasury 2Y = tasa corta. 2Y > 10Y = curva invertida (anticipa recesión).',
          'DGS10': 'Treasury 10Y = risk-free. Base para HY 10Y+OAS.',
          'DGS30': 'Treasury 30Y = larga. Ver treasury_30y.',
          'CPIAUCSL': 'CPI YoY = inflación total. Ver inflation.',
          'CPILFESL': 'Core CPI YoY. Ver core_inflation.',
          'BAMLH0A0HYM2': 'HY OAS = prima riesgo high-yield sobre Treasuries. >5% estrés (2008/2020). Proxy BAA10Y*1.91 pre-2023.',
          'BAMLH0A0HYM2EY': 'HY Effective Yield = tasa total HY (cupón+precio). Lo que pagan empresas HY.',
          'GDP': 'GDP = PIB nominal trimestral USA (FRED GDP, $ billones SAAR). >4% nominal fuerte, <2% débil. Se muestra con YoY nominal y real.',
          'GDPC1': 'GDPC1 = PIB real (ajustado inflación, billones 2017$). >2% expansión, <0% recesión. FRED GDPC1, YoY real = crecimiento volumen.',
          'FINRA_DEBIT': 'FINRA Debit = saldos deudores en cuentas de margen (FINRA, millones $). Alto = apalancamiento elevado, riesgo de margin calls. Dato mensual, Excel FINRA. 1997→hoy.',
          'MARGIN_GDP': 'Apalancamiento/PIB = FINRA Debit / PIB nominal. >6% extremo (euforia apalancada, riesgo de crash), 4-6% elevado, 2-4% normal, <2% bajo. Anticipa deleveraging.',
        };
        const catOrder = [
          { key: 'valoracion', label: 'Valoración', icon: '📊', keys: ['schiller_pe','pe_ratio'] },
          { key: 'inflacion', label: 'Inflación y Política Monetaria', icon: '🏛️', keys: ['inflation','core_inflation','fed_rate'] },
          { key: 'tasas', label: 'Curva y Crédito', icon: '📈', keys: ['treasury_30y','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'] },
          { key: 'crecimiento', label: 'Crecimiento', icon: '🏭', keys: ['GDP'] },
          { key: 'apalancamiento', label: 'Apalancamiento', icon: '💳', keys: ['FINRA_DEBIT','MARGIN_GDP'] },
          { key: 'mercado', label: 'Mercado al contado', icon: '💹', keys: ['^GSPC','^IXIC','TQQQ','QQQ','SPY','VOO','SCHD','JEPQ','SQQQ'] },
          { key: 'sentimiento', label: 'Sentimiento', icon: '😱', keys: ['vix','fear_greed'] },
        ];
        const indByKey = new Map(indicators.map((i:any)=>[i.key, i]));
        const mktTickers = Object.keys(markets);
        const renderTooltip = (text:string) => (
          <div className="group relative inline-flex ml-1">
            <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center cursor-help border border-slate-600">?</span>
            <div className="hidden group-hover:block absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 shadow-xl leading-relaxed whitespace-normal">{text}</div>
          </div>
        );
        const IndicatorCard = ({ind}:{ind:any}) => {
          const isSchiller = ind.key === 'schiller_pe';
          // Priorizar live FRED para que card y tabla coincidan (5.25% stale → 3.75% live)
          const liveTickerForInd: Record<string,string> = { fed_rate:'DFEDTARU', treasury_30y:'DGS30', inflation:'CPIAUCSL', core_inflation:'CPILFESL' };
          const liveKey = liveTickerForInd[ind.key];
          const liveVal = liveKey ? liveMap[liveKey]?.data?.close : null;
          const liveSrc = liveKey ? liveMap[liveKey]?.data?.source : null;
          const useLive = liveVal!=null && liveSrc!=='db-fallback';
          const isInflation = ind.key==='inflation' || ind.key==='core_inflation';
          const inflationYoY = isInflation ? getCpiYoY(marketHistory[liveKey!], liveMap[liveKey!]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const displayValue = isSchiller && capeLast?.cape != null ? capeLast.cape : (isInflation && inflationYoY!=null ? inflationYoY : (useLive ? liveVal : ind.currentValue));
          const displayStatus = isSchiller && capeLast?.cape != null ? (capeLast.cape >= 30 ? 'High' : capeLast.cape >= 20 ? 'Normal' : 'Low') : ind.status;
          const tip = tooltipMap[ind.key] || ind.description || '';
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
              <div className="text-xs text-slate-500 flex items-center">{ind.key} {isSchiller && <span className="text-teal-400 ml-1">(diario)</span>} {tip && renderTooltip(tip + (isSchiller && capeLast?.cape!=null ? ` Sincronizado: ${capeLast.cape.toFixed(2)} @ ${(capeLast.date||'').slice(0,10)}` : ''))}</div>
              <div className="font-semibold text-slate-100 truncate">{ind.name}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-mono text-emerald-400">{displayValue != null ? Number(displayValue).toFixed(2) : '—'}{ind.unit}{isInflation && inflationYoY!=null ? <span className="text-[10px] text-slate-500 ml-1">YoY</span> : null}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${displayStatus==='High'?'bg-orange-500/20 text-orange-400 border-orange-500/30':displayStatus==='Greed'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-slate-800 text-slate-400 border-slate-700'}`}>{displayStatus}</span>
              </div>
              {isInflation && liveVal!=null && <div className="text-[10px] font-mono text-slate-500">Índice {Number(liveVal).toFixed(2)}</div>}
              <div className="text-xs text-slate-500 mt-2 line-clamp-2">{ind.description}</div>
            </div>
          );
        };
        const MarketCard = ({t,v}:{t:string,v:number|null}) => {
          const isMarginGdp = t==='MARGIN_GDP';
          if (isMarginGdp) {
            const finraVal = liveFinra?.data?.close ?? getRecentPrice(marketHistory['FINRA_DEBIT'], new Date().toISOString().slice(0,10), 45);
            const gdpVal = liveGdp?.data?.close ?? getRecentPrice(marketHistory['GDP'], new Date().toISOString().slice(0,10), 120);
            const ratio = finraVal!=null && gdpVal!=null && gdpVal!==0 ? (finraVal/1000)/gdpVal*100 : null;
            const tip = tooltipMap[t] || '';
            const fresh = liveFreshMin(liveFinra?.data?.date || liveGdp?.data?.date);
            const level = ratio==null ? null : ratio>6?'Extremo': ratio>4?'Elevado': ratio>2?'Normal':'Bajo';
            const levelColor = ratio==null?'text-slate-400': ratio>6?'text-red-400': ratio>4?'text-orange-400': ratio>2?'text-yellow-400':'text-emerald-400';
            return (
              <div className="border rounded-lg px-3 py-2 bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">MARGIN_GDP {tip && renderTooltip(tip)} <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold">Ratio</span></div>
                <div className="font-mono text-slate-100 text-lg">{ratio!=null? `${ratio.toFixed(2)}%`:'—'}</div>
                {ratio!=null && <div className={`text-[11px] font-mono font-semibold ${levelColor}`}>{level} · FINRA ${(finraVal!/1000).toFixed(0)}B / GDP ${(gdpVal!/1000).toFixed(1)}T</div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · FINRA/GDP</div>}
              </div>
            );
          }
          const q:any = liveMap[t];
          const live = q?.data?.close;
          const src = q?.data?.source;
          const fresh = liveFreshMin(q?.data?.date);
          const showLive = live!=null && src!=='db-fallback';
          const tip = tooltipMap[t] || '';
          const isCpi = t==='CPIAUCSL' || t==='CPILFESL';
          const isYield = ['DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'].includes(t);
          const isGDP = t==='GDP';
          const isFinra = t==='FINRA_DEBIT';
          const fmt = (n:number) => isGDP ? `$${(n/1000).toFixed(1)}T` : isFinra ? `$${(n/1000).toFixed(0)}B` : isYield ? `${n.toFixed(2)}%` : `$${n.toFixed(2)}`;
          // CPI cards: YoY mensual fijo (no diario) — live usa mes más reciente
          const cpiYoYForCard = isCpi ? getCpiYoY(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const gdpYoY = (()=>{ if(t!=='GDP') return null; const cur = showLive ? Number(live) : (v!=null? Number(v): null); if(cur==null) return null; const refDate = q?.data?.date || new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDP'], iso, 95) ?? getClosestPrice(marketHistory['GDP'], refDate, 95);
            let p = prev; if(p==null){ const qd = new Date(refDate); qd.setMonth(qd.getMonth()-12); p = getClosestPrice(marketHistory['GDP'], qd.toISOString().slice(0,10), 95); } if(p==null || p===0) return null; return (cur/p -1)*100; })();
          const gdpc1YoY = (()=>{ if(t!=='GDP') return null; const curReal = liveGdpc1?.data?.close ?? getClosestPrice(marketHistory['GDPC1'], liveGdpc1?.data?.date || new Date().toISOString().slice(0,10), 95); if(curReal==null) return null; const refDate = liveGdpc1?.data?.date || q?.data?.date || new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDPC1'], iso, 95); let p=prev; if(p==null){ const qd=new Date(refDate); qd.setMonth(qd.getMonth()-12); p=getClosestPrice(marketHistory['GDPC1'], qd.toISOString().slice(0,10),95);} if(p==null||p===0) return null; return (curReal/p -1)*100; })();
          // Para CPI mostrar YoY con índice como subtítulo
          if (isCpi) {
            const idxVal = showLive ? Number(live) : (v!=null ? Number(v) : null);
            return (
              <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
                <div className="font-mono text-slate-100">{cpiYoYForCard!=null ? `${cpiYoYForCard.toFixed(2)}%` : '—'} <span className="text-[10px] text-slate-500">YoY</span></div>
                {idxVal!=null && <div className="text-[10px] font-mono text-slate-500">Índice {idxVal.toFixed(2)}</div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
              </div>
            );
          }
          return (
            <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
              <div className="font-mono text-slate-100">{showLive ? fmt(Number(live)) : (v!=null ? fmt(Number(v)) : '—')}</div>
              {isGDP && (gdpYoY!=null || gdpc1YoY!=null) && <div className="flex gap-2 text-[11px] font-mono font-semibold"><span className={gdpYoY!=null && gdpYoY>=0?'text-emerald-400':'text-red-400'}>{gdpYoY!=null? `${gdpYoY>=0?'▲':'▼'} ${Math.abs(gdpYoY).toFixed(2)}% Nom`:'— Nom'}</span><span className="text-slate-600">·</span><span className={gdpc1YoY!=null && gdpc1YoY>=0?'text-sky-400':'text-orange-400'}>{gdpc1YoY!=null? `${gdpc1YoY>=0?'▲':'▼'} ${Math.abs(gdpc1YoY).toFixed(2)}% Real`:'— Real'}</span></div>}
              {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
            </div>
          );
        };
        return (
          <div className="space-y-5">
            {catOrder.map(cat => {
              const inds = cat.keys.map(k=>indByKey.get(k)).filter(Boolean);
              const mkts = cat.keys.filter(k=> k==='MARGIN_GDP' || mktTickers.includes(k)).map(k=> [k, markets[k] ?? (k==='MARGIN_GDP'? getMarginGdpRatio(new Date().toISOString().slice(0,10)): null)] as const);
              if (inds.length===0 && mkts.length===0) return null;
              return (
                <div key={cat.key} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2"><span>{cat.icon}</span> {cat.label} <span className="text-xs font-normal text-slate-500">— {inds.length + mkts.length} activos</span></h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {inds.map((ind:any)=><IndicatorCard key={ind.key} ind={ind} />)}
                  </div>
                  {mkts.length>0 && (
                    <>
                      {inds.length>0 && <div className="h-px bg-slate-800 my-3" />}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {mkts.map(([t,v])=> <MarketCard key={t} t={t as string} v={v as number|null} />)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-slate-500">Mercado live Yahoo (5 min) + FRED (1h). CAPE diario desde DB. Hover “?” para interpretación.</p>
          </div>
        );
      })()}
      <MarginGdpChart marketHistory={chartHistory} cape={cape} />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">CAPE Shiller — SP500 / Nasdaq / TQQQ</h3>
          <div className="flex items-center gap-2">
          <button onClick={()=>{
            const headers = ['Fecha','SP500','Perf 1Y','Perf Total','CAGR','Nasdaq','TQQQ','FED Target','2Y','10Y','30Y','HY OAS','HY EY','HY 10Y+OAS','CAPE','mean3y','Ratio','CPI','Core CPI','GDP','FINRA Debit','Margin/GDP','CAPE SMA 3Y','CAPE SMA 5Y','CAPE SMA 10Y','CAPE EMA 3Y','CAPE EMA 5Y','CAPE EMA 10Y'];
            const buildSheet = (view: 'daily'|'monthly'|'yearly')=>{
              let rowsView: any[] = cape;
              if(view==='monthly'){
                const byMonth = new Map<string, any>();
                for(const r of cape) byMonth.set((r.date||'').slice(0,7), r);
                rowsView = Array.from(byMonth.values());
              } else if(view==='yearly'){
                const byYear = new Map<string, any>();
                for(const r of cape) byYear.set((r.date||'').slice(0,4), r);
                rowsView = Array.from(byYear.values());
              }
              const sortedView: any[] = [...rowsView].sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
              if(sortCol!=='date'){
                const getVal = (r:any)=>{
                  const d=(r.date||'').slice(0,10);
                  if(sortCol==='spx') return getClosestPrice(marketHistory['^GSPC'], d) ?? -1e9;
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
                  if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -1e9;
                  if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -1e9;
                  if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -1e9;
                  if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -1e9;
                  if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -1e9;
                  if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -1e9;
                  if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -1e9; }
                  if(sortCol==='cape') return r.cape ?? -1e9;
                  if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -1e9);
                  if(sortCol==='ratio') return r.capeRatio ?? -1e9;
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
                const cpi = getCpiYoY(marketHistory['CPIAUCSL'], d);
                const core = getCpiYoY(marketHistory['CPILFESL'], d);
                const perf1y = getPerf1Y(d);
                const perfTot = getPerfTotal(d);
                const cagr = getCAGR(d);
                const gdp = getRecentPrice(marketHistory['GDP'], d, 120);
                const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45);
                const marginGdp = getMarginGdpRatio(d);
                return [label, getClosestPrice(marketHistory['^GSPC'], d) ?? '', perf1y != null ? Number(perf1y.toFixed(2)) : '', perfTot != null ? Number(perfTot.toFixed(2)) : '', cagr != null ? Number(cagr.toFixed(2)) : '', getClosestPrice(marketHistory['^IXIC'], d) ?? '', getClosestPrice(marketHistory['TQQQ'], d) ?? '', getClosestPrice(marketHistory['DFEDTARU'], d) ?? '', getClosestPrice(marketHistory['DGS2'], d) ?? '', getClosestPrice(marketHistory['DGS10'], d) ?? '', getClosestPrice(marketHistory['DGS30'], d) ?? '', hyOas ?? '', hyEy ?? '', hy10y, r.cape ?? '', (r.mean3y ?? r.mean) ?? '', r.capeRatio ?? '', cpi ?? '', core ?? '', gdp ?? '', finra ?? '', marginGdp != null ? Number(marginGdp.toFixed(2)) : '', (r.mean3y ?? -1e9) !== -1e9 ? (r.mean3y ?? r.mean) : '', r.mean5y ?? '', r.mean10y ?? '', (r.mean3y_ema ?? (r as any).mean3yEma) ?? '', (r.mean5y_ema ?? (r as any).mean5yEma) ?? '', (r.mean10y_ema ?? (r as any).mean10yEma) ?? ''];
              });
              return { name: `CAPE ${view}`, headers, rows: rowsData };
            };
            const sheets = [buildSheet('daily'), buildSheet('monthly'), buildSheet('yearly')];
            exportToExcel(`CAPE-Shiller-Completo-${new Date().toISOString().slice(0,10)}.xlsx`, sheets);
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition">
            <Download size={14} /> Excel (3 pestañas)
          </button>
          <div className="flex gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg">
            {(['daily','monthly','yearly'] as const).map(v=>(
              <button key={v} onClick={()=>setCapeView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-teal-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v==='daily'?'Daily':v==='monthly'?'Monthly':'Yearly'}</button>
            ))}
          </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">CAPE diario (reconstruido) — 6 suavizados diarios. Ratio = CAPE / mean3y SMA. Vista {capeView} (default daily). Click en headers para ordenar.</p>
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
                  {k:'perf1y', label:'Perf 1Y', cls:'text-right text-lime-300'},
                  {k:'perfTotal', label:'Perf Total', cls:'text-right text-teal-300'},
                  {k:'cagr', label:'CAGR', cls:'text-right text-amber-300'},
                  {k:'ndx', label:'Nasdaq', cls:'text-right text-sky-300'},
                  {k:'tqqq', label:'TQQQ', cls:'text-right text-sky-300'},
                  {k:'fed', label:'FED Target', cls:'text-right text-violet-300'},
                  {k:'dgs2', label:'2Y', cls:'text-right text-cyan-300'},
                  {k:'dgs10', label:'10Y', cls:'text-right text-cyan-300'},
                  {k:'dgs30', label:'30Y', cls:'text-right text-cyan-300'},
                  {k:'hyOas', label:'HY OAS', cls:'text-right text-orange-300'},
                  {k:'hyEy', label:'HY EY', cls:'text-right text-orange-300'},
                  {k:'hy10y', label:'HY 10Y+OAS', cls:'text-right text-orange-300'},
                  {k:'cape', label:'CAPE', cls:'text-right'},
                  {k:'mean3y', label:'mean3y', cls:'text-right text-amber-300'},
                  {k:'ratio', label:'Ratio', cls:'text-right'},
                  {k:'cpi', label:'CPI', cls:'text-right text-emerald-300'},
                  {k:'core', label:'Core CPI', cls:'text-right text-emerald-300'},
                  {k:'gdp', label:'GDP', cls:'text-right text-indigo-300'},
                  {k:'finra', label:'FINRA Debit', cls:'text-right text-rose-300'},
                  {k:'marginGdp', label:'Margin/GDP', cls:'text-right text-rose-300'},
                  {k:'sma3y', label:'CAPE SMA 3Y', cls:'text-right'},
                  {k:'sma5y', label:'CAPE SMA 5Y', cls:'text-right'},
                  {k:'sma10y', label:'CAPE SMA 10Y', cls:'text-right'},
                  {k:'ema3y', label:'CAPE EMA 3Y', cls:'text-right'},
                  {k:'ema5y', label:'CAPE EMA 5Y', cls:'text-right'},
                  {k:'ema10y', label:'CAPE EMA 10Y', cls:'text-right'},
                ].map(col=>(
                  <th key={col.k} onClick={()=>toggleSort(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-teal-300 ${sortCol===col.k?'text-teal-300':''}`}>
                    {col.label} <span className="text-[10px]">{sortCol===col.k ? (sortDir==='asc'?'▲':'▼') : '↕'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {(()=>{
                let rows = cape;
                if (capeView==='monthly') {
                  const byMonth = new Map<string, any>();
                  for (const r of cape) byMonth.set((r.date||'').slice(0,7), r);
                  rows = Array.from(byMonth.values());
                } else if (capeView==='yearly') {
                  const byYear = new Map<string, any>();
                  for (const r of cape) byYear.set((r.date||'').slice(0,4), r);
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
                    if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -Infinity;
                    if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -Infinity;
                    if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -Infinity;
                    if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -Infinity;
                    if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -Infinity;
                    if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -Infinity;
                    if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -Infinity; }
                    if(sortCol==='cape') return r.cape ?? -Infinity;
                    if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -Infinity);
                    if(sortCol==='ratio') return r.capeRatio ?? -Infinity;
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
                const ratioColor = ratio==null ? 'text-slate-400' : ratio < 0.9 ? 'text-emerald-400' : ratio < 1.05 ? 'text-green-400' : ratio < 1.18 ? 'text-yellow-400' : ratio < 1.35 ? 'text-orange-400' : 'text-red-400';
                const ratioBg = ratio==null ? '' : ratio < 0.9 ? 'bg-emerald-500/10' : ratio < 1.05 ? 'bg-green-500/10' : ratio < 1.18 ? 'bg-yellow-500/10' : ratio < 1.35 ? 'bg-orange-500/10' : 'bg-red-500/10';
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
                const hyOasLive = useLive ? liveHyOas.data?.close : null;
                const hyEyLive = useLive ? liveHyEy.data?.close : null;
                const hyOasDisp = (hyOasLive!=null) ? hyOasLive : hyOas;
                const hyEyDisp = (hyEyLive!=null) ? hyEyLive : hyEy;
                const hy10yDisp = (hyOasDisp!=null && dgs10Disp!=null) ? dgs10Disp + hyOasDisp : hy10y;
                return (
                <tr key={r.date} ref={isLast ? observerRef : null} className={`${isCurrent ? 'bg-teal-500/[0.08] border-l-2 border-l-teal-500 ring-1 ring-teal-500/15' : 'hover:bg-slate-900/40'} transition-colors`}>
                  <td className={`p-1.5 px-2 font-mono whitespace-nowrap w-[92px] min-w-[92px] max-w-[92px] align-top sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.25)] ${isCurrent ? 'bg-slate-900' : 'bg-slate-950 group-hover:bg-slate-900'}`}><div className="flex flex-col items-start leading-none gap-0.5"><span className={`${isCurrent ? 'text-teal-300 font-bold' : 'text-slate-200'} text-xs`}>{capeView==='yearly' ? d.slice(0,4) : capeView==='monthly' ? d.slice(0,7) : d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500 text-white font-bold leading-none">Actual</span>}</div></td>
                  {(()=>{ if(spxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^GSPC', d, x: e.clientX, y: e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^GSPC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(spxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ const p=getPerf1Y(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>15?'text-emerald-400 bg-emerald-500/10':p>5?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-5?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`SP500 ${d} → +12m`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getPerfTotal(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>100?'text-emerald-300 bg-emerald-500/15':p>50?'text-emerald-400 bg-emerald-500/10':p>15?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-10?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const todayS = new Date().toISOString().slice(0,10); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`SP500 ${d} → hoy ${todayS}`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getCAGR(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>15?'text-emerald-400 bg-emerald-500/10':p>10?'text-green-400 bg-green-500/10':p>5?'text-yellow-400 bg-yellow-500/10':p>0?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const years = ((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`CAGR ${d} → hoy (${years}a): (Phoy/Pd)^(1/años)-1`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ if(ndxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^IXIC', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^IXIC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(ndxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ if(tqqqDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'TQQQ', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='TQQQ' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(tqqqDisp).toFixed(2)}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-violet-300 whitespace-nowrap">{fedDisp!=null?`${Number(fedDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs2Disp!=null?`${Number(dgs2Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs10Disp!=null?`${Number(dgs10Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs30Disp!=null?`${Number(dgs30Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2 OAS">{hyOasDisp!=null?`${Number(hyOasDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2EY Effective Yield">{hyEyDisp!=null?`${Number(hyEyDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="DGS10 + OAS">{hy10yDisp!=null?`${Number(hy10yDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-emerald-400 whitespace-nowrap">{r.cape?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-amber-300 whitespace-nowrap">{(r.mean3y ?? r.mean)?.toFixed(2) ?? '—'}</td>
                  <td className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${ratioColor} ${ratioBg} rounded`}>{ratio!=null ? `${ratio.toFixed(3)}X` : '—'}</td>
                  <td className="p-2 text-right font-mono text-emerald-300 whitespace-nowrap">{cpiDisp!=null?`${Number(cpiDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-emerald-300 whitespace-nowrap">{coreDisp!=null?`${Number(coreDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-indigo-300 whitespace-nowrap">{gdpDisp!=null?`$${(Number(gdpDisp)/1000).toFixed(1)}T`:'—'}</td>
                  <td className="p-2 text-right font-mono text-rose-300 whitespace-nowrap">{(()=>{ const v=getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45); return v!=null? `$${(v/1000).toFixed(0)}B`:'—'; })()}</td>
                  {(()=>{ const v=getMarginGdpRatio(d); if(v==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=v>6?'text-red-400 bg-red-500/10 border-red-500/20':v>4?'text-orange-400 bg-orange-500/10 border-orange-500/20':v>2?'text-yellow-400 bg-yellow-500/10 border-yellow-500/20':'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold border rounded ${cls}`}>{v.toFixed(2)}%</td>; })()}
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
        <p className="text-[11px] text-slate-500 mt-2">Scroll para cargar más · {cape.length} días (1990→hoy, sin fines de semana) · SP500/Nasdaq/TQQQ cierre diario · SMA/EMA 3/5/10 sobre CAPE diario · Ratio semaforizado</p>
      </div>
      {stockHover && (()=>{ const {ticker, d, x, y, cape:chCape, ratio:chRatio}=stockHover; const price=getClosestPrice(marketHistory[ticker], d); const p1y=getTickerPrice1Y(ticker,d); const perf1y=getTickerPerf1Y(ticker,d); const todayP=getTodayPrice(ticker); const perfTot=getTickerPerfTotal(ticker,d); const cagr=getTickerCAGR(ticker,d); const years=((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); const label=ticker==='^GSPC'?'SP500':ticker==='^IXIC'?'Nasdaq':ticker; const left = Math.min(Math.max(8, x+12), (typeof window!=='undefined'? window.innerWidth-332: 1000)); const top = Math.min(Math.max(8, y+12), (typeof window!=='undefined'? window.innerHeight-260: 800)); const nextD = (()=>{ const nd=new Date(d); nd.setMonth(nd.getMonth()+12); return nd.toISOString().slice(0,10); })(); return <div className="fixed z-[9999] w-[320px] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-relaxed text-slate-200 text-left" style={{left, top}} onMouseLeave={()=>setStockHover(null)}><div className="font-bold text-sky-300 mb-1.5 flex justify-between"><span>{label} · {d}</span><span className="text-slate-400 font-mono">CAPE {chCape?.toFixed(2) ?? '—'} · {chRatio!=null? chRatio.toFixed(2)+'×':'—'}</span></div><div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]"><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Precio entonces</div><div className="text-slate-100 font-bold">{price!=null? '$'+Number(price).toFixed(2):'—'}</div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Hoy {new Date().toISOString().slice(0,10)}</div><div className="text-slate-100 font-bold">{todayP!=null? '$'+Number(todayP).toFixed(2):'—'} <span className={perfTot!=null && perfTot>0?'text-emerald-400':'text-red-400'}>{perfTot!=null? (perfTot>0?'▲ ':'▼ ')+perfTot.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">+1 año {nextD}</div><div className="text-slate-100 font-bold">{p1y!=null? '$'+Number(p1y).toFixed(2):'—'} <span className={perf1y!=null && perf1y>0?'text-emerald-400':'text-red-400'}>{perf1y!=null? (perf1y>0?'▲ ':'▼ ')+perf1y.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">CAGR ({years}a)</div><div className="text-amber-300 font-bold">{cagr!=null? (cagr>0?'▲ ':'▼ ')+cagr.toFixed(2)+'%':'—'}</div></div></div><div className="text-[10px] text-slate-500 mt-1.5">{ticker==='TQQQ'?'TQQQ 3× Nasdaq · inception 2010-02-11':'S&P 500 / Nasdaq · valor nominal + performance 1Y y total'} · CAPE ratio = CAPE/mean3y</div></div>; })()}
    </div>
  );
}
