'use client';
// Vista "Estrategia" del popover del BHT. Se carga con next/dynamic (su código se descarga solo al pulsar
// el botón) y pide el cálculo al backend bajo demanda; los resultados quedan en memoria por (fecha, instrumento).
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { bhtBand, capeScoreColor } from './bhtBands';

type Instrument = 'spx' | 'qqq' | 'tqqq';
type Win = 'all' | '5y';
type Result = {
  date: string; bht: number; range: [number, number];
  frequency: { all: { count: number; total: number; pct: number }; last5y: { count: number; total: number; pct: number } };
  base: { price: number | null; today: string; todayPrice: number | null };
  perf: Array<{ years: number; n: number; avgPct: number | null; medianPct: number | null; positivePct: number | null; nominal: number | null; targetDate: string }>;
  peak: { n: number; avgPct: number | null; avgDays: number | null; nominal: number | null; date: string | null };
  tranches: {
    actual: Array<{ tranche: number; threshold: number | null; date: string | null; price: number | null; pct: number | null; days: number | null; bhtPrev: number | null; bhtHit: number | null }>;
    strategyPct: number | null; holdPct: number | null; soldCount: number;
    expected: Array<{ tranche: number; n: number; reachedPct: number | null; avgDays: number | null; avgPct: number | null }>;
  };
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
    trTitle: 'Venta en 4 tramos iguales (25%) en la escalera del BHT', trRules: 'Al menos 15 días entre ventas (no vende todo en un salto). Si tras una venta el BHT baja de 62, la escalera vuelve a 72.', trThis: 'Desde este día', trExp: 'Esperado (días del rango)', th: 'Tramo · escalón', sold: 'Venta', price: 'Precio', ret: 'Rend.', wait: 'Tiempo',
    pending: 'pendiente → hoy', jump: 'BHT', jumpTitle: 'BHT del día anterior → BHT del día de la venta', strategy: 'Estrategia 4 tramos', hold: 'Mantener hasta hoy', reached: 'Lo alcanzó', base: 'Compra', today: 'hoy',
    note: 'Promedios de días históricos (se traslapan; n = días con dato). No es una recomendación de inversión.',
    y: 'a', d: 'd',
  },
  en: {
    advice: 'Strategy for the band', range: 'BHT of the day', rangeOf: 'range', freq: 'Range frequency', hist: 'all history', last5: 'last 5 years', days: 'days',
    perfTitle: 'Average performance of days in this range', horizon: 'Horizon', avg: 'Avg', med: 'Median', pos: '% positive', nominal: 'Expected price', target: 'Date', n: 'n',
    peak: 'Max peak (5y)', peakIn: 'in ~', peak5: 'Max peak (to today)', peak5Note: 'Peak from each day until today (no day in the last 5 years has a full 5-year window).',
    winAll: 'All history', win5: 'Last 5 years', winTitle: 'Range days included in the averages', peakNote: 'Peak within 5 years; date = day + average time to peak.', loading: 'Computing…', error: 'Could not compute.',
    trTitle: 'Sell in 4 equal tranches (25%) on the BHT ladder', trRules: 'At least 15 days between sales (no selling everything on one jump). If BHT drops below 62 after a sale, the ladder restarts at 72.', trThis: 'From this day', trExp: 'Expected (range days)', th: 'Tranche · step', sold: 'Sale', price: 'Price', ret: 'Return', wait: 'Time',
    pending: 'pending → today', jump: 'BHT', jumpTitle: 'BHT the day before → BHT on the sale day', strategy: '4-tranche strategy', hold: 'Hold until today', reached: 'Reached', base: 'Buy', today: 'today',
    note: 'Averages of historical days (overlapping; n = days with data). Not investment advice.',
    y: 'y', d: 'd',
  },
};

const dur = (days: number | null, t: (typeof T)['es']) => (days == null ? '—' : days >= 365 ? `${(days / 365).toFixed(1)}${t.y}` : `${Math.round(days)}${t.d}`);

export default function BhtStrategyView({ date, locale, adviceLabel, adviceText }: { date: string; locale: string; adviceLabel?: string; adviceText?: string }) {
  const t = T[locale === 'es' ? 'es' : 'en'];
  const [inst, setInst] = useState<Instrument>('spx');
  // Días del rango que entran a los promedios (rendimiento, pico y lo esperado por tramo).
  const [win, setWin] = useState<Win>('all');
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
            {t.range} <span className="font-bold" style={{ color: capeScoreColor(r.bht) }}>{r.bht.toFixed(1)}</span> → {t.rangeOf} <span className="text-slate-100">{r.range[0]}–{r.range[1]}</span>
            {' · '}{t.freq}: <span className="text-slate-100">{r.frequency.all.count.toLocaleString('en-US')}</span> {t.days} ({r.frequency.all.pct.toFixed(1)}% {t.hist})
            {' · '}<span className="text-slate-100">{r.frequency.last5y.count}</span> ({r.frequency.last5y.pct.toFixed(1)}% {t.last5})
          </span>
        )}
      </div>

      {r === undefined ? <div className="font-mono text-slate-500">{t.loading}</div> : r === null ? <div className="font-mono text-risk-300">{t.error}</div> : (
        <div className={`space-y-2 transition-opacity ${fresh ? '' : 'opacity-50'}`}>
          <div>
            <div className="text-[11px] font-semibold text-slate-100 mb-1">{t.perfTitle} ({win === 'all' ? t.winAll : t.win5}) · {INST[inst]} · {t.base} {money(r.base.price)} ({r.date})</div>
            <table className="w-full font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5">{t.horizon}</th><th className="text-right font-normal">{t.avg}</th><th className="text-right font-normal">{t.med}</th>
                  <th className="text-right font-normal">{t.pos}</th><th className="text-right font-normal">{t.nominal}</th><th className="text-right font-normal">{t.target}</th><th className="text-right font-normal">{t.n}</th>
                </tr>
              </thead>
              <tbody>
                {r.perf.map((p) => (
                  <tr key={p.years} className="border-b border-slate-800/60">
                    <td className="py-[1px] text-slate-400">{p.years}{t.y}</td>
                    <td className={`text-right font-bold ${pctCls(p.avgPct)}`}>{pctTxt(p.avgPct)}</td>
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
                  <td colSpan={2} className="text-right text-slate-500">{t.peakIn} {dur(r.peak.avgDays, t)}</td>
                  <td className="text-right text-slate-100">{money(r.peak.nominal)}</td>
                  <td className="text-right text-slate-400">{r.peak.date ?? '—'}</td>
                  <td className="text-right text-slate-500">{r.peak.n}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-100 mb-0.5">{t.trTitle} 72 → 77 → 82 → 87+ · {INST[inst]}</div>
            <div className="text-[10px] text-slate-500 mb-1">{t.trRules}</div>
            <table className="w-full font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th />
                  <th colSpan={5} className="text-center font-normal border-b border-slate-700/70">{t.trThis} ({t.base} {money(r.base.price)})</th>
                  <th className="w-3" />
                  <th colSpan={3} className="text-center font-normal border-b border-slate-700/70">{t.trExp}{win === '5y' ? ` · ${t.win5}` : ''}</th>
                </tr>
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5">{t.th}</th>
                  <th className="text-right font-normal">{t.sold}</th><th className="text-right font-normal" title={t.jumpTitle}>{t.jump}</th><th className="text-right font-normal">{t.price}</th><th className="text-right font-normal">{t.ret}</th><th className="text-right font-normal">{t.wait}</th>
                  <th />
                  <th className="text-right font-normal">{t.reached}</th><th className="text-right font-normal">{t.ret}</th><th className="text-right font-normal">{t.wait}</th>
                </tr>
              </thead>
              <tbody>
                {r.tranches.actual.map((a, i) => {
                  const e = r.tranches.expected[i];
                  return (
                    <tr key={a.tranche} className="border-b border-slate-800/60">
                      <td className="py-[1px] text-slate-400">#{a.tranche}{a.threshold != null && <> · <span className="font-bold" style={{ color: bhtBand(a.threshold).color }}>{a.threshold === 87 ? '87+' : a.threshold}</span></>}</td>
                      {a.date ? (
                        <>
                          <td className="text-right text-slate-300">{a.date}</td>
                          <td className="text-right text-slate-400" title={t.jumpTitle}>
                            {a.bhtPrev != null && a.bhtHit != null ? <>{a.bhtPrev.toFixed(1)}→<span style={{ color: capeScoreColor(a.bhtHit) }}>{a.bhtHit.toFixed(1)}</span></> : '—'}
                          </td>
                          <td className="text-right text-slate-100">{money(a.price)}</td>
                          <td className={`text-right font-bold ${pctCls(a.pct)}`}>{pctTxt(a.pct)}</td>
                          <td className="text-right text-slate-500">{dur(a.days, t)}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-right text-slate-500 italic">{t.pending}</td>
                          <td className="text-right text-slate-600">—</td>
                          <td className="text-right text-slate-400">{money(r.base.todayPrice)}</td>
                          <td className={`text-right ${pctCls(r.tranches.holdPct)}`}>{pctTxt(r.tranches.holdPct)}</td>
                          <td className="text-right text-slate-600">—</td>
                        </>
                      )}
                      <td />
                      <td className="text-right text-slate-300">{e.reachedPct == null ? '—' : `${e.reachedPct.toFixed(0)}%`}</td>
                      <td className={`text-right ${pctCls(e.avgPct)}`}>{pctTxt(e.avgPct)}</td>
                      <td className="text-right text-slate-500">{dur(e.avgDays, t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
              <span>{t.strategy}: <span className={`font-bold ${pctCls(r.tranches.strategyPct)}`}>{pctTxt(r.tranches.strategyPct)}</span> <span className="text-slate-500">({r.tranches.soldCount}/4)</span></span>
              <span>{t.hold} ({money(r.base.todayPrice)}, {r.base.today}): <span className={`font-bold ${pctCls(r.tranches.holdPct)}`}>{pctTxt(r.tranches.holdPct)}</span></span>
              {r.tranches.strategyPct != null && r.tranches.holdPct != null && (
                <span className="text-slate-400">Δ <span className={`font-bold ${pctCls(r.tranches.strategyPct - r.tranches.holdPct)}`}>{pctTxt(r.tranches.strategyPct - r.tranches.holdPct)}</span></span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-500">{t.note}</div>
        </div>
      )}
    </div>
  );
}
