'use client';
// Pestaña "Indicadores" de Backtesting: solo el historial diario (CAPE/BHT por día, desde 1990) y la actualización
// manual para admin. El BHT de hoy, sus componentes, apalancamiento, crisis y BHT Forward están en /indicators.
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { buildEpsSchedule, epsAt } from '@/lib/spxEps';
import { useMarketSyncStream } from './useMarketSyncStream';
import MarketSyncModal from './MarketSyncModal';
import { buildCapeTableRows } from '@/lib/capeTableRows';
import { isValidIsoDate } from '@/lib/seriesLookup';
import { useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '@/context/AuthContext';
import { type ThermoLive, useThermoLive, useLiveTicker } from './useThermoLive';
import { CapeHistoryTable } from './CapeHistoryTable';

export function IndicatorsPanel() {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const [cape, setCape] = useState<any[]>([]);
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  // Filas de la tabla CAPE: serie CAPE o, si falta, días hábiles del SP500 (ver lib/capeTableRows).
  const capeRows: any[] = useMemo(() => buildCapeTableRows(cape, marketHistory['^GSPC']?.keys()), [cape, marketHistory]);
  // EPS registrado del S&P 500 (último mes de Shiller ya publicado a cada fecha; ver src/lib/spxEps.ts).
  const epsSchedule = useMemo(() => buildEpsSchedule(marketHistory['SPX_EPS']), [marketHistory]);
  const regEps = (d: string): number | null => epsAt(epsSchedule, d)?.eps ?? null;
  const [volHistory, setVolHistory] = useState<Record<string, Map<string, number>>>({});
  const [thermoHist, setThermoHist] = useState<Record<string, { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string; trendRegime?: string | null; spxSma50?: number | null; spxSma200?: number | null }>>({});
  const liveBhtRef = useRef<{ v: number | null; d: string | null; trend?: { regime: string; close: number | null; sma50: number | null; sma200: number | null } | null }>({ v: null, d: null });
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
  // M2/M0 en vivo para el bono de liquidez de la fila de hoy del historial.
  const liveM2 = useLiveTicker('M2SL');
  const liveM0 = useLiveTicker('BOGMBASE');
  const thermoLiveQ = useThermoLive();
  const liveMap: Record<string, ReturnType<typeof useLiveTicker>> = { M2SL: liveM2, BOGMBASE: liveM0 };

  // Carga completa de vista (misma que usa el botón Sync tras refrescar, igual que regímenes)
  const loadAll = useCallback(async () => {
      try {
        const base = getApiBase();
        const capeRes = await fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`, { cache: 'no-store' });
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
        setMarketHistory(hist);
        setVolHistory(volh);
      } catch {}
      setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runSync = () => marketSync.start(getApiBase());


  // Enlaces desde la home (#bht-thermo, #cat-valoracion…): las secciones existen hasta que carga la data.
  useEffect(() => {
    if (loading || typeof window === 'undefined' || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [loading]);
  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500">{ti('loading')}</div>;

  const capeLast = cape[cape.length - 1];
  const thermoToday = new Date().toISOString().slice(0, 10);
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
  // BHT de hoy para la fila en vivo del historial diario (antes lo fijaba el bloque del termómetro).
  liveBhtRef.current = { v: thermoLive?.value ?? thermoLastStored?.value ?? 0, d: thermoToday, trend: thermoLive?.trend ?? null };

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
      {/* El BHT de hoy, sus componentes, apalancamiento, grandes crisis y BHT Forward viven en /indicators (página única). */}
      <a href={`/${loc}/indicators`} className="block bg-slate-900 border border-accent-500/30 rounded-xl p-4 hover:border-accent-400 transition">
        <div className="font-semibold text-accent-300">{loc === 'es' ? 'El BHT Index de hoy y todos sus componentes están en Indicadores →' : 'Today’s BHT Index and all its components are on Indicators →'}</div>
        <div className="text-xs text-slate-400 mt-1">{loc === 'es' ? 'Termómetro, gráfica con señales, componentes con su dato, apalancamiento (Margen/PIB), grandes crisis y retornos posteriores. Aquí queda el historial diario completo.' : 'Thermometer, chart with signals, components with their data, leverage (margin/GDP), major crises and subsequent returns. The full daily history stays here.'}</div>
      </a>
      <MarketSyncModal open={marketSync.open} logs={marketSync.logs} refreshing={marketSync.refreshing} error={marketSync.error} onClose={marketSync.close} />

      <CapeHistoryTable cape={cape} capeRows={capeRows} marketHistory={marketHistory} volHistory={volHistory} thermoHist={thermoHist} regEps={regEps}
        hyBonusNow={hyBonusNow} liqBonusNow={liqBonusNow} oilBonusNow={oilBonusNow} liqM2Map={liqM2Map} liqM0Map={liqM0Map} liveBhtRef={liveBhtRef} showForward={false} />
    </div>
  );
}
