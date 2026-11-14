'use client';
import { useLayoutEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { levelLabel } from '@/lib/levelLabels';
import { bhtHistoryRows, monthLabel, orbHistoryRows, shortDate, ORB_PART_KEY, type OrbHistoryRow } from '@/lib/orbHistory';
import { capeScoreColor } from './bhtBands';
import { type MomBlend, trendTag } from '@/lib/thermoScoring';
import { useThermoPartsMonthly } from './useThermoLive';

// Orbes de puntaje del termómetro y tabla de historia mensual (12 meses + hace 2 y 3 años).
// Tabla de historia (12 meses + hace 2 y 3 años) con rendimiento a hoy y pico; la usan los orbes y el detalle del BHT.
export function OrbHistoryTable({ rows: histRows, loading, valueHeader, dec = 2, showValue = true, compact = false }: { rows: OrbHistoryRow[]; loading: boolean; valueHeader: string; dec?: number; showValue?: boolean; compact?: boolean }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  return (
    <>
              {loading ? <div className="text-[10px] text-slate-500 font-mono">{ti('historyLoading')}</div>
                : histRows.length === 0 ? <div className="text-[10px] text-slate-500 font-mono">{ti('historyEmpty')}</div>
                : (
                  <table className="w-full text-[10px] font-mono tabular-nums">
                    <thead>
                      <tr className="text-slate-500">
                        <th colSpan={showValue ? 3 : 2} />
                        <th colSpan={3} className="text-center font-normal pb-0.5 border-b border-slate-700/70">{ti('historyPerfToday')}</th>
                        <th className="w-3" />
                        <th colSpan={3} className="text-center font-normal pb-0.5 border-b border-slate-700/70">{ti('historyPeak')}</th>
                      </tr>
                      <tr className="text-slate-500">
                        <th className="text-left font-normal py-0.5">{ti('historyMonth')}</th>
                        {showValue && <th className="text-right font-normal">{valueHeader}</th>}
                        <th className="text-right font-normal pr-2">{ti('historyScore')}</th>
                        <th className="text-right font-normal text-sky-300/80">S&amp;P 500</th>
                        <th className="text-right font-normal text-violet-300/80">Nasdaq</th>
                        <th className="text-right font-normal text-pink-300/80">TQQQ</th>
                        <th />
                        <th className="text-right font-normal text-sky-300/80">S&amp;P 500</th>
                        <th className="text-right font-normal text-violet-300/80">Nasdaq</th>
                        <th className="text-right font-normal text-pink-300/80">TQQQ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histRows.map((r, i) => {
                        const first = r.yearsAgo != null && (i === 0 || histRows[i - 1].yearsAgo == null);
                        const pk = (v: { pct: number; date: string } | null) => (
                          <td className="text-right align-top py-0.5 whitespace-nowrap">
                            {v == null ? <span className="text-slate-600">—</span> : compact ? <>
                              <span className="text-favorable-300">+{v.pct.toFixed(1)}%</span> <span className="text-[9px] text-slate-500">{shortDate(v.date, loc)}</span>
                            </> : <>
                              <div className="text-favorable-300">+{v.pct.toFixed(1)}%</div>
                              <div className="text-[9px] text-slate-500">{shortDate(v.date, loc)}</div>
                            </>}
                          </td>
                        );
                        const pc = (v: number | null) => <td className={`text-right ${v == null ? 'text-slate-600' : v >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}</td>;
                        return (
                          <tr key={r.month} className={`text-slate-300 ${first ? 'border-t border-slate-600' : ''} ${i === 0 ? 'bg-slate-700/40' : ''}`} title={r.date}>
                            <td className="py-0.5 whitespace-nowrap capitalize">{monthLabel(r.month, loc)}{r.yearsAgo != null && <span className="text-slate-500 normal-case"> · {ti('historyYearsAgo', { n: r.yearsAgo })}</span>}</td>
                            {showValue && <td className="text-right">{r.value != null ? r.value.toFixed(dec) : '—'}</td>}
                            <td className="text-right font-bold pr-2" style={{ color: r.score != null ? capeScoreColor(r.score) : undefined }}>{r.score != null ? Math.round(r.score) : '—'}</td>
                            {pc(r.perf.spx)}{pc(r.perf.ndx)}{pc(r.perf.tqqq)}
                            <td />
                            {pk(r.peak.spx)}{pk(r.peak.ndx)}{pk(r.peak.tqqq)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
    </>
  );
}

// Historia del BHT Index arriba del detalle del cálculo (mismas columnas que el popover de los orbes).
export function BhtHistoryBlock() {
  const ti = useTranslations('Backtesting.indicators');
  const hist = useThermoPartsMonthly(true);
  return (
    <div className="mt-2 rounded-lg border border-slate-800 p-3 overflow-x-auto">
      <div className="text-xs font-semibold text-slate-100 mb-1.5">{ti('bhtHistoryTitle')}</div>
      <OrbHistoryTable rows={bhtHistoryRows(hist.data)} loading={hist.isLoading} valueHeader="BHT" dec={1} showValue={false} />
      <div className="text-[9px] text-slate-500 mt-1.5">{ti('bhtHistoryNote')}</div>
    </div>
  );
}

// Orbe de cristal genérico con puntaje; click/hover muestra valor actual + tabla de ponderación.
export function ScoreOrb({ name, value, dec = 2, weight, score, bands, blend = null, small = false }: { name: string; value: number; dec?: number; weight: number; score: number; bands: [number, number, string, string, string][]; blend?: MomBlend; small?: boolean }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const c = capeScoreColor(score);
  const hasHistory = name in ORB_PART_KEY;
  const popRef = useRef<HTMLDivElement>(null);
  // Popover en posición fija, acotado a la pantalla (con historia es muy ancho y alto).
  // Horizontal: alineado al borde derecho del orbe. Vertical: abajo si cabe, arriba si cabe;
  // si no cabe en ninguno, se recorre para entrar completo (puede tapar el orbe).
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(vw * 0.96, hasHistory ? 1120 : 288);
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const h = Math.min(popRef.current?.scrollHeight ?? 0, vh - 16);
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = r.top - 6 - h >= 8 ? r.top - 6 - h : Math.max(8, vh - 8 - h);
    setPos({ left, top, maxH: vh - 16 });
  };
  const show = () => { setOpen(true); place(); };
  // Historia: una sola petición compartida por todos los orbes, al abrir el primero.
  const hist = useThermoPartsMonthly(open && hasHistory);
  const histRows = orbHistoryRows(hist.data, name);
  // Al abrir (o al llegar la historia) se mide la altura real y se recoloca.
  useLayoutEffect(() => { if (open) place(); }, [open, hist.data, hist.isLoading]);
  return (
    <span className="relative inline-flex" onMouseLeave={() => setOpen(false)}>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : show())} onMouseEnter={() => { if (!open) show(); }} title={ti('orbTitle', { name, score })}
        className={`relative rounded-full cursor-pointer shrink-0 ${small ? 'w-7 h-7' : 'w-11 h-11'}`}
        style={{ background: `radial-gradient(circle at 30% 18%, rgba(255,255,255,.55), rgba(255,255,255,.08) 30%, transparent 48%), linear-gradient(145deg, ${c}dd, ${c}55)`, boxShadow: `0 0 14px ${c}77, inset 0 0 8px rgba(255,255,255,.3)`, border: `1px solid ${c}` }}>
        <span className={`absolute inset-0 flex items-center justify-center font-mono font-extrabold text-slate-950 ${small ? 'text-[10px]' : 'text-[13px]'}`} style={{ textShadow: '0 0 4px rgba(255,255,255,.95), 0 0 2px rgba(255,255,255,.9), 0 1px 1px rgba(255,255,255,.6)' }}>{score}</span>
      </button>
      {open && (
        <div ref={popRef} style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxH } : { visibility: 'hidden' }} className={`fixed z-50 overflow-y-auto p-3 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl text-left normal-case flex flex-col md:flex-row gap-4 ${hasHistory ? 'w-[min(96vw,1120px)]' : 'w-72'}`}>
          <div className="w-full md:w-64 shrink-0">
          <div className="text-xs font-semibold text-slate-100">{ti('orbRisk', { name })} <span className="font-mono" style={{ color: c }}>{score}/100</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{name} {value.toFixed(dec)} → <span className="text-sky-300 font-semibold">{score}/100</span> · {ti('orbWeight', { weight })}</div>
          {blend && (
            <div className="mt-1.5 rounded-lg bg-slate-900/70 border border-slate-700/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
              <div className="text-slate-300">{ti('colLevel')} {blend.level.toFixed(2)} → {blend.levelScore.toFixed(1)} <span className="text-slate-500">×0.4</span></div>
              <div className="text-slate-300">Δ {blend.delta>=0?'+':''}{blend.delta.toFixed(2)}pp vs {blend.maLabel} {blend.ma.toFixed(2)} → {blend.trendScore.toFixed(1)} <span className="text-slate-500">×0.6</span>{(()=>{ const t = trendTag(blend.delta); return <span className="font-bold"> · <span style={{ color: t.color }}>{t.text}</span></span>; })()}</div>
              <div className="text-slate-100">= <span className="font-bold" style={{ color: capeScoreColor(score) }}>{score}</span> <span className="text-slate-500">{ti('trendWeighs')}</span></div>
            </div>
          )}
          <table className="w-full mt-2 text-[10px] font-mono">
            <thead><tr className="text-slate-500"><th className="text-left font-normal py-0.5">{name}</th><th className="text-right font-normal">Pts</th><th className="text-right font-normal">{ti('colLevel')}</th></tr></thead>
            <tbody>
              {bands.map(([lo, hi, disp, pts, lvl]) => {
                const on = value >= lo && value < hi;
                return <tr key={disp} className={on ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400'}><td className="py-0.5">{disp}</td><td className="text-right">{pts}</td><td className="text-right">{levelLabel(lvl, loc)}</td></tr>;
              })}
            </tbody>
          </table>
          </div>
          {hasHistory && (
            <div className="flex-1 min-w-0 md:border-l md:border-slate-700/70 md:pl-4 border-t md:border-t-0 border-slate-700/70 pt-2 md:pt-0">
              <div className="text-xs font-semibold text-slate-100 mb-1.5">{ti('historyTitle')}</div>
              <OrbHistoryTable rows={histRows} loading={hist.isLoading} valueHeader={name} dec={dec} />
              <div className="text-[9px] text-slate-500 mt-1.5">{ti('historyNote')}</div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
