'use client';
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { bhtHistoryRows } from '@/lib/orbHistory';
import { BHT_BANDS, bhtBand, capeScoreColor } from './bhtBands';
import { partLabel } from '@/lib/thermoScoring';
import { useThermoPartsMonthly } from './useThermoLive';
import { OrbHistoryTable } from './ThermoOrbs';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { placePinned, placePopover } from '@/lib/popoverPlacement';
import { TrendBadge } from './TrendBadge';
import type { BhtPinNav } from './bhtChartPin';
import { TOKENS } from '@/lib/designTokens';
import { athColor, athTone } from '@/lib/athDrawdown';

// Vista Estrategia: su código se descarga solo cuando se pulsa el botón (lazy) y calcula en el backend bajo demanda.
const BhtStrategyView = dynamic(() => import('./BhtStrategyView'), { ssr: false, loading: () => <div className="mt-2 font-mono text-slate-500">…</div> });
// Vista Drawdowns (caídas por año y tramos de compra/venta): igual, lazy y bajo demanda.
const BhtDrawdownsView = dynamic(() => import('./BhtDrawdownsView'), { ssr: false, loading: () => <div className="mt-2 font-mono text-slate-500">…</div> });
// Vista Tranches (Módulo de Reentrada por Tranches): lazy y bajo demanda.
const BhtTranchesView = dynamic(() => import('./BhtTranchesView'), { ssr: false, loading: () => <div className="mt-2 font-mono text-slate-500">…</div> });
type PopView = 'history' | 'strategy' | 'drawdowns' | 'tranches';

// Hover compartido del BHT Index: detalle por indicador igual al termómetro.
// El cierre es diferido (gracia de 350ms) para poder mover el mouse al popup
// y pulsar el botón Estrategia sin que se cierre en el camino.
export type BhtHoverState = null | { d: string; x: number; y: number };
export function useBhtDetail() {
  const [hover, setHover] = useState<BhtHoverState>(null);
  const [cache, setCache] = useState<Record<string, any>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClear = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const scheduleClear = useCallback(() => { cancelClear(); timer.current = setTimeout(() => setHover(null), 350); }, [cancelClear]);
  // Llevar el mouse al popup: si el cursor avanza hacia el popup (en el hueco entre ambos), el cambio de fecha y posición
  // se difiere un instante; al entrar al popup (cancelClear) se descarta y el popup se queda donde está.
  const hoverRef = useRef<BhtHoverState>(null);
  const aim = useRef<{ timer: ReturnType<typeof setTimeout>; since: number } | null>(null);
  const cancelAim = useCallback(() => { if (aim.current) { clearTimeout(aim.current.timer); aim.current = null; } }, []);
  const cancelClearAll = useCallback(() => { cancelClear(); cancelAim(); }, [cancelClear, cancelAim]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); cancelAim(); }, [cancelAim]);
  const apply = useCallback((v: BhtHoverState) => { hoverRef.current = v; setHover(v); }, []);
  const setHoverLive = useCallback((v: BhtHoverState | ((s: BhtHoverState) => BhtHoverState)) => {
    const next = typeof v === 'function' ? v(hoverRef.current) : v;
    if (next != null) cancelClear();
    const cur = hoverRef.current;
    const el = typeof document !== 'undefined' ? document.querySelector('[data-bht-pop]') : null;
    if (next && cur && el && next.d !== cur.d) {
      const r = el.getBoundingClientRect();
      const inY = next.y >= r.top && next.y <= r.bottom;
      const toward = inY && ((r.left >= cur.x && next.x > cur.x && next.x <= r.left + 2) || (r.right <= cur.x && next.x < cur.x && next.x >= r.right - 2));
      // Como máximo 180 ms de espera: quien recorre la gráfica despacio no se queda "atorado".
      if (toward && (!aim.current || Date.now() - aim.current.since < 180)) {
        const since = aim.current?.since ?? Date.now();
        if (aim.current) clearTimeout(aim.current.timer);
        aim.current = { since, timer: setTimeout(() => { aim.current = null; apply(next); }, 180) };
        return;
      }
    }
    cancelAim();
    apply(next);
  }, [cancelClear, cancelAim, apply]);
  const load = (d: string) => {
    if (cache[d]) return;
    fetch(`${getApiBase()}/api/backtesting/bht-forward/detail?date=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      // Sin detalle (fuera de la historia): se marca para no quedarse en «Cargando…».
      .then((j) => { if (j) setCache((m) => ({ ...m, [d]: j.error ? { missing: true } : j })); })
      .catch(() => {});
  };
  return { hover, setHover: setHoverLive, cache, load, scheduleClear, cancelClear: cancelClearAll };
}

// Al salir el mouse hacia el popup no se cierra (permite pulsar Estrategia);
// al salir fuera, cierre diferido.
export const bhtLeaveGuard = (e: any, det: { scheduleClear: () => void; cancelClear: () => void }) => {
  if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('[data-bht-pop]')) det.cancelClear();
  else det.scheduleClear();
};

const PART_SHORT: Record<string, string> = { RATIO: 'Ratio' };

// Gráficas: el cursor solo muestra el tooltip compacto (`tip`) y un clic fija el popover completo (`pin`).
// Se cierra con ✕, Esc o un clic fuera del popover y de la gráfica (`data-bht-chart`).
export function useBhtPin() {
  const [tip, setTip] = useState<BhtHoverState>(null);
  const [pin, setPinState] = useState<BhtHoverState>(null);
  const pinRef = useRef<BhtHoverState>(null);
  const setPin = useCallback((p: BhtHoverState) => { pinRef.current = p; setPinState(p); }, []);
  const close = useCallback(() => setPin(null), [setPin]);
  const open = pin != null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-bht-pop],[data-bht-chart]')) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, close]);
  return { tip, setTip, pin, setPin, close, pinnedDate: useCallback(() => pinRef.current?.d ?? null, []) };
}

/** Tooltip compacto del cursor: fecha, BHT con su banda y precios del día. No recibe el mouse. */
export function BhtHoverTip({ point, bht, prices, trend }: { point: { d: string; x: number; y: number }; bht: number | null; prices: [string, number | null | undefined][]; trend?: string | null }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    setPos(placePopover({ x: point.x, y: point.y }, { w: el?.offsetWidth ?? 230, h: el?.offsetHeight ?? 0 }, { w: window.innerWidth, h: window.innerHeight }));
  }, [point.x, point.y, point.d]);
  if (typeof document === 'undefined') return null;
  const band = bht != null ? bhtBand(bht) : null;
  return createPortal(
    <div ref={ref} className="fixed z-[10000] pointer-events-none w-max max-w-[260px] px-2.5 py-2 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl text-[11px] leading-snug text-slate-300"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
      <div className="font-bold"><span className="text-sky-300">{point.d}</span>{bht != null && <> <span className="text-slate-100">· BHT</span> <span className="font-mono" style={{ color: capeScoreColor(bht) }}>{bht.toFixed(1)}</span></>}</div>
      {band && <div className="font-semibold" style={{ color: band.color }}>{ti(`bht.b${BHT_BANDS.indexOf(band)}.label`)}</div>}
      {trend && <div className="mt-0.5"><TrendBadge trend={{ regime: trend }} size="xs" /></div>}
      <div className="mt-1 font-mono space-y-px">
        {prices.filter(([, v]) => v != null).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><span className="text-slate-400">{k}</span><span className="text-slate-100">{Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        ))}
      </div>
      <div className="mt-1 pt-1 border-t border-slate-800 text-[10px] text-slate-500">{loc === 'es' ? 'Clic: ver detalle · ← → día a día' : 'Click: details · ← → day by day'}</div>
    </div>,
    document.body,
  );
}

/** Fecha del encabezado del popover: día de la semana, día, mes y año (p. ej. «jue 21 abr 2022»). */
const fmtDay = (d: string, loc: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function BhtDetailPopover({ hover, detail: detailIn, onLeave, onHold, liveValue, onClose, nav }: { hover: { d: string; x: number; y: number }; detail: any; forward?: any; onLeave?: () => void; onHold?: () => void; liveValue?: number | null; onClose?: () => void; nav?: BhtPinNav | null }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const missing = !!detailIn?.missing;
  const detail = missing ? null : detailIn;
  const popRef = useRef<HTMLDivElement>(null);
  // La vista va atada a la fecha: cada fecha nueva abre en Estrategia (vista por defecto); Historia y Drawdowns se
  // calculan solo si se piden.
  // Fijado (con ✕), la vista elegida se conserva al cambiar de fecha con clic o con ← →.
  const [viewFor, setViewFor] = useState<{ d: string; v: PopView }>({ d: hover.d, v: 'strategy' });
  const view = onClose || viewFor.d === hover.d ? viewFor.v : 'strategy';
  const setView = (v: PopView) => setViewFor({ d: hover.d, v });
  const hist = useThermoPartsMonthly(view === 'history', hover.d);
  // Posición fija a un lado del cursor (no tapa el crosshair), medida con el tamaño real y dentro de la pantalla.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = popRef.current;
    // Fijado: anclado al borde opuesto al punto (estable con ← →); en hover, junto al cursor.
    setPos((onClose ? placePinned : placePopover)({ x: hover.x, y: hover.y }, { w: el?.offsetWidth ?? 720, h: el?.offsetHeight ?? 0 }, { w: window.innerWidth, h: window.innerHeight }));
  }, [hover.x, hover.y, detail, hist.data, onClose]);
  // Si el contenido crece (p. ej. al abrir Estrategia) y se sale por abajo, se sube lo justo; no se mueve en horizontal.
  useEffect(() => {
    const el = popRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom > vh - 8) setPos((p) => (p ? { ...p, top: Math.max(8, vh - 8 - r.height) } : p));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bd = detail != null ? bhtBand(Number(detail.value)) : null;
  const headV = liveValue ?? (detail != null ? Number(detail.value) : null);
  const loadMsg = missing ? ti('detailMissing') : liveValue != null ? ti('detailComputing') : ti('detailLoading');
  const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`;
  // Portal al body: un ancestro con transform/backdrop-filter haría que `fixed` se midiera desde él y no desde la pantalla.
  if (typeof document === 'undefined') return null;
  return createPortal(
    // pr-6: la barra de desplazamiento (flotante en macOS) se dibuja encima del contenido; con el margen normal (12 px)
    // tapaba la última columna de las tablas. scrollbar-gutter reserva su espacio cuando la barra no es flotante.
    <div ref={popRef} data-bht-pop className="fixed z-[9999] w-[740px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] p-3 pr-6 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-snug text-slate-200  text-left" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }} onMouseEnter={() => onHold?.()} onMouseLeave={onLeave}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
      <div className="min-w-0">
        {/* Fecha destacada y, si la gráfica lo permite, navegación: ‹ calendario › (día a día o salto a una fecha). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[17px] leading-6 font-bold tracking-tight text-sky-300" title={hover.d}>{fmtDay(hover.d, loc)}</span>
          {nav && (
            <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/60 text-slate-300" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => nav.step(-1)} aria-label={loc === 'es' ? 'Día anterior' : 'Previous day'} title={loc === 'es' ? 'Día anterior (←)' : 'Previous day (←)'}
                className="px-1.5 leading-6 rounded-l-lg hover:bg-slate-700 hover:text-white">‹</button>
              <input type="date" value={hover.d} min={nav.bounds()?.[0]} max={nav.bounds()?.[1]} aria-label={loc === 'es' ? 'Ir a una fecha' : 'Go to a date'}
                onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) nav.goTo(e.target.value); }}
                className="bg-transparent font-mono text-[11px] text-slate-200 px-1 py-0.5 border-x border-slate-700 [color-scheme:dark] outline-none" />
              <button type="button" onClick={() => nav.step(1)} aria-label={loc === 'es' ? 'Día siguiente' : 'Next day'} title={loc === 'es' ? 'Día siguiente (→)' : 'Next day (→)'}
                className="px-1.5 leading-6 rounded-r-lg hover:bg-slate-700 hover:text-white">›</button>
            </div>
          )}
          <span className="font-bold"><span className="text-slate-100">BHT</span> {headV != null && <span className="font-mono" style={{ color: capeScoreColor(headV) }}>{headV.toFixed(1)}/100</span>}</span>
          {liveValue != null && <span className="text-[10px] px-1.5 py-px rounded-full bg-accent-500/20 text-accent-300 font-bold" title={ti('liveTitle')}>{ti('live')}</span>}
          {detail?.trend && <TrendBadge trend={detail.trend} size="xs" />}
        </div>
        {/* Feriado: el mercado no abrió; el detalle es el del último cierre. */}
        {detail?.asOf && <div className="text-[11px] text-caution-300 mt-0.5">{ti('detailMarketClosed', { day: fmtDay(detail.asOf, loc) })}</div>}
        {/* Cotizaciones del día: precio, cambio diario (verde/rojo) y % desde el máximo (semáforo; máximo de 5 años si el ATH es más viejo). */}
        {detail?.prices && (() => {
          const q = detail.quotes as Record<string, null | { price: number; change: number | null; fromHigh: number | null; high: number | null; highDate: string | null; window5y: boolean }> | null | undefined;
          const fmtP = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
          const rows = ([['S&P 500', 'spx'], ['QQQ', 'qqq'], ['TQQQ', 'tqqq']] as const)
            .map(([k, id]) => ({ k, price: q?.[id]?.price ?? (detail.prices[id] != null ? Number(detail.prices[id]) : null), qt: q?.[id] ?? null }))
            .filter((r) => r.price != null);
          const anyHigh5y = rows.some((r) => r.qt?.window5y);
          return (
            <table className="mt-1.5 font-mono text-[11px] leading-5 border-collapse">
              <thead>
                <tr className="text-[9px] uppercase tracking-wide text-slate-500">
                  <th className="text-left font-normal pr-4"></th>
                  <th className="text-right font-normal pr-4">{loc === 'es' ? 'Precio' : 'Price'}</th>
                  <th className="text-right font-normal pr-4">{loc === 'es' ? 'Día' : 'Day'}</th>
                  <th className="text-right font-normal" title={loc === 'es' ? 'Caída desde el máximo histórico; si ocurrió hace más de 5 años, desde el máximo de 5 años' : 'Drop from the all-time high; if older than 5 years, from the 5-year high'}>
                    {loc === 'es' ? 'Desde máx.' : 'From high'}{anyHigh5y ? '*' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ k, price, qt }) => (
                  <tr key={k}>
                    <td className="pr-4 text-[10px] uppercase tracking-wide text-slate-400 whitespace-nowrap">{k}</td>
                    <td className="pr-4 text-right text-[12px] font-semibold text-slate-100">{fmtP(price!)}</td>
                    <td className="pr-4 text-right font-semibold" style={{ color: qt?.change == null ? undefined : qt.change > 0 ? TOKENS.favorable : qt.change < 0 ? TOKENS.risk : undefined }}>
                      {qt?.change == null ? '—' : pct(qt.change)}</td>
                    <td className="text-right font-semibold" style={qt?.fromHigh != null ? { color: athColor(athTone(qt.fromHigh)) } : undefined}
                      title={qt?.high != null ? `${loc === 'es' ? 'Máximo' : 'High'}${qt.window5y ? ' 5Y' : ''}: ${fmtP(qt.high)} (${qt.highDate})` : undefined}>
                      {qt?.fromHigh == null ? '—' : `${pct(qt.fromHigh)}${qt.window5y ? '*' : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
      {/* Interruptor Historia / Estrategia en la esquina: siempre en el mismo lugar y fácil de alcanzar. */}
      <div className="shrink-0 inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 text-[11px] font-bold">
        <button type="button" onClick={(e) => { e.stopPropagation(); setView('strategy'); }}
          className={`px-2 py-0.5 rounded-md transition ${view === 'strategy' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
          style={view === 'strategy' && bd ? { backgroundColor: bd.color } : undefined}>{ti('strategyButton')} ▸</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setView('history'); }}
          className={`px-2 py-0.5 rounded-md transition ${view === 'history' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{loc === 'es' ? 'Historia' : 'History'}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setView('drawdowns'); }}
          className={`px-2 py-0.5 rounded-md transition ${view === 'drawdowns' ? 'bg-risk-500/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Drawdowns</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setView('tranches'); }}
          className={`px-2 py-0.5 rounded-md transition ${view === 'tranches' ? 'bg-purple-500/80 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Tranches</button>
      </div>
      {onClose && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label={loc === 'es' ? 'Cerrar' : 'Close'} title={loc === 'es' ? 'Cerrar (Esc)' : 'Close (Esc)'}
          className="shrink-0 -mr-1 px-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 text-sm leading-6">✕</button>
      )}
      </div>
      {detail == null ? <div className="text-slate-500 font-mono">{loadMsg}</div> : (
        <>
          {/* Componentes en cuadrícula compacta: nombre corto · valor · puntaje · aporte (nombre largo en el tooltip). */}
          <div className="grid grid-cols-3 gap-x-4 font-mono text-[11px]">
            {[0, 1, 2].map((c) => (
              <div key={`h${c}`} className="flex gap-1.5 text-[9px] text-slate-500 uppercase tracking-wide pb-0.5 border-b border-slate-700/70">
                <span className="w-11">Ind</span><span className="flex-1 text-right">{ti('colValue')}</span><span className="w-6 text-right">Pts</span><span className="w-8 text-right">{ti('colContributionShort')}</span>
              </div>
            ))}
            {detail.parts.map((p: any) => {
              const dec = p.key === 'RATIO' ? 3 : p.key === 'FG' ? 0 : p.key === 'MS' ? 1 : 2;
              return (
                <div key={p.key} className="flex gap-1.5 py-[1px] border-b border-slate-800/60" title={partLabel(p.key, loc)}>
                  <span className="w-11 text-slate-400">{PART_SHORT[p.key] ?? p.key}</span>
                  <span className="flex-1 text-right text-slate-200">{Number(p.value).toFixed(dec)}</span>
                  <span className="w-6 text-right font-bold" style={{ color: capeScoreColor(p.score) }}>{Math.round(p.score)}</span>
                  <span className="w-8 text-right text-sky-300/80">{Number(p.aporte).toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-slate-400 space-y-0.5">
            {(detail.bonus ?? 0) > 0 && (
              <div><span className="text-elevated-300">{ti('hyBonusDetail', { label: detail.bonusLabel ?? '', n: Number(detail.bonus).toFixed(0) })}</span>
                {detail.bonusHy != null && <> · <span title={loc === 'es' ? 'Serie de crédito del modelo: 1.913 × spread Baa − Tesoro 10A (FRED BAA10Y), la misma con la que se calibró la historia. El HY OAS real de ICE solo tiene 3 años en FRED y se muestra como referencia.' : 'Model credit series: 1.913 × Baa − 10Y Treasury spread (FRED BAA10Y), the same one the history was calibrated on. The real ICE HY OAS has only 3 years on FRED and is shown for reference.'}>HY {Number(detail.bonusHy).toFixed(2)} <span className="text-slate-500">(Baa×1.91)</span></span>{detail.hyReal != null && <span className="text-slate-500"> · {loc === 'es' ? 'HY real' : 'real HY'} {Number(detail.hyReal).toFixed(2)}</span>}{detail.bonusD1 != null && <> · Δ1M {Number(detail.bonusD1) >= 0 ? '+' : ''}{Number(detail.bonusD1).toFixed(2)} ({ti('triggerShort')} ≥ +1.00)</>}{detail.bonusZ != null && <> · z {Number(detail.bonusZ) >= 0 ? '+' : ''}{Number(detail.bonusZ).toFixed(1)}σ ({ti('triggerShort')} z&gt;1.5, HY&gt;5)</>}</>}
              </div>
            )}
            {(detail.liqBonus ?? 0) !== 0 && <div className={Number(detail.liqBonus) > 0 ? 'text-elevated-300' : 'text-favorable-300'}>{ti('liqBonusRow', { label: detail.liqBonusLabel ?? '' })}: {sign(Number(detail.liqBonus))}</div>}
            {(detail.oilBonus ?? 0) !== 0 && <div className={Number(detail.oilBonus) > 0 ? 'text-elevated-300' : 'text-favorable-300'}>{ti('oilBonusRow', { label: detail.oilBonusLabel ?? '' })}: {sign(Number(detail.oilBonus))}{detail.oilRatio != null && <> · ×{Number(detail.oilRatio).toFixed(2)} SMA36M</>}</div>}
            <div>Σ {Number(detail.numerator).toFixed(1)} ÷ {detail.denominator}{(detail.bonus ?? 0) > 0 ? ` + ${Number(detail.bonus).toFixed(0)}` : ''}{(detail.liqBonus ?? 0) !== 0 ? ` ${sign(Number(detail.liqBonus))}` : ''}{(detail.oilBonus ?? 0) !== 0 ? ` ${sign(Number(detail.oilBonus))}` : ''} = <span className="text-slate-100 font-bold">{Number(detail.value).toFixed(1)}</span> · {detail.coverage}/13</div>
          </div>
        </>
      )}
      {view === 'tranches' ? (
        <BhtTranchesView date={hover.d} locale={loc} />
      ) : view === 'drawdowns' ? (
        <BhtDrawdownsView date={hover.d} locale={loc} />
      ) : view === 'strategy' ? (
        <BhtStrategyView date={hover.d} locale={loc}
          adviceLabel={bd ? ti('strategyBand', { label: ti(`bht.b${BHT_BANDS.indexOf(bd)}.label`) }) : undefined}
          adviceText={bd ? ti(`bht.b${BHT_BANDS.indexOf(bd)}.advice`) : undefined} />
      ) : (
        <div className="mt-2 pt-1.5 border-t border-slate-800">
          <div className="text-[11px] font-semibold text-slate-100 mb-1">{ti('bhtPopHistoryTitle', { date: hover.d })}</div>
          <OrbHistoryTable rows={bhtHistoryRows(hist.data)} loading={hist.isLoading} valueHeader="BHT" dec={1} showValue={false} compact />
        </div>
      )}
    </div>,
    document.body,
  );
}
