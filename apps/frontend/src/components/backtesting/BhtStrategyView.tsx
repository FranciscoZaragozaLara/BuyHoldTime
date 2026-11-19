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
  perf: Array<{ years: number; n: number; avgPct: number | null; medianPct: number | null; positivePct: number | null; nominal: number | null; targetDate: string; cagrPct?: number | null }>;
  sinceDate?: Record<Instrument, { buyPrice: number | null; lastPrice: number | null; lastDate: string | null; years: number | null; totalPct: number | null; cagrPct: number | null }>;
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
    cagr: 'CAGR', cagrTitle: 'Rendimiento anual compuesto equivalente al promedio del plazo',
    since: 'Comprando en esta fecha y manteniendo hasta hoy', buy: 'Compra', last: 'Último', total: 'Total', yrs: 'Años', short: '< 1 año', sinceNote: 'CAGR solo con al menos 1 año de tenencia.',
    base: 'Compra', y: 'a', d: 'd',
  },
  en: {
    advice: 'Strategy for the band', range: 'BHT of the day', rangeOf: 'range', freq: 'Range frequency', hist: 'all history', last5: 'last 5 years', days: 'days',
    perfTitle: 'Average performance of days in this range', horizon: 'Horizon', avg: 'Avg', med: 'Median', pos: '% positive', nominal: 'Expected price', target: 'Date', n: 'n',
    peak: 'Max peak (5y)', peakIn: 'in ~', peak5: 'Max peak (to today)', peak5Note: 'Peak from each day until today (no day in the last 5 years has a full 5-year window).',
    winAll: 'All history', win5: 'Last 5 years', winTitle: 'Range days included in the averages', peakNote: 'Peak within 5 years; date = day + average time to peak.', loading: 'Computing…', error: 'Could not compute.',
    note: 'Averages of historical days (overlapping; n = days with data). Not investment advice.',
    cagr: 'CAGR', cagrTitle: 'Compound annual rate equivalent to the horizon average',
    since: 'Buying on this date and holding until today', buy: 'Buy', last: 'Last', total: 'Total', yrs: 'Years', short: '< 1 year', sinceNote: 'CAGR only with at least 1 year held.',
    base: 'Buy', y: 'y', d: 'd',
  },
};

const dur = (days: number | null, t: (typeof T)['es']) => (days == null ? '—' : days >= 365 ? `${(days / 365).toFixed(1)}${t.y}` : `${Math.round(days)}${t.d}`);

export default function BhtStrategyView({ date, locale, adviceLabel, adviceText }: { date: string; locale: string; adviceLabel?: string; adviceText?: string }) {
  const t = T[locale === 'es' ? 'es' : 'en'];
  const [inst, setInst] = useState<Instrument>('spx');
  // Días del rango que entran a los promedios (rendimiento y pico).
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
              <div className="text-[10px] text-slate-500 mt-0.5">{t.sinceNote}</div>
            </div>
          )}
          <div className="text-[10px] text-slate-500">{t.note}</div>
        </div>
      )}
    </div>
  );
}
