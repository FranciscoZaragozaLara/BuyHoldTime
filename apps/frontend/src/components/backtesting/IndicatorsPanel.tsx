'use client';
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { levelLabel } from '@/lib/levelLabels';
import { capeBandLabel } from '@/lib/capeBands';
import { buildEpsSchedule, epsAt } from '@/lib/spxEps';
import { PART_ORB_NAME } from '@/lib/orbHistory';
import { useMarketSyncStream } from './useMarketSyncStream';
import MarketSyncModal from './MarketSyncModal';
import { MarginGdpChart } from './MarginGdpChart';
import { BhtTimeline } from './BhtTimeline';
import { BhtStats } from './BhtStats';
import { CrisisEventsTable } from './CrisisEventsTable';
import { BHT_BANDS, bhtBand, capeScoreColor, BHT_CUTS } from './bhtBands';
import { buildCapeTableRows } from '@/lib/capeTableRows';
import { getClosestPrice, getCpiMa6, getCpiYoY, getMa126, getRecentPrice, isValidIsoDate, marginGdpMa24, marginGdpRatio } from '@/lib/seriesLookup';
import { useQueryClient } from '@tanstack/react-query';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { useIsAdmin } from '@/context/AuthContext';
import { TOKENS } from '@/lib/designTokens';
import { capeRiskScore, fwdRiskScore, ratioRiskScore, CPI_LVL_SEGS, CPI_TRD_SEGS, cpiMScore, Y2M_LVL_SEGS, Y2M_TRD_SEGS, Y30M_LVL_SEGS, y30mRiskScore, MG_SEGS, MG_TRD_SEGS, vixRiskScore, msRiskScore, gdpRiskScore, partName, partLabel, fwdBandLabel, CAPE_BANDS, RATIO_BANDS, ratioBandLabel, CPI_BANDS, cpiBandLabel, Y2M_BANDS, y2mBandLabel, Y30_BANDS, y30mBandLabel, hyBandLabel, MG_BANDS, mgBandLabel, GDP_BANDS, MS_BANDS, VIX_BANDS, oilRiskScore, OIL_BANDS, fgRiskScore, FG_BANDS, FWD_BANDS, type MomBlend, momBlend } from '@/lib/thermoScoring';
import { type ThermoLive, useThermoLive, useLiveTicker } from './useThermoLive';
import { BhtHistoryBlock, ScoreOrb } from './ThermoOrbs';
import { CapeHistoryTable } from './CapeHistoryTable';

const NAME_KEYS = ["fed_rate", "DGS2", "DGS10", "DGS30", "BAMLH0A0HYM2", "BAMLH0A0HYM2EY", "DFEDTARU", "CPIAUCSL", "CPILFESL", "M2SL", "BOGMBASE", "DCOILWTICO", "GDP", "GDPC1", "FINRA_DEBIT", "MARGIN_GDP", "MSACSR", "VIXCLS", "FEAR_GREED", "^GSPC", "^IXIC", "TQQQ", "QQQ", "SPY", "VOO", "SCHD", "JEPQ", "SQQQ", "SPX_ADV_VOL", "SPX_DEC_VOL", "NYSE_ADV_VOL", "NYSE_DEC_VOL", "NSDQ_ADV_VOL", "NSDQ_DEC_VOL"];
const TIP_KEYS = ["schiller_pe", "pe_ratio", "fwd_pe_ratio", "inflation", "core_inflation", "fed_rate", "treasury_30y", "vix", "fear_greed", "^GSPC", "^IXIC", "TQQQ", "QQQ", "SPY", "VOO", "SCHD", "JEPQ", "SQQQ", "DFEDTARU", "DGS2", "DGS10", "DGS30", "CPIAUCSL", "M2SL", "BOGMBASE", "DCOILWTICO", "CPILFESL", "BAMLH0A0HYM2", "BAMLH0A0HYM2EY", "GDP", "GDPC1", "FINRA_DEBIT", "MARGIN_GDP", "MSACSR", "VIXCLS", "FEAR_GREED", "NYSE_ADV_VOL", "NYSE_DEC_VOL", "NSDQ_ADV_VOL", "NSDQ_DEC_VOL", "SPX_ADV_VOL", "SPX_DEC_VOL"];

export function IndicatorsPanel() {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const [indicators, setIndicators] = useState<any[]>([]);
  const [cape, setCape] = useState<any[]>([]);
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);
  const [thermoView, setThermoView] = useState<'overview' | 'timeline' | 'stats'>('overview');
  const [markets, setMarkets] = useState<Record<string, number | null>>({});
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  // Filas de la tabla CAPE: serie CAPE o, si falta, días hábiles del SP500 (ver lib/capeTableRows).
  const capeRows: any[] = useMemo(() => buildCapeTableRows(cape, marketHistory['^GSPC']?.keys()), [cape, marketHistory]);
  // EPS registrado del S&P 500 (último mes de Shiller ya publicado a cada fecha; ver src/lib/spxEps.ts).
  const epsSchedule = useMemo(() => buildEpsSchedule(marketHistory['SPX_EPS']), [marketHistory]);
  const regEps = (d: string): number | null => epsAt(epsSchedule, d)?.eps ?? null;
  const [volHistory, setVolHistory] = useState<Record<string, Map<string, number>>>({});
  const [thermoHist, setThermoHist] = useState<Record<string, { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string }>>({});
  const liveBhtRef = useRef<{ v: number | null; d: string | null }>({ v: null, d: null });
  const [loading, setLoading] = useState(true);
  const tSync = useTranslations('Backtesting.regimes');
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const marketSync = useMarketSyncStream(async () => {
    // Tras la extracción, la caché live de react-query (1h FRED / 5-30min mercado)
    // seguiría sirviendo valores viejos en fila actual, cards y termómetro.
    // Invalidarla obliga a releer del backend sin recargar la página.
    await queryClient.invalidateQueries({ queryKey: ['live'] });
    await loadAll();
    window.dispatchEvent(new CustomEvent('bht:synced'));
  });
  const syncing = marketSync.refreshing;
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
  const liveM2 = useLiveTicker('M2SL');
  const liveM0 = useLiveTicker('BOGMBASE');
  const liveOil = useLiveTicker('DCOILWTICO');
  const liveGdp = useLiveTicker('GDP');
  const liveGdpc1 = useLiveTicker('GDPC1');
  const liveFinra = useLiveTicker('FINRA_DEBIT');
  const liveMsacsr = useLiveTicker('MSACSR');
  const liveVix = useLiveTicker('VIXCLS');
  const liveFg = useLiveTicker('FEAR_GREED');
  const liveNyAdv = useLiveTicker('NYSE_ADV_VOL');
  const liveNyDec = useLiveTicker('NYSE_DEC_VOL');
  const liveNqAdv = useLiveTicker('NSDQ_ADV_VOL');
  const liveNqDec = useLiveTicker('NSDQ_DEC_VOL');
  const liveSxAdv = useLiveTicker('SPX_ADV_VOL');
  const liveSxDec = useLiveTicker('SPX_DEC_VOL');
  const thermoLiveQ = useThermoLive();
  const liveMap: Record<string, any> = { '^GSPC': liveGspc, '^IXIC': liveIxic, 'TQQQ': liveTqqq, 'CPIAUCSL': liveCpi, 'CPILFESL': liveCore, 'M2SL': liveM2, 'BOGMBASE': liveM0, 'DCOILWTICO': liveOil, 'DFEDTARU': liveFed, 'DGS2': live2y, 'DGS10': live10y, 'DGS30': live30y, 'BAMLH0A0HYM2': liveHyOas, 'BAMLH0A0HYM2EY': liveHyEy, 'GDP': liveGdp, 'GDPC1': liveGdpc1, 'FINRA_DEBIT': liveFinra, 'MSACSR': liveMsacsr, 'VIXCLS': liveVix, 'FEAR_GREED': liveFg, 'NYSE_ADV_VOL': liveNyAdv, 'NYSE_DEC_VOL': liveNyDec, 'NSDQ_ADV_VOL': liveNqAdv, 'NSDQ_DEC_VOL': liveNqDec, 'SPX_ADV_VOL': liveSxAdv, 'SPX_DEC_VOL': liveSxDec };
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
  const getMarginGdpRatio = (d: string) => marginGdpRatio(marketHistory['FINRA_DEBIT'], marketHistory['GDP'], d);
  const getMarginGdpMa24 = (d: string, n = 24, minReal = 6) => marginGdpMa24(marketHistory['FINRA_DEBIT'], marketHistory['GDP'], d, n, minReal);

  // Carga completa de vista (misma que usa el botón Sync tras refrescar, igual que regímenes)
  const loadAll = useCallback(async () => {
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
        try {
          const thRes = await fetch(`${base}/api/backtesting/thermo-history?from=1993-01-01`, { cache: 'no-store' });
          if (thRes.ok) {
            const arr = await thRes.json();
            const m: Record<string, { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string }> = {};
            for (const row of arr) m[(row.date || '').slice(0, 10)] = row;
            setThermoHist(m);
          }
        } catch {}
        const tickers = ['TQQQ', 'QQQ', 'SCHD', 'JEPQ', 'SQQQ', 'VOO', 'SPY', '^GSPC', '^IXIC', 'CPIAUCSL', 'CPILFESL', 'M2SL', 'BOGMBASE', 'DCOILWTICO', 'DFEDTARU', 'DGS2', 'DGS10', 'DGS30', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'GDP', 'GDPC1', 'FINRA_DEBIT', 'MSACSR', 'VIXCLS', 'FEAR_GREED', 'NYSE_ADV_VOL', 'NYSE_DEC_VOL', 'NSDQ_ADV_VOL', 'NSDQ_DEC_VOL', 'SPX_ADV_VOL', 'SPX_DEC_VOL', 'SPX_EPS', 'SPX_FWD_EPS', 'NDX_PE', 'NDX_FWD_PE'];
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const m: Record<string, number | null> = {};
        const hist: Record<string, Map<string, number>> = {};
        const volh: Record<string, Map<string, number>> = {};
        await Promise.all(
          tickers.map(async (t) => {
            try {
              // para tabla CAPE necesitamos histórico largo (1990) para SPX/Nasdaq/TQQQ
              const longFrom = '1990-01-01';
              const r = await fetch(`${base}/api/backtesting/market-data?ticker=${encodeURIComponent(t)}&from=${longFrom}&to=${to}`, { cache: 'no-store' });
              if (r.ok) {
                const j = await r.json();
                const mp = new Map<string, number>();
                const vm = new Map<string, number>();
                for (const row of j) { const k=(row.date||'').slice(0,10); mp.set(k, Number(row.close)); const vv=Number(row.volume); if (isFinite(vv) && vv>0) vm.set(k, vv); }
                hist[t] = mp;
                volh[t] = vm;
                const last = j[j.length - 1];
                m[t] = last ? Number(last.close) : null;
              } else { m[t]=null; hist[t]=new Map(); volh[t]=new Map(); }
            } catch { m[t]=null; hist[t]=new Map(); volh[t]=new Map(); }
          })
        );
        setMarkets(m);
        setMarketHistory(hist);
        setVolHistory(volh);
      } catch {}
      setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runSync = () => marketSync.start(getApiBase());


  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500">{ti('loading')}</div>;

  const capeLast = cape[cape.length - 1];
  const thermoToday = new Date().toISOString().slice(0, 10);
  const thermoSpx = (liveGspc?.data?.close != null && liveGspc.data.source !== 'db-fallback') ? Number(liveGspc.data.close) : getClosestPrice(marketHistory['^GSPC'], thermoToday);
  const thermoFwdEps = getRecentPrice(marketHistory['SPX_FWD_EPS'], thermoToday, 130);
  const thermoFwd = thermoSpx != null && thermoFwdEps != null && thermoFwdEps !== 0 ? thermoSpx / thermoFwdEps : null;
  const thermoEps = regEps(thermoToday);
  const thermoPe = thermoSpx != null && thermoEps != null && thermoEps !== 0 ? thermoSpx / thermoEps : null;
  const thermoCpi = getCpiYoY(marketHistory['CPIAUCSL'], liveMap['CPIAUCSL']?.data?.date || thermoToday);
  const thermoCore = getCpiYoY(marketHistory['CPILFESL'], liveMap['CPILFESL']?.data?.date || thermoToday);
  const thermoCpiMa = getCpiMa6(marketHistory['CPIAUCSL'], liveMap['CPIAUCSL']?.data?.date || thermoToday);
  const thermoCoreMa = getCpiMa6(marketHistory['CPILFESL'], liveMap['CPILFESL']?.data?.date || thermoToday);
  const thermoY30 = (liveMap['DGS30']?.data?.close != null && liveMap['DGS30'].data.source !== 'db-fallback') ? Number(liveMap['DGS30'].data.close) : getClosestPrice(marketHistory['DGS30'], thermoToday);
  const thermoY30ma = getMa126(marketHistory['DGS30'], liveMap['DGS30']?.data?.date || thermoToday);
  // Termómetro y bonus de hoy desde el backend (fuente única). Mientras carga o si falla,
  // se usa la última fila guardada en bt_thermo_history para no pintar el termómetro vacío.
  const thermoLastStored = (() => {
    const keys = Object.keys(thermoHist).filter((k) => k <= thermoToday).sort();
    return keys.length ? thermoHist[keys[keys.length - 1]] : undefined;
  })();
  const thermoLive = thermoLiveQ.data;
  const hyBonusNow: ThermoLive['hy'] = thermoLive?.hy ?? { bonus: thermoLastStored?.bonus ?? 0, label: thermoLastStored?.bonusLabel ?? 'sin dato', hy: null, z: null, d1: null };
  const liqBonusNow: ThermoLive['liq'] = thermoLive?.liq ?? { bonus: thermoLastStored?.liqBonus ?? 0, label: thermoLastStored?.liqBonusLabel ?? 'sin dato', yoy: null, m0d3: null, drop: null };
  const oilBonusNow: ThermoLive['oil'] = thermoLive?.oil ?? { bonus: thermoLastStored?.oilBonus ?? 0, label: thermoLastStored?.oilBonusLabel ?? 'sin dato', ratio: null, price: null };
  // Series M2/M0 con punto live anexado para el bonus simétrico de liquidez.
  const liqMergeLive = (key: string): Map<string, number> => {
    const base = marketHistory[key];
    const lq = liveMap[key];
    const m = new Map(base ?? []);
    if (lq?.data?.close != null && lq.data.source !== 'db-fallback' && isValidIsoDate(lq.data.date)) m.set(String(lq.data.date).slice(0, 10), Number(lq.data.close));
    return m;
  };
  const liqM2Map = liqMergeLive('M2SL');
  const liqM0Map = liqMergeLive('BOGMBASE');
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
          <h3 className="font-semibold text-slate-100">{ti('dailyTitle')}</h3>
          {isAdmin && (
          <button onClick={runSync} disabled={syncing} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold shadow border border-accent-500/30 transition">
            <span className={syncing ? 'animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full' : ''}>{syncing ? '' : '↻'}</span>
            {syncing ? tSync('refreshing') : tSync('refreshButton')}
          </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {isAdmin && <>Cron <code className="text-accent-400">L-V 22:05 America/New_York</code> → <code>daily_update.py</code> (yfinance <code>auto_adjust</code> + <code>verify_splits</code>) + <code>build_shiller_daily()</code>.{' '}</>}
          {ti('lastCape')} <span className="text-favorable-400 font-mono">{capeLast?.cape?.toFixed(2) ?? '—'}</span> ratio {capeLast?.capeRatio?.toFixed(3) ?? '—'} @ {capeLast?.date?.slice(0,10) ?? '—'}
          {isAdmin && <span className="ml-2 text-[11px] text-slate-500">· Precios/Bonos live vía API con caché (mercado 5 min / FRED 1h), CAPE diario desde DB</span>}

        </p>
      </div>
      {/* === Termómetro de Riesgo — Mercado General (estilo CNN Fear & Greed) === */}
      {(()=>{
        // Termómetro compuesto: promedio ponderado base 100 (no suma). Cada indicador aporta
        // puntaje 0-100 × peso; al agregar más, se normaliza entre el peso total acumulado.
        const PART_DEC: Record<string, number> = { RATIO: 3, FG: 0, MS: 1 };
        // Bandas de cada componente (las mismas de los orbes de las cards) para el popover del detalle.
        const PART_BANDS: Record<string, [number, number, string, string, string][]> = {
          CAPE: CAPE_BANDS, FWD: FWD_BANDS, RATIO: RATIO_BANDS, CPI: CPI_BANDS, CORE: CPI_BANDS, Y2M: Y2M_BANDS,
          '30Y': Y30_BANDS, MG: MG_BANDS, VIX: VIX_BANDS, FG: FG_BANDS, MS: MS_BANDS, PIB: GDP_BANDS,
        };
        const parts = (thermoLive?.parts ?? []).map((p) => ({ ...p, dec: PART_DEC[p.key] ?? 2 }));
        const wTotal = parts.reduce((m, p) => m + p.weight, 0);
        const hyB = hyBonusNow;
        const liqB = liqBonusNow;
        const oilB = oilBonusNow;
        const riskScore = thermoLive?.value ?? thermoLastStored?.value ?? 0;
        liveBhtRef.current = { v: riskScore, d: new Date().toISOString().slice(0, 10) };
        const band = bhtBand(riskScore);
        const riskLabel = band.label;
        const riskColor = band.textClass;
        const CX = 100, CY = 104, R = 80;
        const polar = (deg:number, r:number) => { const rad = (deg * Math.PI) / 180; return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)] as const; };
        // Arco proporcional a la frecuencia histórica (√freq: verde 11%, lima 25%,
        // amarillo 46%, naranja 13%, rojo 6%): las bandas habituales se ven más grandes.
        const SEGV = [0, ...BHT_CUTS, 100];
        const SEGARC = [28, 43, 58, 30, 21];
        const angL = (v:number) => {
          const c = Math.max(0, Math.min(100, v));
          let i = SEGV.findIndex((e, k) => k < SEGV.length - 1 && c >= e && (c < SEGV[k + 1] || (k === SEGV.length - 2 && c <= SEGV[k + 1])));
          if (i < 0) i = SEGV.length - 2;
          const acc = SEGARC.slice(0, i).reduce((m, x) => m + x, 0);
          return acc + ((c - SEGV[i]) / (SEGV[i + 1] - SEGV[i])) * SEGARC[i];
        };
        const A = (v:number) => 180 - angL(v);
        const arc = (v0:number, v1:number) => { const a0 = A(v0) - 0.6, a1 = A(v1) + 0.6; const [x0,y0] = polar(a0, R); const [x1,y1] = polar(a1, R); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
        const segs = BHT_BANDS.map((b): readonly [number, number, string] => [b.lo, b.hi, b.color]);
        const [nx,ny] = polar(A(riskScore), R - 24);
        const [t0x,t0y] = polar(A(0), R + 12);
        const [t50x,t50y] = polar(A(50), R + 12);
        const [t100x,t100y] = polar(A(100), R + 12);
        return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-slate-100">{ti('thermoTitle')}</h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
                {(['overview', 'timeline', 'stats'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setThermoView(v)}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition ${thermoView === v ? 'bg-slate-700 text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
                    {v === 'overview' ? 'Overview' : v === 'timeline' ? 'Timeline' : 'Stats'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">{ti('underConstruction')}</span>
            </div>
          </div>
          {thermoView === 'timeline' && <BhtTimeline />}
          {thermoView === 'stats' && <BhtStats />}
          {thermoView === 'overview' && (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <svg viewBox="0 0 200 118" className="w-full max-w-[440px] flex-[1.2] shrink" role="img" aria-label={ti('riskAria', { score: riskScore, label: ti(`bht.b${BHT_BANDS.indexOf(band)}.label`) })}>
              {segs.map(([v0,v1,c]) => <path key={v0} d={arc(v0 + 0.8, v1 - 0.8)} fill="none" stroke={c} strokeWidth="16" strokeLinecap="butt" opacity="0.85" />)}
              <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
              <circle cx={CX} cy={CY} r="6" fill="#e2e8f0" />
              <text x={t0x.toFixed(0)} y={t0y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="start">0</text>
              <text x={t50x.toFixed(0)} y={t50y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">50</text>
              <text x={t100x.toFixed(0)} y={t100y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">100</text>
            </svg>
            <div className="flex-1 w-full text-center lg:text-left">
              <div className="font-mono text-5xl font-bold text-slate-100">{riskScore}<span className="text-lg text-slate-500">/100</span></div>
              <div className={`text-base font-semibold mt-1 ${riskColor}`}>{ti(`bht.b${BHT_BANDS.indexOf(band)}.label`)}</div>
            </div>
            <ul className="flex-[1.4] w-full space-y-1">
              {BHT_BANDS.map((b) => {
                const on = b.label === riskLabel;
                return <li key={b.label} className={`px-3 py-1.5 rounded-lg text-xs ${on ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:b.color}} />
                    <span className={`flex-1 ${on ? 'font-semibold' : ''}`}>{ti(`bht.b${BHT_BANDS.indexOf(b)}.label`)}</span>
                    <span className="font-mono">{b.range}</span>
                  </div>
                  <p className={`mt-0.5 pl-5 text-[11px] leading-snug ${on ? 'text-slate-300' : 'text-slate-500'}`}>{ti(`bht.b${BHT_BANDS.indexOf(b)}.advice`)}</p>
                </li>;
              })}
            </ul>
          </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">{ti('thermoFootA')} {parts.length ? parts.map(p => `${partName(p.key)} ${p.score.toFixed(0)}×${p.weight}`).join(' + ') + ` ÷ ${wTotal}` : ti('noIndicators')}{hyB.bonus > 0 ? ` + ${ti('bonusHy')} ${hyB.label} (+${hyB.bonus})` : ''}{liqB.bonus !== 0 ? ` + ${ti('bonusLiq')} ${liqB.label} (${liqB.bonus > 0 ? '+' : ''}${liqB.bonus})` : ''}{oilB.bonus !== 0 ? ` + ${ti('bonusOil')} ${oilB.label} (${oilB.bonus > 0 ? '+' : ''}${oilB.bonus})` : ''} · {ti('thermoFootB', { n: parts.length })}</p>
          <RiskDisclaimer variant="signal" className="mt-2" />
          <button type="button" onClick={() => setRiskDetailOpen(o => !o)} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:text-accent-300 hover:border-slate-600 transition">
            {riskDetailOpen ? ti('hideDetail') : ti('showDetail')}
          </button>
          {riskDetailOpen && <BhtHistoryBlock />}
          {riskDetailOpen && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs font-mono">
                <thead><tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left font-normal px-3 py-1.5">{ti('colIndicator')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colValue')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colScore')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colWeight')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colContribution')}</th>
                </tr></thead>
                <tbody>
                  {parts.map(p => (
                    <tr key={p.key} className="border-b border-slate-800/60 text-slate-300">
                      <td className="px-3 py-1.5">{partLabel(p.key, loc)}</td>
                      <td className="text-right px-3 py-1.5">{p.value.toFixed(p.dec)}</td>
                      <td className="text-right px-3 py-1" style={{ color: capeScoreColor(p.score) }}>
                        {PART_BANDS[p.key] && PART_ORB_NAME[p.key]
                          ? <span className="inline-flex justify-end"><ScoreOrb name={PART_ORB_NAME[p.key]} value={p.value} dec={p.dec} weight={p.weight} score={Math.round(p.score)} bands={PART_BANDS[p.key]} small /></span>
                          : p.score.toFixed(0)}
                      </td>
                      <td className="text-right px-3 py-1.5 text-slate-400">{p.weight}</td>
                      <td className="text-right px-3 py-1.5 text-sky-300">{(p.score * p.weight / (wTotal || 1)).toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('hyBonusRow', { label: hyB.label })}</td>
                    <td className="text-right px-3 py-1.5">{hyB.hy != null ? hyB.hy.toFixed(2) : '—'}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: hyB.bonus > 0 ? TOKENS.elevated : '#64748b' }}>{hyB.bonus > 0 ? `+${hyB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">+{hyB.bonus.toFixed(1)}</td>
                  </tr>
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('liqBonusRow', { label: liqB.label })}</td>
                    <td className="text-right px-3 py-1.5">{liqB.yoy != null ? `M2 +${liqB.yoy.toFixed(1)}%` : '—'}{liqB.m0d3 != null ? ` · M0 ${liqB.m0d3 >= 0 ? '+' : ''}${liqB.m0d3.toFixed(1)}%` : ''}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: liqB.bonus > 0 ? TOKENS.elevated : liqB.bonus < 0 ? '#34d399' : '#64748b' }}>{liqB.bonus !== 0 ? `${liqB.bonus > 0 ? '+' : ''}${liqB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">{liqB.bonus !== 0 ? `${liqB.bonus > 0 ? '+' : ''}${liqB.bonus.toFixed(1)}` : '0.0'}</td>
                  </tr>
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('oilBonusRow', { label: oilB.label })}</td>
                    <td className="text-right px-3 py-1.5">{oilB.price != null ? `$${oilB.price.toFixed(2)}` : '—'}{oilB.ratio != null ? ` · ×${oilB.ratio.toFixed(2)}` : ''}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: oilB.bonus > 0 ? TOKENS.elevated : oilB.bonus < 0 ? '#34d399' : '#64748b' }}>{oilB.bonus !== 0 ? `${oilB.bonus > 0 ? '+' : ''}${oilB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">{oilB.bonus !== 0 ? `${oilB.bonus > 0 ? '+' : ''}${oilB.bonus.toFixed(1)}` : '0.0'}</td>
                  </tr>
                  <tr className="text-slate-100 font-semibold">
                    <td className="px-3 py-1.5" colSpan={4}>{ti('finalScore')} = Σ ÷ {wTotal}{hyB.bonus > 0 ? ` + bonus ${hyB.bonus}` : ''}{liqB.bonus !== 0 ? ` ${liqB.bonus > 0 ? '+' : ''}${liqB.bonus} liq` : ''}{oilB.bonus !== 0 ? ` ${oilB.bonus > 0 ? '+' : ''}${oilB.bonus} oil` : ''}</td>
                    <td className="text-right px-3 py-1.5">{riskScore.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        );
      })()}
      <MarketSyncModal open={marketSync.open} logs={marketSync.logs} refreshing={marketSync.refreshing} error={marketSync.error} onClose={marketSync.close} />

      {/* === Cards agrupadas por categoría + tooltips === */}
      {(() => {
        const tooltipMap: Record<string, string> = Object.fromEntries(TIP_KEYS.map((k) => [k, ti(`tips.${k.replace(/[^A-Za-z0-9_]/g, '')}`)]));
        const catOrder = [
          { key: 'valoracion', label: ti('cats.valoracion'), icon: '📊', keys: ['schiller_pe','pe_ratio','fwd_pe_ratio'] },
          { key: 'inflacion', label: ti('cats.inflacion'), icon: '🏛️', keys: ['inflation','core_inflation','fed_rate'] },
          { key: 'liquidez', label: ti('cats.liquidez'), icon: '💧', keys: ['M2SL','BOGMBASE'] },
          { key: 'energia', label: ti('cats.energia'), icon: '🛢️', keys: ['DCOILWTICO'] },
          { key: 'sentimiento', label: ti('cats.sentimiento'), icon: '😱', keys: ['VIXCLS','FEAR_GREED'] },
          { key: 'apalancamiento', label: ti('cats.apalancamiento'), icon: '💳', keys: ['FINRA_DEBIT','MARGIN_GDP'] },
          { key: 'tasas', label: ti('cats.tasas'), icon: '📈', keys: ['treasury_30y','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'] },
          { key: 'crecimiento', label: ti('cats.crecimiento'), icon: '🏭', keys: ['GDP'] },
          { key: 'vivienda', label: ti('cats.vivienda'), icon: '🏠', keys: ['MSACSR'] },
          { key: 'volumen', label: ti('cats.volumen'), icon: '⚖️', keys: ['SPX_ADV_VOL','SPX_DEC_VOL','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL'] },
          { key: 'mercado', label: ti('cats.mercado'), icon: '💹', keys: ['^GSPC','^IXIC','TQQQ','QQQ','SPY','VOO','SCHD','JEPQ','SQQQ'] },
        ];
        const indByKey = new Map(indicators.map((i:any)=>[i.key, i]));
        const marketName: Record<string, string> = Object.fromEntries(NAME_KEYS.map((k) => [k, ti(`names.${k.replace(/[^A-Za-z0-9_]/g, '')}`)]));
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
          const displayValue = isSchiller && capeLast?.cape != null ? capeLast.cape : (isInflation && inflationYoY!=null ? inflationYoY : (ind.key==='fwd_pe_ratio' && thermoFwd!=null ? thermoFwd : (ind.key==='pe_ratio' && thermoPe!=null ? thermoPe : (useLive ? liveVal : ind.currentValue))));
          const displayStatus = isSchiller && capeLast?.cape != null ? (capeLast.cape >= 30 ? 'High' : capeLast.cape >= 20 ? 'Normal' : 'Low') : ind.status;
          const tip = tooltipMap[ind.key] || ind.description || '';
          // Grupo banda+orbe estándar: una sola config por tarjeta con puntaje.
          const sg = isSchiller && capeLast?.cape != null
            ? { label: capeBandLabel(capeLast.cape), score: Math.round(capeRiskScore(capeLast.cape)), name: 'CAPE', value: capeLast.cape, dec: 2, weight: 20, bands: CAPE_BANDS, blend: null as MomBlend }
            : ind.key === 'fwd_pe_ratio' && thermoFwd != null
            ? { label: fwdBandLabel(thermoFwd), score: Math.round(fwdRiskScore(thermoFwd)), name: 'Fwd PE', value: thermoFwd, dec: 2, weight: 10, bands: FWD_BANDS, blend: null as MomBlend }
            : ind.key === 'inflation' && thermoCpi != null && thermoCpiMa != null
            ? { label: cpiBandLabel(cpiMScore(thermoCpi, thermoCpiMa)), score: Math.round(cpiMScore(thermoCpi, thermoCpiMa)), name: 'CPI', value: thermoCpi, dec: 2, weight: 10, bands: CPI_BANDS, blend: momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, thermoCpi, thermoCpiMa) as MomBlend }
            : ind.key === 'core_inflation' && thermoCore != null && thermoCoreMa != null
            ? { label: cpiBandLabel(cpiMScore(thermoCore, thermoCoreMa)), score: Math.round(cpiMScore(thermoCore, thermoCoreMa)), name: 'Core', value: thermoCore, dec: 2, weight: 10, bands: CPI_BANDS, blend: momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, thermoCore, thermoCoreMa) as MomBlend }
            : ind.key === 'treasury_30y' && thermoY30 != null && thermoY30ma != null
            ? { label: y30mBandLabel(y30mRiskScore(thermoY30, thermoY30ma)), score: Math.round(y30mRiskScore(thermoY30, thermoY30ma)), name: '30Y', value: thermoY30, dec: 2, weight: 10, bands: Y30_BANDS, blend: momBlend(Y30M_LVL_SEGS, Y2M_TRD_SEGS, thermoY30, thermoY30ma) as MomBlend }
            : null;
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
              <div className="text-xs text-slate-500 flex items-center">{ind.key} {isSchiller && <span className="text-accent-400 ml-1">{ti('daily')}</span>} {tip && renderTooltip(tip + (isSchiller && capeLast?.cape!=null ? ` ${ti('synced', { v: capeLast.cape.toFixed(2), d: (capeLast.date||'').slice(0,10) })}` : ''))}</div>
              <div className="font-semibold text-slate-100 truncate">{loc === 'es' ? ind.name : (marketName[ind.key] ?? ind.name)}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xl font-mono text-favorable-400">{displayValue != null ? Number(displayValue).toFixed(2) : '—'}{ind.unit}{isInflation && inflationYoY!=null ? <span className="text-[10px] text-slate-500 ml-1">YoY</span> : null}</span>
                {sg ? (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/50 py-0.5 pl-2.5 pr-1">
                    {(()=>{ const c = capeScoreColor(sg.score); return <span className="text-xs font-semibold" style={{ color: c }}>{levelLabel(sg.label, loc)}</span>; })()}
                    <ScoreOrb name={sg.name} value={sg.value} dec={sg.dec} weight={sg.weight} score={sg.score} bands={sg.bands} blend={sg.blend} small />
                  </span>
                )
                : <span className={`text-xs px-2 py-0.5 rounded-full border ${displayStatus==='High'?'bg-elevated-500/20 text-elevated-400 border-elevated-500/30':displayStatus==='Greed'?'bg-favorable-500/20 text-favorable-400 border-favorable-500/30':'bg-slate-800 text-slate-400 border-slate-700'}`}>{displayStatus}</span>}
              </div>
              {isInflation && liveVal!=null && <div className="text-[10px] font-mono text-slate-500">{ti('index')} {Number(liveVal).toFixed(2)}</div>}
              <div className="text-xs text-slate-500 mt-2 line-clamp-2">{loc === 'es' ? ind.description : (tooltipMap[ind.key] ?? ind.description)}</div>
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
            const level = ratio==null ? null : ratio>=5?'Extremo': ratio>=4.5?'Muy alto': ratio>=4?'Alto': ratio>=3?'Elevado': ratio>=2?'Normal':'Bajo';
            const levelColor = ratio==null?'text-slate-400': ratio>=5?'text-risk-400': ratio>=4?'text-elevated-400': ratio>=2?'text-caution-400':'text-favorable-400';
            const mgM = ((): { ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(ratio==null) return null; const ma = getMarginGdpMa24(new Date().toISOString().slice(0,10)); if(ma==null) return null; const b = momBlend(MG_SEGS, MG_TRD_SEGS, ratio, ma); return { ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
            return (
              <div className="border rounded-lg px-3 py-2 bg-risk-500/10 border-risk-500/30 ring-1 ring-risk-500/20">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">MARGIN_GDP {tip && renderTooltip(tip)} <span className="text-[10px] px-1.5 py-0.5 rounded bg-risk-500 text-white font-bold">Ratio</span></div>
              <div className="font-semibold text-slate-100 truncate">{marketName['MARGIN_GDP']}</div>
                <div className="font-mono text-slate-100 text-lg flex items-center gap-2">{ratio!=null? `${ratio.toFixed(2)}%`:'—'}{ratio!=null && mgM!=null && <span className="ml-auto"><ScoreOrb name="Margen/PIB" value={ratio} weight={10} score={mgM.score} bands={MG_BANDS} blend={{ level: ratio, levelScore: mgM.levelScore, delta: mgM.d, ma: mgM.ma, maLabel: 'MA24M', trendScore: mgM.trendScore }} small /></span>}</div>
                {ratio!=null && <div className={`text-[11px] font-mono font-semibold ${levelColor}`}>{level} · FINRA ${(finraVal!/1000).toFixed(0)}B / GDP ${(gdpVal!/1000).toFixed(1)}T</div>}
                {ratio!=null && mgM!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {mgM.d>=0?'+':''}{mgM.d.toFixed(2)}pp vs MA24M {mgM.ma.toFixed(2)}% · <span style={{color: capeScoreColor(mgM.score)}}>{mgBandLabel(mgM.score)}</span></div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · FINRA/GDP</div>}
                {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
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
          const isMsacsr = t==='MSACSR';
          const isVix = t==='VIXCLS';
          const isFg = t==='FEAR_GREED';
          const isHyOas = t==='BAMLH0A0HYM2';
          const isM2 = t==='M2SL';
          const isM0 = t==='BOGMBASE';
          const isOil = t==='DCOILWTICO';
          const isBreadth = t==='NYSE_ADV_VOL'||t==='NYSE_DEC_VOL'||t==='NSDQ_ADV_VOL'||t==='NSDQ_DEC_VOL'||t==='SPX_ADV_VOL'||t==='SPX_DEC_VOL';
          const fmt = (n:number) => isGDP ? `$${(n/1000).toFixed(1)}T` : (isM2||isM0) ? `$${(n/1000).toFixed(2)}T` : isFinra ? `$${(n/1000).toFixed(0)}B` : isMsacsr ? `${n.toFixed(1)} m` : isVix ? n.toFixed(2) : isFg ? n.toFixed(0) : isBreadth ? `${(n/1e9).toFixed(2)}B` : isYield ? `${n.toFixed(2)}%` : `$${n.toFixed(2)}`;
          // CPI cards: YoY mensual fijo (no diario) — live usa mes más reciente
          const cpiYoYForCard = isCpi ? getCpiYoY(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const cpiMForCard = ((): { yoy: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(!isCpi) return null; const yoy = cpiYoYForCard; if(yoy==null) return null; const ma = getCpiMa6(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)); if(ma==null) return null; const b = momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, yoy, ma); return { yoy, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          // Y2M para la card DGS2: nivel + delta vs MA6M (reemplaza a FED en el termo).
          const y2mForCard = ((): { cur: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(t!=='DGS2') return null; const cur = showLive ? Number(live) : (v!=null ? Number(v) : null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const ma = getMa126(marketHistory['DGS2'], refDate); if(ma==null) return null; const b = momBlend(Y2M_LVL_SEGS, Y2M_TRD_SEGS, cur, ma); return { cur, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          const y30mForCard = ((): { cur: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(t!=='DGS30') return null; const cur = showLive ? Number(live) : (v!=null ? Number(v) : null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const ma = getMa126(marketHistory['DGS30'], refDate); if(ma==null) return null; const b = momBlend(Y30M_LVL_SEGS, Y2M_TRD_SEGS, cur, ma); return { cur, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          // HY OAS: card informativa sin orbe de peso — bonus asimétrico Régimen 3 fuera del promedio.
          const hyCardB = isHyOas ? hyBonusNow : null;
          // M2/M0: cards informativas con el bonus simétrico de liquidez (fuera del promedio, como HY).
          const liqCardB = (isM2||isM0) ? liqBonusNow : null;
          // WTI: card informativa con el bonus simétrico de petróleo (fuera del promedio, como HY/LIQ).
          const oilCardB = isOil ? oilBonusNow : null;
          const gdpYoY = (()=>{ if(t!=='GDP') return null; const cur = showLive ? Number(live) : (v!=null? Number(v): null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDP'], iso, 95) ?? getClosestPrice(marketHistory['GDP'], refDate, 95);
            let p = prev; if(p==null){ const qd = new Date(refDate); qd.setMonth(qd.getMonth()-12); p = getClosestPrice(marketHistory['GDP'], qd.toISOString().slice(0,10), 95); } if(p==null || p===0) return null; return (cur/p -1)*100; })();
          const gdpc1YoY = (()=>{ if(t!=='GDP') return null; const fwdRaw = liveGdpc1?.data?.date; const fwdDate = isValidIsoDate(fwdRaw) ? String(fwdRaw).slice(0,10) : new Date().toISOString().slice(0,10); const curReal = liveGdpc1?.data?.close ?? getClosestPrice(marketHistory['GDPC1'], fwdDate, 95); if(curReal==null) return null; const refRaw = isValidIsoDate(liveGdpc1?.data?.date) ? liveGdpc1?.data?.date : q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDPC1'], iso, 95); let p=prev; if(p==null){ const qd=new Date(refDate); qd.setMonth(qd.getMonth()-12); p=getClosestPrice(marketHistory['GDPC1'], qd.toISOString().slice(0,10),95);} if(p==null||p===0) return null; return (curReal/p -1)*100; })();
          // Para CPI mostrar YoY con índice como subtítulo
          if (isCpi) {
            const idxVal = showLive ? Number(live) : (v!=null ? Number(v) : null);
            return (
              <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-accent-500/10 border-accent-500/30 ring-1 ring-accent-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500 text-white font-bold">Actual</span>}</div>
                <div className="font-semibold text-slate-100 truncate">{marketName[t] ?? t}</div>
                <div className="font-mono text-slate-100 flex items-center gap-2">{cpiYoYForCard!=null ? `${cpiYoYForCard.toFixed(2)}%` : '—'} <span className="text-[10px] text-slate-500">YoY</span>{cpiMForCard!=null && <span className="ml-auto"><ScoreOrb name={t==='CPIAUCSL'?'CPI':'Core'} value={cpiMForCard.yoy} dec={2} weight={10} score={cpiMForCard.score} bands={CPI_BANDS} blend={{ level: cpiMForCard.yoy, levelScore: cpiMForCard.levelScore, delta: cpiMForCard.d, ma: cpiMForCard.ma, maLabel: 'MA6M', trendScore: cpiMForCard.trendScore }} small /></span>}</div>
                {idxVal!=null && <div className="text-[10px] font-mono text-slate-500">{ti('index')} {idxVal.toFixed(2)}</div>}
                {cpiMForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {cpiMForCard.d>=0?'+':''}{cpiMForCard.d.toFixed(2)}pp vs MA6M {cpiMForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(cpiMForCard.score)}}>{levelLabel(cpiBandLabel(cpiMForCard.score), loc)}</span></div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
                {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
              </div>
            );
          }
          return (
            <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-accent-500/10 border-accent-500/30 ring-1 ring-accent-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500 text-white font-bold">Actual</span>}</div>
              <div className="font-semibold text-slate-100 truncate">{marketName[t] ?? t}</div>
              <div className="font-mono text-slate-100 flex items-center gap-2">{showLive ? fmt(Number(live)) : (v!=null ? fmt(Number(v)) : '—')}{(()=>{ const vv = showLive ? Number(live) : (v!=null ? Number(v) : null); if (vv == null) return null;
                if (isVix) return <span className="ml-auto"><ScoreOrb name="VIX" value={vv} weight={10} score={Math.round(vixRiskScore(vv))} bands={VIX_BANDS} small /></span>;
                if (isFg) { const s = Math.round(fgRiskScore(vv)); return <span className="ml-auto"><ScoreOrb name="F&G" value={vv} weight={10} score={s} bands={FG_BANDS} small /></span>; }
                if (isHyOas && hyCardB != null) return <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${hyCardB.bonus > 0 ? 'bg-elevated-500/20 text-elevated-300 border-elevated-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>bonus {hyCardB.bonus > 0 ? `+${hyCardB.bonus}` : '+0'}</span>;
                if ((isM2||isM0) && liqCardB != null) return <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${liqCardB.bonus > 0 ? 'bg-elevated-500/20 text-elevated-300 border-elevated-500/30' : liqCardB.bonus < 0 ? 'bg-favorable-500/20 text-favorable-300 border-favorable-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>liq {liqCardB.bonus !== 0 ? `${liqCardB.bonus > 0 ? '+' : ''}${liqCardB.bonus}` : '0'}</span>;
                if (isOil && oilCardB != null && oilCardB.ratio != null) { const s = Math.round(oilRiskScore(oilCardB.ratio)); return <span className="ml-auto"><ScoreOrb name="WTI" value={oilCardB.ratio} dec={2} weight={0} score={s} bands={OIL_BANDS} small /></span>; }
                if (isMsacsr) return <span className="ml-auto"><ScoreOrb name="MSACSR" value={vv} dec={1} weight={5} score={Math.round(msRiskScore(vv))} bands={MS_BANDS} small /></span>;
                if (t==='DGS2' && y2mForCard!=null) return <span className="ml-auto"><ScoreOrb name="2Y Mom" value={y2mForCard.cur} dec={2} weight={10} score={y2mForCard.score} bands={Y2M_BANDS} blend={{ level: y2mForCard.cur, levelScore: y2mForCard.levelScore, delta: y2mForCard.d, ma: y2mForCard.ma, maLabel: 'MA6M', trendScore: y2mForCard.trendScore }} small /></span>;
                if (t==='DGS30' && y30mForCard!=null) return <span className="ml-auto"><ScoreOrb name="30Y Mom" value={y30mForCard.cur} dec={2} weight={10} score={y30mForCard.score} bands={Y30_BANDS} blend={{ level: y30mForCard.cur, levelScore: y30mForCard.levelScore, delta: y30mForCard.d, ma: y30mForCard.ma, maLabel: 'MA6M', trendScore: y30mForCard.trendScore }} small /></span>;
                if (isGDP && gdpc1YoY != null) return <span className="ml-auto"><ScoreOrb name="PIB real" value={gdpc1YoY} weight={5} score={Math.round(gdpRiskScore(gdpc1YoY))} bands={GDP_BANDS} small /></span>;
                return null; })()}</div>
              {t==='DGS2' && y2mForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {y2mForCard.d>=0?'+':''}{y2mForCard.d.toFixed(2)}pp vs MA6M {y2mForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(y2mForCard.score)}}>{levelLabel(y2mBandLabel(y2mForCard.score), loc)}</span></div>}
              {isHyOas && hyCardB != null && hyCardB.hy != null && <div className="text-[11px] font-mono font-semibold text-slate-400">{levelLabel(hyBandLabel(hyCardB.hy), loc)} · <span className={hyCardB.bonus > 0 ? 'text-elevated-300' : 'text-slate-500'}>{ti('regime3')} {hyCardB.bonus > 0 ? `${hyCardB.label} (+${hyCardB.bonus})` : ti('regime3Inactive')}</span></div>}
              {(isM2||isM0) && liqCardB != null && liqCardB.yoy != null && <div className="text-[11px] font-mono font-semibold text-slate-400">M2 YoY +{liqCardB.yoy.toFixed(1)}% · M0 Δ3M {liqCardB.m0d3 != null ? `${liqCardB.m0d3 >= 0 ? '+' : ''}${liqCardB.m0d3.toFixed(1)}%` : '—'} · <span className={liqCardB.bonus > 0 ? 'text-elevated-300' : liqCardB.bonus < 0 ? 'text-favorable-300' : 'text-slate-500'}>{liqCardB.bonus !== 0 ? `${liqCardB.label} (${liqCardB.bonus > 0 ? '+' : ''}${liqCardB.bonus})` : ti('noBonus')}</span></div>}
              {isOil && oilCardB != null && oilCardB.ratio != null && <div className="text-[11px] font-mono font-semibold text-slate-400">×{oilCardB.ratio.toFixed(2)} SMA36M · <span className={oilCardB.bonus > 0 ? 'text-elevated-300' : oilCardB.bonus < 0 ? 'text-favorable-300' : 'text-slate-500'}>{oilCardB.bonus !== 0 ? `${oilCardB.label} (${oilCardB.bonus > 0 ? '+' : ''}${oilCardB.bonus})` : ti('neutral')}</span></div>}
              {t==='DGS30' && y30mForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {y30mForCard.d>=0?'+':''}{y30mForCard.d.toFixed(2)}pp vs MA6M {y30mForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(y30mForCard.score)}}>{levelLabel(y30mBandLabel(y30mForCard.score), loc)}</span></div>}
              {isGDP && (gdpYoY!=null || gdpc1YoY!=null) && <div className="flex gap-2 text-[11px] font-mono font-semibold"><span className={gdpYoY!=null && gdpYoY>=0?'text-favorable-400':'text-risk-400'}>{gdpYoY!=null? `${gdpYoY>=0?'▲':'▼'} ${Math.abs(gdpYoY).toFixed(2)}% Nom`:'— Nom'}</span><span className="text-slate-600">·</span><span className={gdpc1YoY!=null && gdpc1YoY>=0?'text-sky-400':'text-elevated-400'}>{gdpc1YoY!=null? `${gdpc1YoY>=0?'▲':'▼'} ${Math.abs(gdpc1YoY).toFixed(2)}% Real`:'— Real'}</span></div>}
              {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
              {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
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
                    {cat.key==='valoracion' && capeLast?.capeRatio != null && (()=>{
                      const ratio = capeLast.capeRatio;
                      const s = Math.round(ratioRiskScore(ratio));
                      const c = capeScoreColor(s);
                      return (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
                        <div className="text-xs text-slate-500 flex items-center">cape_ratio {renderTooltip('CAPE Ratio = CAPE / media 3a (SMA). >1.18 caro vs su historia reciente, ~1.00 justo, <0.90 barato. Es el que dispara F0 en Múltiplos Altos.')}</div>
                        <div className="font-semibold text-slate-100 truncate">CAPE Ratio</div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xl font-mono" style={{ color: c }}>{ratio.toFixed(3)}X</span>
                          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/50 py-0.5 pl-2.5 pr-1">
                            <span className="text-xs font-semibold" style={{ color: c }}>{levelLabel(ratioBandLabel(ratio), loc)}</span>
                            <ScoreOrb name="CAPE Ratio" value={ratio} dec={3} weight={15} score={s} bands={RATIO_BANDS} small />
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 line-clamp-2">{ti('ratioDesc')} {ti('synced', { v: ratio.toFixed(3), d: (capeLast.date||'').slice(0,10) })}</div>
                      </div>
                      );
                    })()}
                    {cat.key==='valoracion' && (()=>{
                      // Nasdaq 100 (WSJ / Birinyi, viernes): informativo, sin puntaje (las bandas del termómetro son del S&P 500).
                      const today = new Date().toISOString().slice(0, 10);
                      const fwdMap = marketHistory['NDX_FWD_PE'];
                      const fwdDate = fwdMap && fwdMap.size ? Array.from(fwdMap.keys()).sort().pop()! : null;
                      const ndxFwd = fwdDate ? fwdMap!.get(fwdDate)! : null;
                      if (ndxFwd == null) return null;
                      const ndxPe = getRecentPrice(marketHistory['NDX_PE'], today, 400);
                      const premium = thermoFwd != null && thermoFwd > 0 ? ndxFwd / thermoFwd : null;
                      return (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
                        <div className="text-xs text-slate-500 flex items-center">ndx_fwd_pe {renderTooltip(ti('ndxTip'))}</div>
                        <div className="font-semibold text-slate-100 truncate">{ti('ndxTitle')}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xl font-mono text-favorable-400">{ndxFwd.toFixed(2)}x</span>
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">{ti('ndxInfo')}</span>
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-slate-400 mt-1">{ndxPe != null ? ti('ndxTrailing', { v: `${ndxPe.toFixed(2)}x` }) : ''}{ndxPe != null && premium != null ? ' · ' : ''}{premium != null ? ti('ndxPremium', { v: premium.toFixed(2) }) : ''}</div>
                        <div className="text-xs text-slate-500 mt-2">{ti('ndxAsOf', { d: fwdDate! })}</div>
                      </div>
                      );
                    })()}
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
            <p className="text-xs text-slate-500">{ti('marketHint')}</p>
          </div>
        );
      })()}
      <MarginGdpChart marketHistory={chartHistory} cape={cape} volHistory={volHistory} />
      <CrisisEventsTable />

      <CapeHistoryTable cape={cape} capeRows={capeRows} marketHistory={marketHistory} volHistory={volHistory} thermoHist={thermoHist} regEps={regEps}
        hyBonusNow={hyBonusNow} liqBonusNow={liqBonusNow} oilBonusNow={oilBonusNow} liqM2Map={liqM2Map} liqM0Map={liqM0Map} liveBhtRef={liveBhtRef} />
    </div>
  );
}
