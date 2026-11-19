'use client';
// Vista "Estrategia" del popover del BHT. Se carga con next/dynamic (su código se descarga solo al pulsar
// el botón) y pide el cálculo al backend bajo demanda; los resultados quedan en memoria por (fecha, instrumento).
import { useEffect, useState } from 'react';
import type React from 'react';
import { getApiBase } from '@/lib/apiBase';
import { bhtBand, capeScoreColor } from './bhtBands';
import { fmtPct, opportunityMessage } from '@/lib/bhtOpportunity';
import { trendAdvice, type AdviceTone } from '@/lib/bhtTrendAdvice';
import { toTrendRegime, TREND_META, TREND_ORDER, trendText } from '@/lib/trendRegime';
import { BHT_BANDS } from './bhtBands';
import { TOKENS } from '@/lib/designTokens';
import { TrendBadge } from './TrendBadge';

type Instrument = 'spx' | 'qqq' | 'tqqq';
type Win = 'all' | '5y';
type Result = {
  date: string; bht: number; range: [number, number];
  frequency: { all: { count: number; total: number; pct: number }; last5y: { count: number; total: number; pct: number } };
  percentile?: { all: number; last5y: number };
  trend?: string | null;
  matrix?: { cells: Array<{ band: number; regime: string; n: number; avg12m: number | null; pos12m: number | null; avgMdd: number | null; pDd15: number | null }>; current: { band: number; regime: string | null } };
  base: { price: number | null; today: string; todayPrice: number | null };
  perf: Array<{ years: number; n: number; avgPct: number | null; medianPct: number | null; positivePct: number | null; nominal: number | null; targetDate: string; cagrPct?: number | null }>;
  sinceDate?: Record<Instrument, {
    buyPrice: number | null; lastPrice: number | null; lastDate: string | null; years: number | null; totalPct: number | null; cagrPct: number | null;
    peak?: { price: number; date: string; bht: number | null; years: number; totalPct: number; cagrPct: number | null } | null;
  }>;
  peak: { n: number; avgPct: number | null; avgDays: number | null; nominal: number | null; date: string | null };
};

const cache = new Map<string, Promise<Result | null>>();
function fetchStrategy(date: string, inst: Instrument, win: Win) {
  const key = `${date}:${inst}:${win}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`${getApiBase()}/api/backtesting/bht-strategy?date=${date}&instrument=${inst}&window=${win}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j && !j.error ? (j as Result) : null))
      .catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key)!;
}

const INST: Record<Instrument, string> = { spx: 'S&P 500', qqq: 'QQQ (Nasdaq-100)', tqqq: 'TQQQ' };
const money = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pctTxt = (v: number | null, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
const pctCls = (v: number | null) => (v == null ? 'text-slate-500' : v >= 0 ? 'text-favorable-300' : 'text-risk-300');

const T = {
  es: {
    advice: 'Estrategia para la banda', range: 'BHT del día', rangeOf: 'rango', freq: 'Frecuencia del rango', hist: 'histórica', last5: 'últimos 5 años', days: 'días',
    perfTitle: 'Rendimiento promedio de los días en este rango', horizon: 'Plazo', avg: 'Prom.', med: 'Mediana', pos: '% positivos', nominal: 'Precio esperado', target: 'Fecha', n: 'n',
    peak: 'Pico máx. (5a)', peakIn: 'en ~', peak5: 'Pico máx. (a hoy)', peak5Note: 'Pico desde cada día hasta hoy (ningún día de los últimos 5 años tiene 5 años completos).',
    winAll: 'Toda la historia', win5: 'Últimos 5 años', winTitle: 'Días del rango que entran a los promedios', peakNote: 'Pico dentro de 5 años; fecha = día + tiempo promedio al pico.', loading: 'Calculando…', error: 'No se pudo calcular.',
    note: 'Promedios de días históricos (se traslapan; n = días con dato). No es una recomendación de inversión.',
    mxHere: 'Estás aquí', mxTitle: 'BHT × tendencia', mxShow: 'Ver matriz BHT × tendencia', mxHide: 'Ocultar matriz', mxCell: 'Esta combinación', mxRet: 'rend. 12m', mxPos: 'positivo', mxDd: 'caída máx. prom.', mxP15: 'prob. caer >15%', mxDays: 'días', mxNote: 'Cada celda: rendimiento promedio a 12 meses y, debajo, caída máxima promedio y probabilidad de caer más de 15% en esos 12 meses. Celdas con pocos días se ven tenues.', mxBand: 'Banda BHT',
    pctl: 'percentil', cagr: 'CAGR', cagrTitle: 'Rendimiento anual compuesto equivalente al promedio del plazo',
    since: 'Comprando en esta fecha y manteniendo hasta hoy', atPeak: 'Comprando en esta fecha y vendiendo en el pico máximo', peakCol: 'Pico', dateCol: 'Fecha', noPeak: 'no superó la compra', buy: 'Compra', last: 'Último', total: 'Total', yrs: 'Años', short: '< 1 año', sinceNote: 'CAGR solo con al menos 1 año de tenencia.',
    base: 'Compra', y: 'a', d: 'd',
  },
  en: {
    advice: 'Strategy for the band', range: 'BHT of the day', rangeOf: 'range', freq: 'Range frequency', hist: 'all history', last5: 'last 5 years', days: 'days',
    perfTitle: 'Average performance of days in this range', horizon: 'Horizon', avg: 'Avg', med: 'Median', pos: '% positive', nominal: 'Expected price', target: 'Date', n: 'n',
    peak: 'Max peak (5y)', peakIn: 'in ~', peak5: 'Max peak (to today)', peak5Note: 'Peak from each day until today (no day in the last 5 years has a full 5-year window).',
    winAll: 'All history', win5: 'Last 5 years', winTitle: 'Range days included in the averages', peakNote: 'Peak within 5 years; date = day + average time to peak.', loading: 'Computing…', error: 'Could not compute.',
    note: 'Averages of historical days (overlapping; n = days with data). Not investment advice.',
    mxHere: 'You are here', mxTitle: 'BHT × trend', mxShow: 'Show BHT × trend matrix', mxHide: 'Hide matrix', mxCell: 'This combination', mxRet: '12m return', mxPos: 'positive', mxDd: 'avg max drawdown', mxP15: 'prob. of falling >15%', mxDays: 'days', mxNote: 'Each cell: average 12-month return and, below, average max drawdown and probability of falling more than 15% within those 12 months. Cells with few days are dimmed.', mxBand: 'BHT band',
    pctl: 'percentile', cagr: 'CAGR', cagrTitle: 'Compound annual rate equivalent to the horizon average',
    since: 'Buying on this date and holding until today', atPeak: 'Buying on this date and selling at the maximum peak', peakCol: 'Peak', dateCol: 'Date', noPeak: 'never above the buy price', buy: 'Buy', last: 'Last', total: 'Total', yrs: 'Years', short: '< 1 year', sinceNote: 'CAGR only with at least 1 year held.',
    base: 'Buy', y: 'y', d: 'd',
  },
};

const dur = (days: number | null, t: (typeof T)['es']) => (days == null ? '—' : days >= 365 ? `${(days / 365).toFixed(1)}${t.y}` : `${Math.round(days)}${t.d}`);

export default function BhtStrategyView({ date, locale, adviceLabel, adviceText }: { date: string; locale: string; adviceLabel?: string; adviceText?: string }) {
  const t = T[locale === 'es' ? 'es' : 'en'];
  const [inst, setInst] = useState<Instrument>('spx');
  // Días del rango que entran a los promedios (rendimiento y pico).
  const [win, setWin] = useState<Win>('all');
  const [showMx, setShowMx] = useState(false);
  const [state, setState] = useState<{ key: string; data: Result | null } | null>(null);
  const key = `${date}:${inst}:${win}`;
  useEffect(() => {
    let alive = true;
    fetchStrategy(date, inst, win).then((data) => { if (alive) setState({ key, data }); });
    return () => { alive = false; };
  }, [date, inst, win, key]);
  // Mientras carga otro instrumento se muestra el resultado anterior atenuado: el popup no se encoge bajo el cursor.
  const fresh = state?.key === key;
  const r = fresh ? state!.data : state?.data ?? undefined;
  const bd = r ? bhtBand(r.bht) : null;

  return (
    <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-2">
      {adviceText && bd && (
        <div className="p-2 rounded-lg border" style={{ borderColor: `${bd.color}66`, backgroundColor: `${bd.color}14` }}>
          <div className="font-bold mb-0.5" style={{ color: bd.color }}>{adviceLabel}</div>
          <div className="text-slate-200 font-normal leading-snug">{adviceText}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
          {(Object.keys(INST) as Instrument[]).map((k) => (
            <button key={k} type="button" onClick={() => setInst(k)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${inst === k ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{INST[k]}</button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5" title={t.winTitle}>
          {(['all', '5y'] as Win[]).map((k) => (
            <button key={k} type="button" onClick={() => setWin(k)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${win === k ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{k === 'all' ? t.winAll : t.win5}</button>
          ))}
        </div>
        {r && (
          <span className="font-mono text-[11px] text-slate-400">
            {t.range} <span className="font-bold" style={{ color: capeScoreColor(r.bht) }}>{r.bht.toFixed(1)}</span> → {t.rangeOf} <span className="text-slate-100">{Math.max(0, r.range[0])}–{Math.min(100, r.range[1])}</span>
            {' · '}{t.freq}: <span className="text-slate-100">{r.frequency.all.count.toLocaleString('en-US')}</span> {t.days} ({r.frequency.all.pct.toFixed(1)}% {t.hist})
            {' · '}<span className="text-slate-100">{r.frequency.last5y.count}</span> ({r.frequency.last5y.pct.toFixed(1)}% {t.last5})
          </span>
        )}
      </div>

      {r?.percentile && (() => {
        // Percentil en la ventana elegida (toda la historia / últimos 5 años), con el color del semáforo del BHT.
        const p = win === '5y' ? r.percentile.last5y : r.percentile.all;
        const m = opportunityMessage(p, locale);
        const color = bhtBand(r.bht).color;
        return (
          <div className="flex items-center gap-3 p-2 rounded-lg border" style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}>
            <div className="shrink-0 text-center leading-none">
              <div className="font-mono text-lg font-bold" style={{ color }}>{fmtPct(p)}%</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-500 mt-0.5">{t.pctl}</div>
            </div>
            <div className="leading-snug">
              <div className="font-bold" style={{ color }}>{m.label}</div>
              <div className="text-slate-300">{m.text} <span className="text-slate-500">({win === '5y' ? t.win5 : t.winAll})</span></div>
            </div>
          </div>
        );
      })()}

      {r?.matrix && (() => {
        // Consejo combinado BHT × tendencia, con los números históricos de la celda de hoy y la matriz completa.
        const regime = toTrendRegime(r.matrix.current.regime);
        const adv = trendAdvice(r.matrix.current.band, regime, locale);
        if (!adv || !regime) return null;
        const toneColor: Record<AdviceTone, string> = { good: TOKENS.favorable, ok: TOKENS.caution, warn: TOKENS.elevated, bad: TOKENS.risk };
        const c = toneColor[adv.tone];
        const cell = r.matrix.cells.find((x) => x.band === r.matrix!.current.band && x.regime === regime);
        return (
          <div className="p-2 rounded-lg border space-y-1.5" style={{ borderColor: `${c}66`, backgroundColor: `${c}10` }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.mxTitle}</span>
              <span className="font-bold" style={{ color: bhtBand(r.bht).color }}>{BHT_BANDS[r.matrix.current.band]?.range}</span>
              <span className="text-slate-500">×</span>
              <TrendBadge trend={{ regime }} size="xs" />
            </div>
            <div className="font-bold" style={{ color: c }}>{adv.title}</div>
            <div className="text-slate-300 leading-snug">{adv.text}</div>
            {cell && cell.n > 0 && (
              <div className="font-mono text-[11px] text-slate-400">
                {t.mxCell} ({win === '5y' ? t.win5 : t.winAll}, {cell.n} {t.mxDays}): {t.mxRet} <span className={`font-bold ${pctCls(cell.avg12m)}`}>{pctTxt(cell.avg12m)}</span>
                {' · '}{cell.pos12m?.toFixed(0)}% {t.mxPos} · {t.mxDd} <span className="text-risk-300">{pctTxt(cell.avgMdd)}</span> · {t.mxP15} <span className="text-slate-100">{cell.pDd15?.toFixed(0)}%</span>
              </div>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowMx((v) => !v); }} className="text-[11px] text-accent-400 hover:text-accent-300">{showMx ? t.mxHide : t.mxShow}</button>
            {showMx && (
              <div>
                <table className="w-full font-mono text-[10px]">
                  <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-700/70">
                      <th className="text-left font-normal py-0.5">{t.mxBand}</th>
                      {TREND_ORDER.map((g) => <th key={g} className="text-right font-normal" style={{ color: TREND_META[g].color }}>{TREND_META[g].arrow} {trendText(g, locale).name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {BHT_BANDS.map((b, bi) => (
                      <tr key={b.range} className="border-b border-slate-800/60">
                        <td className="py-0.5 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: b.color }} />{b.range}</td>
                        {TREND_ORDER.map((g) => {
                          const x = r.matrix!.cells.find((y) => y.band === bi && y.regime === g);
                          const cur = bi === r.matrix!.current.band && g === regime;
                          if (!x || !x.n) return <td key={g} className="text-right text-slate-600">—</td>;
                          return (
                            // Celda de hoy: pulso sutil con el color de la banda y nunca atenuada (aunque tenga pocos días).
                            <td key={g} className={`text-right px-1 rounded ${cur ? 'bht-cell-now' : x.n < 60 ? 'opacity-50' : ''}`}
                              style={cur ? ({ '--pulse': b.color } as React.CSSProperties) : undefined}
                              title={`${cur ? `${t.mxHere} · ` : ''}${x.n} ${t.mxDays} · ${x.pos12m?.toFixed(0)}% ${t.mxPos}`}>
                              <div className={`font-bold ${pctCls(x.avg12m)}`}>{pctTxt(x.avg12m)}</div>
                              <div className="text-slate-500">{x.avgMdd?.toFixed(0)}% · {x.pDd15?.toFixed(0)}%</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[10px] text-slate-500 mt-0.5">{t.mxNote}</div>
              </div>
            )}
          </div>
        );
      })()}

      {r === undefined ? <div className="font-mono text-slate-500">{t.loading}</div> : r === null ? <div className="font-mono text-risk-300">{t.error}</div> : (
        <div className={`space-y-2 transition-opacity ${fresh ? '' : 'opacity-50'}`}>
          <div>
            <div className="text-[11px] font-semibold text-slate-100 mb-1">{t.perfTitle} ({win === 'all' ? t.winAll : t.win5}) · {INST[inst]} · {t.base} {money(r.base.price)} ({r.date})</div>
            <table className="w-full font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5">{t.horizon}</th><th className="text-right font-normal">{t.avg}</th><th className="text-right font-normal" title={t.cagrTitle}>{t.cagr}</th><th className="text-right font-normal">{t.med}</th>
                  <th className="text-right font-normal">{t.pos}</th><th className="text-right font-normal">{t.nominal}</th><th className="text-right font-normal">{t.target}</th><th className="text-right font-normal">{t.n}</th>
                </tr>
              </thead>
              <tbody>
                {r.perf.map((p) => (
                  <tr key={p.years} className="border-b border-slate-800/60">
                    <td className="py-[1px] text-slate-400">{p.years}{t.y}</td>
                    <td className={`text-right font-bold ${pctCls(p.avgPct)}`}>{pctTxt(p.avgPct)}</td>
                    <td className={`text-right ${pctCls(p.cagrPct ?? null)}`} title={t.cagrTitle}>{pctTxt(p.cagrPct ?? null)}</td>
                    <td className={`text-right ${pctCls(p.medianPct)}`}>{pctTxt(p.medianPct)}</td>
                    <td className="text-right text-slate-300">{p.positivePct == null ? '—' : `${p.positivePct.toFixed(0)}%`}</td>
                    <td className="text-right text-slate-100">{money(p.nominal)}</td>
                    <td className="text-right text-slate-400">{p.targetDate}</td>
                    <td className="text-right text-slate-500">{p.n}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-700" title={t.peakNote}>
                  <td className="py-[1px] text-slate-300" title={win === '5y' ? t.peak5Note : t.peakNote}>{win === '5y' ? t.peak5 : t.peak}</td>
                  <td className={`text-right font-bold ${pctCls(r.peak.avgPct)}`}>{pctTxt(r.peak.avgPct)}</td>
                  <td colSpan={3} className="text-right text-slate-500">{t.peakIn} {dur(r.peak.avgDays, t)}</td>
                  <td className="text-right text-slate-100">{money(r.peak.nominal)}</td>
                  <td className="text-right text-slate-400">{r.peak.date ?? '—'}</td>
                  <td className="text-right text-slate-500">{r.peak.n}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {r.sinceDate && (
            <div>
              <div className="text-[11px] font-semibold text-slate-100 mb-1">{t.since} ({r.date})</div>
              <table className="w-full font-mono text-[11px]">
                <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-700/70">
                    <th className="text-left font-normal py-0.5" /><th className="text-right font-normal">{t.buy}</th><th className="text-right font-normal">{t.last}</th>
                    <th className="text-right font-normal">{t.yrs}</th><th className="text-right font-normal">{t.total}</th><th className="text-right font-normal">{t.cagr}</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(INST) as Instrument[]).map((k) => {
                    const x = r.sinceDate![k];
                    return (
                      <tr key={k} className={`border-b border-slate-800/60 ${k === inst ? 'bg-slate-800/40' : ''}`}>
                        <td className="py-[1px] text-slate-300">{INST[k]}</td>
                        <td className="text-right text-slate-300">{money(x.buyPrice)}</td>
                        <td className="text-right text-slate-100" title={x.lastDate ?? ''}>{money(x.lastPrice)}</td>
                        <td className="text-right text-slate-500">{x.years != null ? x.years.toFixed(1) : '—'}</td>
                        <td className={`text-right ${pctCls(x.totalPct)}`}>{pctTxt(x.totalPct)}</td>
                        <td className={`text-right font-bold ${pctCls(x.cagrPct)}`}>{x.cagrPct != null ? pctTxt(x.cagrPct) : x.totalPct != null ? <span className="font-normal text-slate-500">{t.short}</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="text-[11px] font-semibold text-slate-100 mt-2 mb-1">{t.atPeak} ({r.date})</div>
              <table className="w-full font-mono text-[11px]">
                <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-700/70">
                    <th className="text-left font-normal py-0.5" /><th className="text-right font-normal">{t.buy}</th><th className="text-right font-normal">{t.peakCol}</th>
                    <th className="text-right font-normal">{t.dateCol}</th><th className="text-right font-normal">BHT</th>
                    <th className="text-right font-normal">{t.yrs}</th><th className="text-right font-normal">{t.total}</th><th className="text-right font-normal">{t.cagr}</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(INST) as Instrument[]).map((k) => {
                    const x = r.sinceDate![k];
                    const pk = x.peak;
                    return (
                      <tr key={k} className={`border-b border-slate-800/60 ${k === inst ? 'bg-slate-800/40' : ''}`}>
                        <td className="py-[1px] text-slate-300">{INST[k]}</td>
                        <td className="text-right text-slate-300">{money(x.buyPrice)}</td>
                        {pk ? (
                          <>
                            <td className="text-right text-slate-100">{money(pk.price)}</td>
                            <td className="text-right text-slate-400">{pk.date}</td>
                            <td className="text-right font-bold" style={pk.bht != null ? { color: capeScoreColor(pk.bht) } : undefined}>{pk.bht != null ? pk.bht.toFixed(1) : '—'}</td>
                            <td className="text-right text-slate-500">{pk.years.toFixed(1)}</td>
                            <td className={`text-right ${pctCls(pk.totalPct)}`}>{pctTxt(pk.totalPct)}</td>
                            <td className={`text-right font-bold ${pctCls(pk.cagrPct)}`}>{pk.cagrPct != null ? pctTxt(pk.cagrPct) : <span className="font-normal text-slate-500">{t.short}</span>}</td>
                          </>
                        ) : (
                          <td colSpan={6} className="text-right text-slate-500">{x.buyPrice == null ? '—' : t.noPeak}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[10px] text-slate-500 mt-0.5">{t.sinceNote}</div>
            </div>
          )}
          <div className="text-[10px] text-slate-500">{t.note}</div>
        </div>
      )}
    </div>
  );
}
