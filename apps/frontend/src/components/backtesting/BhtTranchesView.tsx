'use client';
// Vista "Tranches" del popover del BHT: Módulo de Reentrada por Tranches (MRT v1.3). Para la fecha del popover y la
// ruta elegida (VOO = S&P 500; QQQ/TQQQ = Nasdaq-100 con QQQ como proxy), estado del episodio desde el último pico,
// condiciones del día (permiso, veto de crédito, votos) y los 5 tranches: disparado, hoy o lo que falta.
// Se carga con next/dynamic y calcula en el backend bajo demanda; resultados en memoria por (fecha, ruta).
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { TOKENS } from '@/lib/designTokens';
import { athColor, athTone } from '@/lib/athDrawdown';
import { CREDIT_META, creditStatus, MODE_META, pnlColor, SELL_LIGHT, trancheMode, trancheCheckText, TRANCHE_LIGHT, type CreditState, type TrancheCheck, type TrancheLight } from '@/lib/tranches';

type Route = 'voo' | 'qqq';
type Rule = 'half' | 'extraVote';
type Tranche = { id: string; weight: number; size: number; lev3x: number; status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null; backup?: boolean; checks: TrancheCheck[]; pnl?: number | null; pnlMix?: number | null };
type Result = {
  date: string; route: Route; light: TrancheLight;
  episode: null | { start: string; peakDate: string; peak: number; price: number; dd: number; ddMax: number; minDate: string; min: number; days: number; sectorOnly: boolean; spDd: number | null; ndxDd: number | null };
  lastEpisode: null | { start: string; end: string; ddMax: number };
  today: {
    price: number | null; spDd: number | null; ndxDd: number | null; veto: boolean; oas: number | null; oasMax63: number | null; oasSma20: number | null;
    ratio: number | null; volSource: 'ratio' | 'fallback'; volVote: boolean; volArmedAt: string | null;
    volSignal?: 'ratio' | 'level' | null; vix?: number | null; vixMax20?: number | null; bht?: number | null;
    decelVote: boolean; slope: number | null; curv: number | null; slopeMin: number | null; recover: number | null; boll: boolean; decelGraceLeft?: number | null; votes: number; cape: number | null; capeMedian20: number | null;
    credit?: CreditState;
  };
  ath?: { spx: Ath | null; qqq: Ath | null; tqqq?: Ath | null };
  tranches: Tranche[]; deployed: number; leverage: number; avgPrice: number | null; captured: number | null; pnl?: number | null; pnlMix?: number | null;
};
type Sell = {
  date: string; active: boolean; light: 'gray' | 'amber' | 'orange' | 'red';
  cycle: null | { start: string; days: number; peak: number; peakDate: string; fromPeak: number };
  lastCycle: null | { start: string; end: string };
  today: { price: number | null; bht: number | null; hi20: number | null; fromHi20: number | null; sma50: number | null; sma200: number | null; below200days: number; deathCross: boolean; weak: boolean; credit?: CreditState };
  creditCycle?: boolean;
  tranches: Array<{ id: string; weight: number; from3x: number; status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null; pnl: number | null; checks: TrancheCheck[] }>;
  sold: number; leverage: number; avgPrice: number | null; pnl: number | null;
};
type NetCheck = { key: string; ok: boolean; value?: number | string | null; need?: number | string | null };
type Net = {
  date: string; cashPct: number; netBoughtPct: number; lastSale: string | null; corrected: boolean; active: boolean;
  rules: Record<'Bv' | 'Ds' | 'R1e', { target: number; checks: NetCheck[] }>;
  events: Array<{ date: string; rule: string; pct: number; price: number }>;
  /** Compras del ciclo vigente (vacío si el ciclo ya se cerró) y fecha de cierre del último ciclo. */
  cycleEvents?: Array<{ date: string; rule: string; pct: number; price: number }>;
  cycleClosedAt?: string | null;
};
type Both = Partial<Record<Rule, Result | null>> & { sell?: Sell | null; net?: Net | null; hyReal?: number | null };
type Ath = { pct: number; date: string; price: number; window5y: boolean };

const cache = new Map<string, Promise<Both | null>>();
function fetchTranches(date: string, route: Route) {
  const key = `${date}:${route}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`${getApiBase()}/api/backtesting/bht-tranches?date=${date}&instrument=${route}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j && !j.error ? (j as Both) : null))
      .catch(() => null)
      // Un fallo (backend reiniciando, error momentáneo) no se guarda: la siguiente vez se vuelve a pedir.
      .then((v) => { if (!v) cache.delete(key); return v; }));
  }
  return cache.get(key)!;
}

const money = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(Number(v.toFixed(d)) || 0) > 0 ? '+' : ''}${(Number(v.toFixed(d)) || 0).toFixed(d)}%`);
/** P&L desde el precio de disparo, con el semáforo de ganancias/pérdidas. */
const PnL = ({ v, title, bare, label }: { v: number; title: string; bare?: boolean; label?: string }) => (
  <span className={`font-bold ${bare ? '' : 'ml-1.5 px-1 rounded'}`} style={{ color: pnlColor(v), backgroundColor: bare ? undefined : `${pnlColor(v)}1a` }} title={title}>{label ?? pct(v)}</span>
);
const Mark = ({ ok }: { ok: boolean }) => <span className={`font-bold ${ok ? 'text-favorable-300' : 'text-slate-500'}`}>{ok ? '✓' : '✗'}</span>;

const T = {
  es: {
    title: 'Módulo de Reentrada por Tranches', sellTitle: 'Módulo de Salida por Tranches', buySide: 'Compra', sellSide: 'Venta', modeTitle: 'Modo del día: compra si hay un episodio de caída abierto, venta si hay un ciclo de codicia (BHT ≥ 70), si no en espera',
    cycle: 'Ciclo de codicia desde el', peakSince: 'máximo del ciclo', fromPeak: 'desde el máximo', noCycle: 'Sin ciclo abierto', lastCycle: 'Último ciclo', sold: 'Vendido', left: 'apalancamiento restante', avgSell: 'precio promedio de venta', sinceSale: 'desde la venta', soldOn: 'Vendido', from3x: 'Sale primero del', fromHi20: 'vs máx. 20 días', vs50: 'vs SMA50', below200: 'días bajo SMA200', dcross: 'Death Cross', yes: 'sí', no: 'no',
    sellNote: 'Escalera de venta estudiada 1993–2026: V1–V3 por valuación (BHT 70/75/80) esperan la primera debilidad (≥3% bajo el máximo de 20 días, 15 sesiones entre ventas); V4 BHT ≥ 70 bajo la SMA50; V5 tendencia rota. Con crisis de crédito (HY ≥ 1.5× su mínimo de 12 meses, subiendo, con la bolsa cerca de máximos) V4 y V5 venden sin exigir BHT alto. 1997–2025, BHT sin look-ahead: S&P evitó 30% en promedio (subió 8% tras vender), QQQ 32% (16%). Cada venta saca primero el 3×. El ciclo se reinicia tras 20 sesiones con BHT < 55; la recompra la gobierna el módulo de compra. «Desde la venta» negativo = caída evitada. No es asesoría financiera.', route: 'Ruta', vooRoute: 'S&P 500', qqqRoute: 'Nasdaq-100 (QQQ como proxy)',
    rule: 'Corrección sectorial', half: 'T1 a medio tamaño', extra: 'T1 con voto extra', ruleTitle: 'Si solo cae el Nasdaq-100 y el S&P 500 no confirma',
    episode: 'Episodio desde el pico del', days: 'días', ddNow: 'Caída hoy', ddMax: 'máxima del episodio', trough: 'mínimo', sector: 'corrección sectorial: el S&P 500 no confirma',
    noEpisode: 'Sin episodio abierto', fromAth: 'desde ATH', atAth: 'En máximo histórico', at5y: 'En máximo de 5 años', lastEp: 'Último episodio', ended: 'cerró el',
    cond: 'Condiciones del día', permit: 'Permiso', veto: 'Veto de crédito', vol: 'Voto de volatilidad', decel: 'Voto de desaceleración', val: 'Valuación (T4)',
    vetoOn: 'activo: HY en su máximo de 63 días y sobre su SMA20', vetoOff: 'sin veto', credit: 'Crisis de crédito', crMin: 'mín. 12m', crD3: 'Δ3M', crPx: 'precio vs máx. 12m', crMax63: 'vs máx. 63d', crEase: 'alivio ≤ −10% o BHT ≤ 40', crSince: 'última divergencia', creditSince: 'Ciclo por crisis de crédito desde el', creditCycle: 'Ciclo abierto por crisis de crédito (no por valuación): V4 y V5 venden sin exigir BHT alto',
    volFallback: 'respaldo con niveles de VIX (sin VIX3M antes de 2007)', armed: 'armado el', notArmed: 'no se armó en este episodio', orLevel: 'o nivel:', max20: 'máx 20d', ratio: 'VIX/VIX3M', volA: 'A · Curva VIX/VIX3M', volArmRule: 'se arma > 1.05 y se activa al bajar de 1', volB: 'B · Caída del VIX', volNow: 'hoy', volFromMax: 'vs su máx. de 20 días', volNeed: 'requiere ≤ −25%, VIX ≤', volMaxNeed: 'máx. ≥ 25', volBht: 'y BHT', needLt: 'requiere < 50, o < 55 con CAPE ≤ 1.25× su mediana 20a', volEither: 'Basta A o B.',
    slope: 'pendiente EMA50', recover: 'recuperó', boll: 'reingreso a la banda de Bollinger −2σ', grace: (n: number) => `la pendiente ya cruzó a positiva: el voto sigue ${n} ${n === 1 ? 'sesión' : 'sesiones'} más`, phaseDone: 'la pendiente cruzó a positiva: fase de desaceleración terminada', capeVs: 'CAPE vs mediana 20 años',
    tranche: 'Tranche', weight: 'Peso', mix: 'Mezcla', status: 'Estado', fired: 'Disparado', today: 'Hoy', pending: 'Falta', backup: 'respaldo (12 meses sobre la EMA200)', halfSize: 'medio tamaño',
    names: { T0: 'Capitulación', T1: 'Pánico terminando', T2: 'Desaceleración', T3: 'Validación', T4: 'Valuación profunda' } as Record<string, string>,
    pnlTitle: 'Cambio del precio de referencia desde el disparo hasta esta fecha', pnlMixTitle: 'P&L de la mezcla 1×/3× (el 3× con su propio precio)', pnlTotal: 'P&L',
    deployed: 'Desplegado', lev: 'apalancamiento', avg: 'precio promedio', captured: 'de la caída capturada',
    note: 'Metodología de investigación cuantitativa (MRT v1.3, adaptado): permiso por caída del precio vs su máximo de 12 meses; voto de volatilidad híbrido blindado (VIX/VIX3M, o VIX ≥25% bajo su máximo de 20 días con BHT < 50); T4 con CAPE debajo de su mediana de 20 años; sin voto de amplitud. No es asesoría financiera.',
    loading: 'Calculando…', error: 'No se pudo calcular.',
  },
  en: {
    title: 'Tranche Re-entry Module', sellTitle: 'Tranche Exit Module', buySide: 'Buy', sellSide: 'Sell', modeTitle: 'Mode of the day: buy if a drawdown episode is open, sell if a greed cycle is open (BHT ≥ 70), otherwise on hold',
    cycle: 'Greed cycle since', peakSince: 'cycle high', fromPeak: 'from the high', noCycle: 'No open cycle', lastCycle: 'Last cycle', sold: 'Sold', left: 'remaining leverage', avgSell: 'average sale price', sinceSale: 'since the sale', soldOn: 'Sold', from3x: 'Sells first from', fromHi20: 'vs 20-day high', vs50: 'vs SMA50', below200: 'days below SMA200', dcross: 'Death Cross', yes: 'yes', no: 'no',
    sellNote: 'Sell ladder studied 1993–2026: V1–V3 on valuation (BHT 70/75/80) wait for the first weakness (≥3% below the 20-day high, 15 sessions between sales); V4 BHT ≥ 70 below the SMA50; V5 broken trend. In a credit crisis (HY ≥ 1.5× its 12-month low, rising, with stocks near highs) V4 and V5 sell without requiring a high BHT. 1997–2025, point-in-time BHT: S&P avoided 30% on average (rose 8% after selling), QQQ 32% (16%). Each sale takes out the 3× first. The cycle resets after 20 sessions with BHT < 55; buying back is up to the buy module. Negative «since the sale» = drawdown avoided. Not financial advice.', route: 'Route', vooRoute: 'S&P 500', qqqRoute: 'Nasdaq-100 (QQQ as proxy)',
    rule: 'Sector correction', half: 'T1 at half size', extra: 'T1 with an extra vote', ruleTitle: 'When only the Nasdaq-100 falls and the S&P 500 does not confirm',
    episode: 'Episode since the peak of', days: 'days', ddNow: 'Drawdown today', ddMax: 'episode max', trough: 'low', sector: 'sector correction: the S&P 500 does not confirm',
    noEpisode: 'No open episode', fromAth: 'from ATH', atAth: 'At all-time high', at5y: 'At 5-year high', lastEp: 'Last episode', ended: 'closed on',
    cond: 'Conditions of the day', permit: 'Permission', veto: 'Credit veto', vol: 'Volatility vote', decel: 'Deceleration vote', val: 'Valuation (T4)',
    vetoOn: 'active: HY at its 63-day high and above its SMA20', vetoOff: 'no veto', credit: 'Credit crisis', crMin: '12m low', crD3: 'Δ3M', crPx: 'price vs 12m high', crMax63: 'vs 63d high', crEase: 'easing ≤ −10% or BHT ≤ 40', crSince: 'last divergence', creditSince: 'Credit-crisis cycle since', creditCycle: 'Cycle opened by a credit crisis (not valuation): V4 and V5 sell without requiring a high BHT',
    volFallback: 'VIX-level fallback (no VIX3M before 2007)', armed: 'armed on', notArmed: 'not armed in this episode', orLevel: 'or level:', max20: '20d high', ratio: 'VIX/VIX3M', volA: 'A · VIX/VIX3M curve', volArmRule: 'arms > 1.05, fires when it drops below 1', volB: 'B · VIX drop', volNow: 'today', volFromMax: 'vs its 20-day high', volNeed: 'needs ≤ −25%, VIX ≤', volMaxNeed: 'high ≥ 25', volBht: 'and BHT', needLt: 'needs < 50, or < 55 with CAPE ≤ 1.25× its 20y median', volEither: 'A or B is enough.',
    slope: 'EMA50 slope', recover: 'recovered', boll: 'back inside the −2σ Bollinger band', grace: (n: number) => `the slope already turned positive: the vote stays valid ${n} more ${n === 1 ? 'session' : 'sessions'}`, phaseDone: 'the slope turned positive: deceleration phase over', capeVs: 'CAPE vs 20-year median',
    tranche: 'Tranche', weight: 'Weight', mix: 'Mix', status: 'Status', fired: 'Fired', today: 'Today', pending: 'Missing', backup: 'backup (12 months above the EMA200)', halfSize: 'half size',
    names: { T0: 'Capitulation', T1: 'Panic ending', T2: 'Deceleration', T3: 'Validation', T4: 'Deep value' } as Record<string, string>,
    pnlTitle: 'Reference price change from the trigger to this date', pnlMixTitle: 'P&L of the 1×/3× mix (the 3× at its own price)', pnlTotal: 'P&L',
    deployed: 'Deployed', lev: 'leverage', avg: 'average price', captured: 'of the drawdown captured',
    note: 'Quantitative research methodology (MRT v1.3, adapted): permission by price drawdown vs its 12-month high; hardened hybrid volatility vote (VIX/VIX3M, or VIX ≥25% below its 20-day high with BHT < 50); T4 with CAPE below its 20-year median; no breadth vote. Not financial advice.',
    loading: 'Computing…', error: 'Could not compute.',
  },
};

/** initialRoute: la de la gráfica que abrió el detalle (S&P 500 → VOO; QQQ/TQQQ → QQQ), para que sus marcas V/T coincidan. */
export default function BhtTranchesView({ date, locale, initialRoute = 'qqq', chartRoute }: { date: string; locale: string; initialRoute?: Route; chartRoute?: Route }) {
  const es = locale === 'es';
  const t = es ? T.es : T.en;
  const [route, setRoute] = useState<Route>(initialRoute);
  const [rule, setRule] = useState<Rule>('half');
  const key = `${date}:${route}`;
  const [state, setState] = useState<{ key: string; data: Both | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTranches(date, route).then((data) => { if (alive) setState({ key, data }); });
    return () => { alive = false; };
  }, [date, route, key]);
  const fresh = state?.key === key;
  const both = state?.data;
  const r = both ? both[rule] ?? both.half ?? null : state ? null : undefined;
  const [one, three] = route === 'qqq' ? ['QQQ', 'TQQQ'] : ['VOO', 'UPRO'];
  const L = r ? TRANCHE_LIGHT[r.light] : null;
  const sell = both?.sell ?? null;
  // Modo automático (compra si hay episodio de caída, venta si hay ciclo de codicia, si no en espera); el selector
  // permite ver el otro lado. La vista toma el color del lado que se está viendo.
  const mode = trancheMode(!!r?.episode, !!sell?.active);
  const [side, setSide] = useState<'buy' | 'sell' | null>(null);
  const view = side ?? (mode === 'sell' ? 'sell' : 'buy');
  const viewColor = view === 'sell' ? MODE_META.sell.color : MODE_META.buy.color;
  const M = MODE_META[mode];

  const seg = (on: boolean) => `px-2 py-0.5 rounded-md transition ${on ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`;
  return (
    <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        {/* Modo del día (automático) y selector Compra / Venta, cada uno con su color. */}
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide" style={{ color: M.color, borderColor: `${M.color}66`, backgroundColor: `${M.color}14` }} title={t.modeTitle}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: M.color }} />{es ? M.es : M.en}
        </span>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 font-bold">
          {(['buy', 'sell'] as const).map((v) => (
            <button key={v} type="button" onClick={(e) => { e.stopPropagation(); setSide(v); }}
              className={`px-2 py-0.5 rounded-md transition ${view === v ? 'text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
              style={view === v ? { backgroundColor: MODE_META[v].color } : undefined}>{v === 'buy' ? t.buySide : t.sellSide}</button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 font-bold" title={t.route}>
          <button type="button" className={seg(route === 'voo')} onClick={(e) => { e.stopPropagation(); setRoute('voo'); }}>VOO</button>
          <button type="button" className={seg(route === 'qqq')} onClick={(e) => { e.stopPropagation(); setRoute('qqq'); }}>QQQ / TQQQ</button>
        </div>
        {/* Las marcas V/T de la gráfica son de la ruta de la gráfica: si la tabla muestra otra, las fechas no coinciden. */}
        {chartRoute && chartRoute !== route && (
          <span className="text-[10px] text-caution-300">{es
            ? `Las marcas de la gráfica son de la ruta ${chartRoute === 'voo' ? 'VOO (S&P 500)' : 'QQQ'}; esta tabla es ${route === 'voo' ? 'VOO' : 'QQQ/TQQQ'}, sus fechas pueden no coincidir.`
            : `Chart marks follow the ${chartRoute === 'voo' ? 'VOO (S&P 500)' : 'QQQ'} route; this table is ${route === 'voo' ? 'VOO' : 'QQQ/TQQQ'}, so dates may differ.`}</span>
        )}
        {route === 'qqq' && view === 'buy' && (
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5" title={t.ruleTitle}>
            <button type="button" className={seg(rule === 'half')} onClick={(e) => { e.stopPropagation(); setRule('half'); }}>{t.half}</button>
            <button type="button" className={seg(rule === 'extraVote')} onClick={(e) => { e.stopPropagation(); setRule('extraVote'); }}>{t.extra}</button>
          </div>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wide font-bold" style={{ color: viewColor }}>{view === 'sell' ? t.sellTitle : t.title}</div>

      {r === undefined ? <div className="font-mono text-slate-500">{t.loading}</div> : r === null ? <div className="font-mono text-risk-300">{t.error}</div> : view === 'sell' ? (
        sell ? <SellView sell={sell} es={es} t={t} one={one} three={three} fresh={fresh} hyReal={both?.hyReal} /> : <div className="font-mono text-risk-300">{t.error}</div>
      ) : (
        <div className={`space-y-2 pl-2 border-l-2 transition-opacity ${fresh ? '' : 'opacity-50'}`} style={{ borderColor: `${MODE_META.buy.color}88` }}>
          {/* Semáforo y episodio */}
          <div className="p-2 rounded-lg border" style={{ borderColor: `${L!.color}66`, backgroundColor: `${L!.color}12` }}>
            <div className="flex items-center gap-2 font-bold" style={{ color: L!.color }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: L!.color }} />{es ? L!.es : L!.en}
              <span className="ml-auto text-[10px] font-normal text-slate-500">{route === 'qqq' ? t.qqqRoute : t.vooRoute}</span>
            </div>
            {r.episode ? (
              <div className="mt-1 font-mono text-slate-300 space-y-0.5">
                <div>{t.episode} {r.episode.peakDate} ({route === 'qqq' ? 'QQQ' : 'S&P 500'} {money(r.episode.peak)}) · {r.episode.days} {t.days}</div>
                <div>{t.ddNow} <span className="text-risk-300 font-bold">{pct(r.episode.dd)}</span> · {t.ddMax} <span className="text-risk-300">{pct(r.episode.ddMax)}</span> · {t.trough} {money(r.episode.min)} ({r.episode.minDate})</div>
                {r.episode.sectorOnly && <div className="text-caution-300">{t.sector}</div>}
              </div>
            ) : (
              <>
                <div className="mt-1 font-mono text-slate-400">{t.noEpisode}{r.lastEpisode && <> · {t.lastEp} {r.lastEpisode.start} → {t.ended} {r.lastEpisode.end} ({pct(r.lastEpisode.ddMax)})</>}</div>
                {/* Sin episodio: caída desde el ATH de cada instrumento analizado, con el semáforo de las cards. */}
                {r.ath && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono">
                    {([['S&P 500', r.ath.spx], ['QQQ', r.ath.qqq], ['TQQQ', r.ath.tqqq ?? null]] as [string, Ath | null][]).filter(([, a]) => a).map(([k, a]) => {
                      const c = athColor(athTone(a!.pct));
                      const ath = a!.window5y ? 'ATH 5Y' : 'ATH';
                      return (
                        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${ath} ${money(a!.price)} · ${a!.date}`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                          <span className="text-slate-400">{k}</span>
                          <span className="font-bold" style={{ color: c }}>{a!.pct > -0.05 ? (a!.window5y ? t.at5y : t.atAth) : `${pct(a!.pct)} ${t.fromAth}${a!.window5y ? ' 5Y' : ''}`}</span>
                          <span className="text-slate-500">· {a!.date}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Condiciones del día */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{t.cond}</div>
            <table className="w-full font-mono">
              <tbody className="[&_td]:py-[1px]">
                <tr className="border-b border-slate-800/60">
                  <td className="w-4"><Mark ok={!!r.episode} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.permit}</td>
                  <td className="text-slate-400">S&P 500 {pct(r.today.spDd)} (≤ −10%){route === 'qqq' && <> · QQQ {pct(r.today.ndxDd)} (≤ −15%)</>}</td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={!r.today.veto} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.veto}</td>
                  <td className={r.today.veto ? 'text-risk-300' : 'text-slate-400'}>{r.today.veto ? t.vetoOn : t.vetoOff} · HY {es ? 'modelo' : 'model'} (Baa×1.91) {r.today.oas?.toFixed(2) ?? '—'}% · máx63 {r.today.oasMax63?.toFixed(2) ?? '—'} · SMA20 {r.today.oasSma20?.toFixed(2) ?? '—'}{both?.hyReal != null && <span className="text-slate-500" title={es ? 'HY OAS real de ICE, solo referencia: las reglas usan la serie del modelo (1.913 × Baa) porque el real solo tiene 3 años en FRED' : 'Real ICE HY OAS, reference only: the rules use the model series (1.913 × Baa) since the real one has only 3 years on FRED'}> · {es ? 'real ICE' : 'real ICE'} {both.hyReal.toFixed(2)}%</span>}</td>
                </tr>
                {r.today.credit && (
                  <tr className="border-b border-slate-800/60">
                    <td><Mark ok={!r.today.credit.crisis || r.today.credit.easing} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.credit}</td>
                    <td className="text-slate-400"><CreditLine c={r.today.credit} es={es} t={t} hyReal={both?.hyReal} /></td>
                  </tr>
                )}
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={r.today.volVote} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.vol}</td>
                  <td className="text-slate-400">
                    {/* Dos vías, una por renglón, con cada requisito en verde (cumple) o gris/rojo (falta). */}
                    {(() => {
                      const okC = (ok: boolean | null) => (ok == null ? '' : ok ? 'text-favorable-300' : 'text-risk-300');
                      const v = r.today.vix ?? null, m = r.today.vixMax20 ?? null, b = r.today.bht ?? null;
                      const drop = v != null && m ? (v / m - 1) * 100 : null;
                      const target = m != null ? 0.75 * m : null;
                      return (
                        <div className="flex flex-col">
                          <span className={r.today.volSignal === 'ratio' ? 'text-favorable-300' : ''}>
                            <span className="text-slate-300">{t.volA}:</span>{' '}
                            {r.today.volSource === 'ratio' ? <><b className="text-slate-200">{r.today.ratio?.toFixed(2)}</b> ({t.volArmRule})</> : t.volFallback}
                            {r.episode && (r.today.volArmedAt ? <> · {t.armed} {r.today.volArmedAt}</> : <> · {t.notArmed}</>)}
                          </span>
                          <span className={r.today.volSignal === 'level' ? 'text-favorable-300' : ''}>
                            <span className="text-slate-300">{t.volB}:</span>{' '}
                            VIX {t.volNow} <b className="text-slate-200">{v?.toFixed(1) ?? '—'}</b> {t.volFromMax} <b className="text-slate-200">{m?.toFixed(1) ?? '—'}</b>
                            {' = '}<b className={okC(drop != null ? drop <= -25 : null)}>{drop != null ? `${drop > 0 ? '+' : ''}${drop.toFixed(1)}%` : '—'}</b>
                            {' '}({t.volNeed} {target?.toFixed(1) ?? '—'}; <span className={okC(m != null ? m >= 25 : null)}>{t.volMaxNeed}</span>)
                            {(() => {
                              // < 50, o < 55 con el CAPE ≤ 1.25× su mediana de 20 años (TRANCHE_CFG.lvlMaxBhtCheap).
                              const rel = r.today.cape != null && r.today.capeMedian20 ? r.today.cape / r.today.capeMedian20 : null;
                              const cheap = rel != null && rel <= 1.25;
                              return <>{' · '}{t.volBht} <b className={okC(b != null ? b < 50 || (cheap && b < 55) : null)}>{b?.toFixed(1) ?? '—'}</b> ({t.needLt}{rel != null && <>; CAPE {rel.toFixed(2)}×</>})</>;
                            })()}
                          </span>
                          <span className="text-[10px] text-slate-500">{t.volEither}</span>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={r.today.decelVote} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.decel}</td>
                  <td className="text-slate-400">{t.slope} {pct(r.today.slope, 2)}{r.today.slopeMin != null && <> (mín {pct(r.today.slopeMin, 2)})</>}{r.today.recover != null && <> · {t.recover} {r.today.recover.toFixed(0)}% / 50%</>}{r.today.boll && <> · {t.boll}</>}{r.today.decelGraceLeft != null ? <> · <span className="text-accent-300">{t.grace(r.today.decelGraceLeft)}</span></> : !r.today.decelVote && (r.today.recover ?? 0) >= 100 && (r.today.slope ?? -1) >= 0 && <> · {t.phaseDone}</>}</td>
                </tr>
                <tr>
                  <td><Mark ok={r.today.cape != null && r.today.capeMedian20 != null && r.today.cape < r.today.capeMedian20} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.val}</td>
                  <td className="text-slate-400">{t.capeVs}: {r.today.cape?.toFixed(1) ?? '—'} vs {r.today.capeMedian20?.toFixed(1) ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tranches */}
          <table className="w-full font-mono">
            <thead className="text-[9px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-700/70">
                <th className="text-left font-normal py-0.5">{t.tranche}</th><th className="text-right font-normal">{t.weight}</th>
                <th className="text-right font-normal px-2">{t.mix} {one}/{three}</th><th className="text-left font-normal">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {r.tranches.map((x) => {
                const missing = x.checks.filter((c) => !c.ok);
                return (
                  <tr key={x.id} className={`border-b border-slate-800/60 align-top ${x.status === 'today' ? 'bg-favorable-500/10' : ''}`}>
                    <td className="py-0.5 whitespace-nowrap"><Tick on={x.status !== 'pending'} /><span className="font-bold text-slate-100">{x.id}</span> <span className="text-slate-400 font-sans">{t.names[x.id]}</span></td>
                    <td className="text-right text-slate-300">{(x.weight * 100).toFixed(0)}%</td>
                    <td className="text-right text-slate-400 px-2 whitespace-nowrap">{Math.round((1 - x.lev3x) * 100)}/{Math.round(x.lev3x * 100)}</td>
                    <td className="text-slate-300">
                      {x.status !== 'pending' ? (
                        <span className="text-favorable-300 font-bold">{x.status === 'today' ? t.today : t.fired} {x.date} @ {money(x.price)}{x.pnl != null && <PnL v={x.pnl} title={t.pnlTitle} />}{x.pnlMix != null && x.lev3x > 0 && <span className="font-normal text-slate-400"> · {t.mix.toLowerCase()} <PnL v={x.pnlMix} title={t.pnlMixTitle} bare /></span>}{x.size < 1 && <span className="font-normal text-caution-300"> · {t.halfSize}</span>}{x.backup && <span className="font-normal text-slate-400"> · {t.backup}</span>}</span>
                      ) : !r.episode ? <span className="text-slate-600">—</span> : (
                        <span className="text-slate-400">{t.pending}: {missing.map((c) => trancheCheckText(c, locale)).join(' · ') || '—'}</span>
                      )}
                      <RuleKey id={x.id} es={es} />
                    </td>
                  </tr>
                );
              })}
              {both?.net && <NetRows net={both.net} es={es} money={money} />}
            </tbody>
          </table>
          <div className="font-mono text-slate-300">
            {t.deployed} <span className="font-bold text-slate-100">{(r.deployed * 100).toFixed(1)}%</span> · {t.lev} <span className="font-bold" style={{ color: r.leverage > 1 ? TOKENS.elevated : undefined }}>{r.leverage.toFixed(2)}x</span>
            {r.avgPrice != null && <> · {t.avg} {money(r.avgPrice)}</>}{r.pnl != null && <> · {t.pnlTotal} <PnL v={r.pnl} title={t.pnlTitle} bare />{r.pnlMix != null && r.leverage !== r.deployed && <> ({t.mix.toLowerCase()} <PnL v={r.pnlMix} title={t.pnlMixTitle} bare />)</>}</>}{r.captured != null && <> · <span className="text-favorable-300">{r.captured.toFixed(0)}%</span> {t.captured}</>}
          </div>
          <NetFooter net={both?.net} es={es} />
          <div className="text-[10px] text-slate-500 leading-snug">{t.note}</div>
        </div>
      )}
    </div>
  );
}

type TT = typeof T.es;
/** Línea de crédito (CREDIT_CFG): estado y cada requisito en verde si cumple. Divergencia = OAS ≥ 1.5× su mínimo de 12 meses,
 *  Δ3M ≥ +0.5 y precio a menos de 7% de su máximo; en crisis, las compras esperan alivio (≥10% bajo su máx. de 63 días) o BHT ≤ 40. */
function CreditLine({ c, es, t, hyReal }: { c: CreditState | undefined; es: boolean; t: TT; hyReal?: number | null }) {
  if (!c) return null;
  const st = creditStatus(c), M = CREDIT_META[st];
  const okC = (ok: boolean | null) => (ok == null ? 'text-slate-200' : ok ? 'text-risk-300 font-bold' : 'text-slate-200');
  const sg = (v: number | null, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
  return (
    <div className="flex flex-col">
      <span className="font-bold" style={{ color: M.color }}>{es ? M.es : M.en}</span>
      <span>
        HY <span className="text-slate-500">({es ? 'modelo' : 'model'}, Baa×1.91)</span> <b className="text-slate-200">{c.oas?.toFixed(2) ?? '—'}%</b>{hyReal != null && <span className="text-slate-500"> ({es ? 'real ICE' : 'real ICE'} {hyReal.toFixed(2)}%)</span>}
        {' = '}<b className={okC(c.ratio != null ? c.ratio >= 1.5 : null)}>{c.ratio?.toFixed(2) ?? '—'}×</b> {t.crMin} (≥ 1.5)
        {' · '}{t.crD3} <b className={okC(c.d3 != null ? c.d3 >= 0.5 : null)}>{sg(c.d3, 2)}</b> (≥ +0.5)
        {' · '}{t.crPx} <b className={okC(c.fromHi252 != null ? c.fromHi252 >= -7 : null)}>{sg(c.fromHi252)}%</b> (&gt; −7%)
      </span>
      {c.crisis && (
        <span>{t.crMax63} <b className={c.easing ? 'text-favorable-300' : 'text-slate-200'}>{sg(c.fromMax63)}%</b> ({t.crEase}){c.lastDiv && <> · {t.crSince} {c.lastDiv}</>}</span>
      )}
    </div>
  );
}
/** Vista de la escalera de venta: ciclo de codicia, condiciones del día y los 5 tranches de venta (color rosa). */
function SellView({ sell, es, t, one, three, fresh, hyReal }: { sell: Sell; es: boolean; t: TT; one: string; three: string; fresh: boolean; hyReal?: number | null }) {
  const L = SELL_LIGHT[sell.light];
  const names: Record<string, [string, string]> = { V1: ['Codicia', 'Greed'], V2: ['Codicia extrema', 'Extreme greed'], V3: ['Euforia', 'Euphoria'], V4: ['Primera grieta', 'First crack'], V5: ['Tendencia rota', 'Broken trend'] };
  const td = sell.today;
  return (
    <div className={`space-y-2 pl-2 border-l-2 transition-opacity ${fresh ? '' : 'opacity-50'}`} style={{ borderColor: `${MODE_META.sell.color}88` }}>
      <div className="p-2 rounded-lg border" style={{ borderColor: `${L.color}66`, backgroundColor: `${L.color}12` }}>
        <div className="flex items-center gap-2 font-bold" style={{ color: L.color }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: L.color }} />{es ? L.es : L.en}</div>
        {sell.cycle ? (
          <div className="mt-1 font-mono text-slate-300">{sell.creditCycle ? t.creditSince : t.cycle} {sell.cycle.start} · {sell.cycle.days} {t.days} · {t.peakSince} {money(sell.cycle.peak)} ({sell.cycle.peakDate}) · <span className={sell.cycle.fromPeak < 0 ? 'text-risk-300' : 'text-favorable-300'}>{pct(sell.cycle.fromPeak)}</span> {t.fromPeak}</div>
        ) : (
          <div className="mt-1 font-mono text-slate-400">{t.noCycle}{sell.lastCycle && <> · {t.lastCycle} {sell.lastCycle.start} → {sell.lastCycle.end}</>}</div>
        )}
        {sell.creditCycle && <div className="mt-1 font-bold" style={{ color: CREDIT_META.div.color }}>{t.creditCycle}</div>}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{t.cond}</div>
        <div className="font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5">
          <span>BHT <span className="font-bold text-slate-100">{td.bht?.toFixed(1) ?? '—'}</span></span>
          <span>{t.fromHi20} <span className={td.weak ? 'text-caution-300 font-bold' : 'text-slate-200'}>{pct(td.fromHi20)}</span></span>
          <span>{t.vs50} <span className="text-slate-200">{td.sma50 && td.price ? pct((td.price / td.sma50 - 1) * 100) : '—'}</span></span>
          <span>{t.below200} <span className={td.below200days >= 3 ? 'text-risk-300 font-bold' : 'text-slate-200'}>{td.below200days}</span></span>
          <span>{t.dcross} <span className={td.deathCross ? 'text-risk-300 font-bold' : 'text-slate-200'}>{td.deathCross ? t.yes : t.no}</span></span>
        </div>
        {td.credit && <div className="mt-1 font-mono text-slate-400"><CreditLine c={td.credit} es={es} t={t} hyReal={hyReal} /></div>}
      </div>
      <table className="w-full font-mono">
        <thead className="text-[9px] uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-700/70">
            <th className="text-left font-normal py-0.5">{t.tranche}</th><th className="text-right font-normal">{t.weight}</th>
            <th className="text-right font-normal px-2">{t.from3x} {three}</th><th className="text-left font-normal">{t.status}</th>
          </tr>
        </thead>
        <tbody>
          {sell.tranches.map((x) => {
            const missing = x.checks.filter((c) => !c.ok);
            return (
              <tr key={x.id} className="border-b border-slate-800/60 align-top" style={x.status === 'today' ? { backgroundColor: `${MODE_META.sell.color}1a` } : undefined}>
                <td className="py-0.5 whitespace-nowrap"><Tick on={x.status !== 'pending'} /><span className="font-bold text-slate-100">{x.id}</span> <span className="text-slate-400 font-sans">{names[x.id]?.[es ? 0 : 1]}</span></td>
                <td className="text-right text-slate-300">{(x.weight * 100).toFixed(0)}%</td>
                <td className="text-right text-slate-500 px-2">{three} → {one}</td>
                <td className="text-slate-300">
                  {x.status !== 'pending' ? (
                    <span className="font-bold" style={{ color: MODE_META.sell.color }}>{x.status === 'today' ? t.today : t.soldOn} {x.date} @ {money(x.price)}{x.pnl != null && <PnL v={-x.pnl} title={t.sinceSale} label={pct(x.pnl)} />}</span>
                  ) : !sell.cycle ? <span className="text-slate-600">—</span> : (
                    <span className="text-slate-400">{t.pending}: {missing.map((c) => trancheCheckText(c, es ? 'es' : 'en')).join(' · ') || '—'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="font-mono text-slate-300">
        {t.sold} <span className="font-bold text-slate-100">{(sell.sold * 100).toFixed(0)}%</span> · {t.left} <span className="font-bold">{sell.leverage.toFixed(2)}x</span>
        {sell.avgPrice != null && <> · {t.avgSell} {money(sell.avgPrice)}</>}{sell.pnl != null && <> · {pct(sell.pnl)} {t.sinceSale}</>}
      </div>
      <div className="text-[10px] text-slate-500 leading-snug">{t.sellNote}</div>
    </div>
  );
}

const NET_NAMES: Record<'Bv' | 'Ds' | 'R1e', [string, string, string]> = {
  Bv: ['Barato con rebote', 'Cheap with rebound', 'BHT < 50 → 50% · < 40 → 100%'],
  Ds: ['Valuación en mínimos', 'Valuation lows', 'BHT < 45 → 50% · < 40 → 75% · < 35 → 100%'],
  R1e: ['Regreso a máximos', 'Back at highs', '100%'],
};
const NET_RULE_COLOR: Record<string, string> = { Bv: '#38bdf8', Ds: '#818cf8', R1e: TOKENS.favorable };
function netCheckText(c: NetCheck, es: boolean): string {
  const n = (v: unknown, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');
  const sg = (v: unknown) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—');
  switch (c.key) {
    case 'bht': return `BHT ${n(c.value)} (< ${c.need})`;
    case 'rebound': return es ? `precio sobre su SMA50 ascendente (${sg(c.value)})` : `price above its rising SMA50 (${sg(c.value)})`;
    case 'noCreditCrisis': return es ? 'sin crisis de crédito' : 'no credit crisis';
    case 'creditCalm': return es ? `crédito no estresado o ya aliviándose (HY ${n(c.value, 2)}× su mín. de 12 meses; estrés ≥ ${c.need}×)` : `credit not stressed or already easing (HY ${n(c.value, 2)}× its 12-month low; stress ≥ ${c.need}×)`;
    case 'capeRel': return es ? `CAPE ${n(c.value, 2)}× su mediana de 20 años (≤ ${c.need}×)` : `CAPE ${n(c.value, 2)}× its 20-year median (≤ ${c.need}×)`;
    case 'creditEasing': return es ? `HY ${sg(c.value)} vs su máx. de 63 días (≤ ${c.need}%)` : `HY ${sg(c.value)} vs its 63-day high (≤ ${c.need}%)`;
    case 'corrected': return es ? 'hubo corrección después de la venta' : 'a correction followed the sale';
    case 'atHigh': return es ? `precio en su máximo de 12 meses (${sg(c.value)})` : `price at its 12-month high (${sg(c.value)})`;
    case 'trendUp': return 'SMA50 > SMA200';
    default: return c.key;
  }
}
/** Filas de la red de seguridad dentro de la tabla de tranches: mismas columnas (peso sobre el efectivo de la venta,
 *  mezcla 1×/3× y estado: disparos del ciclo, «cumple hoy» o lo que falta). */
function NetRows({ net, es, money }: { net: Net; es: boolean; money: (v: number | null) => string }) {
  const recent = net.cycleEvents ?? (net.lastSale ? net.events.filter((e) => e.date > net.lastSale!) : []);
  const weights: Record<'Bv' | 'Ds' | 'R1e', string> = { Bv: '50–100%', Ds: '50–100%', R1e: '100%' };
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-1.5 pb-0.5 text-[9px] uppercase tracking-wide font-bold text-sky-300">
          {es ? 'Red de seguridad · efectivo de la venta que T0–T4 no recompraron' : 'Safety net · sale cash T0–T4 left'}
          <span className="normal-case tracking-normal font-normal text-slate-400"> · {net.active
            ? <>{es ? 'pendiente' : 'pending'} <b className="text-slate-100">{(net.cashPct * 100).toFixed(0)}%</b> {es ? 'del portafolio · venta' : 'of the portfolio · sale'} {net.lastSale}</>
            : net.cycleClosedAt
              ? (es ? `ciclo cerrado el ${net.cycleClosedAt}: espera una nueva venta` : `cycle closed on ${net.cycleClosedAt}: waits for a new sale`)
              : (es ? 'sin efectivo pendiente' : 'no pending cash')}</span>
        </td>
      </tr>
      {(['Bv', 'Ds', 'R1e'] as const).map((id) => {
        const r = net.rules[id];
        const fired = recent.filter((e) => e.rule === id);
        const missing = r.checks.filter((c) => !c.ok);
        const today = fired.some((e) => e.date === net.date);
        return (
          <tr key={id} className={`border-b border-slate-800/60 align-top ${today ? 'bg-favorable-500/10' : ''}`}>
            <td className="py-0.5 whitespace-nowrap"><Tick on={fired.length > 0} /><span className="font-bold" style={{ color: NET_RULE_COLOR[id] }}>R</span> <span className="text-slate-400 font-sans">{es ? NET_NAMES[id][0] : NET_NAMES[id][1]}</span></td>
            <td className="text-right text-slate-300 whitespace-nowrap" title={NET_NAMES[id][2]}>{weights[id]}</td>
            <td className="text-right text-slate-400 px-2 whitespace-nowrap">100/0</td>
            <td className="text-slate-300">
              {fired.length > 0 && (
                <span className="text-favorable-300 font-bold">{fired.map((e) => `${e.date === net.date ? (es ? 'Hoy' : 'Today') : (es ? 'Disparado' : 'Fired')} ${e.date} @ ${money(e.price)} (R${e.pct})`).join(' · ')}</span>
              )}
              {fired.length === 0 && r.target > 0 && net.active && <span className="text-favorable-300 font-bold">{es ? 'Cumple hoy' : 'Met today'}: {es ? 'objetivo' : 'target'} {(r.target * 100).toFixed(0)}%</span>}
              {fired.length === 0 && !(r.target > 0) && (
                <span className="text-slate-400">{es ? 'Falta' : 'Missing'}: {missing.map((c) => netCheckText(c, es)).join(' · ') || '—'}</span>)}
              {fired.length === 0 && r.target > 0 && !net.active && <span className="text-slate-400">{es ? 'Cumple, sin efectivo pendiente que recomprar' : 'Met, no pending cash to buy back'}</span>}
              <div className="text-[10px] text-slate-500">{NET_NAMES[id][2]} · <RuleKey id={id} es={es} inline /></div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
/** Resumen y nota de la red bajo la tabla. */
function NetFooter({ net, es }: { net: Net | null | undefined; es: boolean }) {
  if (!net) return null;
  return (
    <>
      {net.active && net.netBoughtPct > 0 && (
        <div className="font-mono text-slate-300">{es ? 'Red de seguridad: ya recompró' : 'Safety net: already bought back'} <b className="text-favorable-300">{(net.netBoughtPct * 100).toFixed(0)}%</b> {es ? 'del efectivo de la venta' : 'of the sale cash'}</div>
      )}
      <div className="text-[10px] text-slate-500 leading-snug">{es
        ? 'Red de seguridad (R): solo actúa sobre el efectivo de la venta que T0–T4 no recompraron (% de ese efectivo, en 1×). Barato y mínimos exigen el CAPE ≤ 1.25× su mediana de 20 años (en 2001 estaba en 1.9×) y sin crisis de crédito; con el crédito estresado, barato espera a que se alivie. Backtest 1993–2026 (1×): S&P 8.9% → 10.0% anual, QQQ 12.9% → 15.5%; días con ≥ 50% en efectivo 14% → 10% y 24% → 11%. Costo: caída máx. del S&P −33% → −43% (compra de ene-2009).'
        : 'Safety net (R): only acts on the sale cash T0–T4 left (% of that cash, at 1×). Cheap and lows require CAPE ≤ 1.25× its 20-year median (1.9× in 2001) and no credit crisis; with stressed credit, cheap waits for it to ease. Backtest 1993–2026 (1×): S&P 8.9% → 10.0% a year, QQQ 12.9% → 15.5%; days with ≥ 50% cash 14% → 10% and 24% → 11%. Cost: S&P max drawdown −33% → −43% (Jan-2009 buy).'}</div>
    </>
  );
}

/** Casilla del tranche: vacía si no se ha ejecutado, palomita verde si ya se ejecutó (en este episodio o ciclo). */
function Tick({ on }: { on: boolean }) {
  return (
    <span role="img" aria-label={on ? 'ejecutado' : 'pendiente'}
      className={`inline-flex items-center justify-center w-3 h-3 mr-1.5 align-[-1px] rounded-[3px] border text-[9px] leading-none font-bold ${on ? 'bg-favorable-500 border-favorable-400 text-slate-950' : 'border-slate-500'}`}>
      {on ? '✓' : ''}
    </span>
  );
}

/** Reglas completas de cada tranche y de la red (tooltip); en la tabla solo va la clave corta. */
const RULES: Record<string, { es: [string, string]; en: [string, string] }> = {
  T0: { es: ['4 condiciones', 'Capitulación, una vez por episodio, el primer día con las 4: (1) profundidad S&P ≤ −15% o QQQ ≤ −20% de su máximo; (2) velocidad S&P −10% o QQQ −13% en 10 sesiones; (3) pánico VIX/VIX3M > 1.20 (antes de 2007: VIX > 35 y ≥ 1.5× su promedio de 20 días); (4) crédito HY < 6%. No usa votos. 100% en 1×.'],
        en: ['4 conditions', 'Capitulation, once per episode, first day with all 4: (1) depth S&P ≤ −15% or QQQ ≤ −20% from its high; (2) speed S&P −10% or QQQ −13% in 10 sessions; (3) panic VIX/VIX3M > 1.20 (before 2007: VIX > 35 and ≥ 1.5× its 20-day average); (4) credit HY < 6%. No votes. 100% at 1×.'] },
  T1: { es: ['Regla compuesta', 'Permiso (S&P ≤ −10% o QQQ ≤ −15% de su máximo de 12 meses) + sin veto de crédito (veto = HY en su máximo de 63 días y sobre su SMA20) + voto de volatilidad: A · curva VIX/VIX3M que se arma > 1.05 y se activa al bajar de 1, o B · VIX ≥ 25% bajo su máximo de 20 días (máximo ≥ 25) con BHT < 50, o < 55 si el CAPE ≤ 1.25× su mediana de 20 años. En crisis de crédito espera alivio (HY ≥ 10% bajo su máximo de 63 días) o BHT ≤ 40. Si solo cae el Nasdaq: medio tamaño (o voto extra). 100% en 1×.'],
        en: ['Compound rule', 'Permit (S&P ≤ −10% or QQQ ≤ −15% from the 12-month high) + no credit veto (veto = HY at its 63-day high and above its SMA20) + volatility vote: A · VIX/VIX3M curve armed > 1.05, fires when it drops below 1, or B · VIX ≥ 25% below its 20-day high (high ≥ 25) with BHT < 50, or < 55 if CAPE ≤ 1.25× its 20-year median. In a credit crisis it waits for easing (HY ≥ 10% below its 63-day high) or BHT ≤ 40. Nasdaq-only drop: half size (or an extra vote). 100% at 1×.'] },
  T2: { es: ['Regla compuesta', '≥ 5 sesiones después de T1 + caída alcanzada en el episodio S&P ≤ −15% o QQQ ≤ −22% + sin veto de crédito + 2 votos: volatilidad (ver T1) y desaceleración (curvatura positiva de la EMA50 con su pendiente recuperada ≥ 50% desde el mínimo, o reingreso a la banda de Bollinger −2σ; si la pendiente cruza a positiva, el voto sigue 10 sesiones más). Mezcla 70/30 (1×/3×).'],
        en: ['Compound rule', '≥ 5 sessions after T1 + episode drop reached S&P ≤ −15% or QQQ ≤ −22% + no credit veto + 2 votes: volatility (see T1) and deceleration (positive EMA50 curvature with its slope ≥ 50% recovered from the low, or re-entry into the −2σ Bollinger band; once the slope turns positive the vote stays valid 10 more sessions). Mix 70/30 (1×/3×).'] },
  T3: { es: ['Principal o respaldo', '≥ 10 sesiones después de T2 + sin veto de crédito y: principal · retest del mínimo (precio ≤ 3% sobre el mínimo, tras un rebote ≥ 8%) con ≥ 1 voto; respaldo · 3 cierres sobre la EMA50 ascendente. Mezcla 40/60 (1×/3×).'],
        en: ['Main or backup', '≥ 10 sessions after T2 + no credit veto and: main · retest of the low (price ≤ 3% above the low, after a ≥ 8% rebound) with ≥ 1 vote; backup · 3 closes above a rising EMA50. Mix 40/60 (1×/3×).'] },
  T4: { es: ['Principal o respaldo', 'Principal · valuación profunda: caída alcanzada S&P ≤ −25% o QQQ ≤ −35% + CAPE debajo de su mediana de 20 años + HY ≥ 15% debajo de su máximo de 12 meses + ≥ 1 voto; compra 0/100 (todo en 3×). Respaldo · si a los 12 meses (252 sesiones) del inicio del episodio no se activó y el precio está sobre su EMA200, compra en 1×.'],
        en: ['Main or backup', 'Main · deep value: drop reached S&P ≤ −25% or QQQ ≤ −35% + CAPE below its 20-year median + HY ≥ 15% below its 12-month high + ≥ 1 vote; buys 0/100 (all 3×). Backup · if 12 months (252 sessions) into the episode it has not fired and price is above its EMA200, it buys at 1×.'] },
  Bv: { es: ['Reglas', 'Barato con rebote: BHT < 50 recompra 50% del efectivo de la venta, < 40 el 100%, con el precio sobre su SMA50 ascendente; además CAPE ≤ 1.25× su mediana de 20 años, sin crisis de crédito y, con el crédito estresado (HY ≥ 1.5× su mínimo de 12 meses), esperando a que se alivie (≥ 10% bajo su máximo de 63 días).'],
        en: ['Rules', 'Cheap with rebound: BHT < 50 buys back 50% of the sale cash, < 40 100%, with price above its rising SMA50; also CAPE ≤ 1.25× its 20-year median, no credit crisis and, with stressed credit (HY ≥ 1.5× its 12-month low), waiting for it to ease (≥ 10% below its 63-day high).'] },
  Ds: { es: ['Reglas', 'Valuación en mínimos: con el crédito aliviándose (HY ≥ 10% bajo su máximo de 63 días), sin esperar rebote: BHT < 45 → 50%, < 40 → 75%, < 35 → 100% del efectivo de la venta; además CAPE ≤ 1.25× su mediana de 20 años y sin crisis de crédito.'],
        en: ['Rules', 'Valuation lows: with credit easing (HY ≥ 10% below its 63-day high), without waiting for a rebound: BHT < 45 → 50%, < 40 → 75%, < 35 → 100% of the sale cash; also CAPE ≤ 1.25× its 20-year median and no credit crisis.'] },
  R1e: { es: ['Reglas', 'Regreso a máximos: si después de la venta hubo una corrección (se abrió un episodio de compra) y el precio vuelve a su máximo de 12 meses con SMA50 > SMA200 y BHT < 70, recompra todo el efectivo pendiente.'],
        en: ['Rules', 'Back at highs: if a correction followed the sale (a buy episode opened) and price returns to its 12-month high with SMA50 > SMA200 and BHT < 70, it buys back all pending cash.'] },
};
/** Clave corta de la regla: al pasar el mouse muestra la explicación completa; con clic la deja abierta debajo. */
function RuleKey({ id, es, inline }: { id: string; es: boolean; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const r = RULES[id];
  if (!r) return null;
  const [short, full] = es ? r.es : r.en;
  const box = 'rounded-md border border-slate-600 bg-slate-950 p-2 text-[11px] leading-snug text-slate-200 font-sans normal-case tracking-normal whitespace-normal';
  const key = (
    <span className="relative group inline-block">
      <button type="button" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-[10px] text-slate-400 underline decoration-dotted underline-offset-2 cursor-help hover:text-sky-300">{short} ⓘ</button>
      {!open && <span role="tooltip" className={`pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-80 max-w-[70vw] shadow-xl group-hover:block ${box}`}>{full}</span>}
    </span>
  );
  const pinned = open ? <div className={`mt-1 ${box}`}>{full}</div> : null;
  return inline ? <>{key}{pinned}</> : <div>{key}{pinned}</div>;
}
