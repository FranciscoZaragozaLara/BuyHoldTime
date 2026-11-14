'use client';
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { bhtHistoryRows } from '@/lib/orbHistory';
import { BHT_BANDS, bhtBand, capeScoreColor } from './bhtBands';
import { partLabel } from '@/lib/thermoScoring';
import { useThermoPartsMonthly } from './useThermoLive';
import { OrbHistoryTable } from './ThermoOrbs';

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
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const setHoverLive = useCallback((v: BhtHoverState | ((s: BhtHoverState) => BhtHoverState)) => { if (v != null) cancelClear(); setHover(v); }, [cancelClear]);
  const load = (d: string) => {
    if (cache[d]) return;
    fetch(`${getApiBase()}/api/backtesting/bht-forward/detail?date=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) setCache((m) => ({ ...m, [d]: j })); })
      .catch(() => {});
  };
  return { hover, setHover: setHoverLive, cache, load, scheduleClear, cancelClear };
}

// Al salir el mouse hacia el popup no se cierra (permite pulsar Estrategia);
// al salir fuera, cierre diferido.
export const bhtLeaveGuard = (e: any, det: { scheduleClear: () => void; cancelClear: () => void }) => {
  if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('[data-bht-pop]')) det.cancelClear();
  else det.scheduleClear();
};

const PART_SHORT: Record<string, string> = { RATIO: 'Ratio' };

export function BhtDetailPopover({ hover, detail, onLeave, onHold, liveValue }: { hover: { d: string; x: number; y: number }; detail: any; forward?: any; onLeave: () => void; onHold?: () => void; liveValue?: number | null }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const popRef = useRef<HTMLDivElement>(null);
  const hist = useThermoPartsMonthly(true, hover.d);
  // Posición fija junto al cursor, medida con la altura real: abajo-derecha; si no cabe, arriba; si tampoco, se recorre.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = popRef.current?.offsetWidth ?? 720, h = Math.min(popRef.current?.offsetHeight ?? 0, vh - 16);
    const left = Math.min(Math.max(8, hover.x + 12), vw - w - 8);
    let top = hover.y + 16;
    if (top + h > vh - 8) top = hover.y - 16 - h >= 8 ? hover.y - 16 - h : Math.max(8, vh - 8 - h);
    setPos({ left, top });
  }, [hover.x, hover.y, detail, hist.data]);
  const bd = detail != null ? bhtBand(Number(detail.value)) : null;
  const headV = liveValue ?? (detail != null ? Number(detail.value) : null);
  const loadMsg = liveValue != null ? ti('detailComputing') : ti('detailLoading');
  const [showStrat, setShowStrat] = useState(false);
  useEffect(() => { setShowStrat(false); }, [hover.d]);
  const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`;
  return (
    <div ref={popRef} data-bht-pop className="fixed z-[9999] w-[720px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-snug text-slate-200 text-left pointer-events-none" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }} onMouseEnter={() => onHold?.()} onMouseLeave={onLeave}>
      <div className="font-bold mb-1.5"><span className="text-sky-300">{hover.d}</span> <span className="text-slate-100">· BHT</span> {headV != null && <span className="font-mono" style={{ color: capeScoreColor(headV) }}>{headV.toFixed(1)}/100</span>}{liveValue != null && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-accent-500/20 text-accent-300 font-bold" title={ti('liveTitle')}>{ti('live')}</span>}{bd && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowStrat((v) => !v); }}
          className="ml-2 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900 align-middle cursor-pointer pointer-events-auto"
          style={{ backgroundColor: bd.color }}>{ti('strategyButton')} {showStrat ? '▾' : '▸'}</button>
      )}</div>
      {showStrat && bd && (
        <div className="mt-1 mb-1.5 p-2 rounded-lg border" style={{ borderColor: `${bd.color}66`, backgroundColor: `${bd.color}14` }}>
          <div className="font-bold mb-0.5" style={{ color: bd.color }}>{ti('strategyBand', { label: ti(`bht.b${BHT_BANDS.indexOf(bd)}.label`) })}</div>
          <div className="text-slate-200 font-normal leading-snug">{ti(`bht.b${BHT_BANDS.indexOf(bd)}.advice`)}</div>
        </div>
      )}
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
                {detail.bonusHy != null && <> · HY {Number(detail.bonusHy).toFixed(2)}{detail.bonusD1 != null && <> · Δ1M {Number(detail.bonusD1) >= 0 ? '+' : ''}{Number(detail.bonusD1).toFixed(2)} ({ti('triggerShort')} ≥ +1.00)</>}{detail.bonusZ != null && <> · z {Number(detail.bonusZ) >= 0 ? '+' : ''}{Number(detail.bonusZ).toFixed(1)}σ ({ti('triggerShort')} z&gt;1.5, HY&gt;5)</>}</>}
              </div>
            )}
            {(detail.liqBonus ?? 0) !== 0 && <div className={Number(detail.liqBonus) > 0 ? 'text-elevated-300' : 'text-favorable-300'}>{ti('liqBonusRow', { label: detail.liqBonusLabel ?? '' })}: {sign(Number(detail.liqBonus))}</div>}
            {(detail.oilBonus ?? 0) !== 0 && <div className={Number(detail.oilBonus) > 0 ? 'text-elevated-300' : 'text-favorable-300'}>{ti('oilBonusRow', { label: detail.oilBonusLabel ?? '' })}: {sign(Number(detail.oilBonus))}{detail.oilRatio != null && <> · ×{Number(detail.oilRatio).toFixed(2)} SMA36M</>}</div>}
            <div>Σ {Number(detail.numerator).toFixed(1)} ÷ {detail.denominator}{(detail.bonus ?? 0) > 0 ? ` + ${Number(detail.bonus).toFixed(0)}` : ''}{(detail.liqBonus ?? 0) !== 0 ? ` ${sign(Number(detail.liqBonus))}` : ''}{(detail.oilBonus ?? 0) !== 0 ? ` ${sign(Number(detail.oilBonus))}` : ''} = <span className="text-slate-100 font-bold">{Number(detail.value).toFixed(1)}</span> · {detail.coverage}/13</div>
          </div>
        </>
      )}
      <div className="mt-2 pt-1.5 border-t border-slate-800">
        <div className="text-[11px] font-semibold text-slate-100 mb-1">{ti('bhtPopHistoryTitle', { date: hover.d })}</div>
        <OrbHistoryTable rows={bhtHistoryRows(hist.data)} loading={hist.isLoading} valueHeader="BHT" dec={1} showValue={false} compact />
      </div>
    </div>
  );
}
