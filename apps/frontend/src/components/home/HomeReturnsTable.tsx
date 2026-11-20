'use client';
// Rendimientos históricos de la home (debajo del termómetro): para S&P 500, Nasdaq-100 y TQQQ, la celda de la
// matriz BHT × tendencia de hoy (misma del popover "Estrategia"). Por defecto los últimos 5 años; "Toda la historia"
// se pide al pulsar. La matriz completa se despliega aquí mismo, con la celda de hoy resaltada.
import { useState } from 'react';
import type React from 'react';
import { getApiBase } from '@/lib/apiBase';
import { BHT_BANDS } from '@/components/backtesting/bhtBands';
import { TrendBadge } from '@/components/backtesting/TrendBadge';
import { toTrendRegime, TREND_META, TREND_ORDER, trendText } from '@/lib/trendRegime';
import { fetchMatrixCells, matrixCell, MATRIX_INSTRUMENTS, MATRIX_LABEL, type MatrixCell, type MatrixInstrument, type MatrixWindow } from '@/lib/bhtMatrix';

type Cells = Record<MatrixInstrument, MatrixCell[] | null>;

const T = {
  es: {
    title: 'Rendimientos históricos', sub: 'Días con la misma banda del BHT y la misma tendencia que hoy', win5: '5 años', winAll: 'Toda la historia',
    inst: 'Instrumento', ret: 'Rend. 12m', pos: '% positivos', mdd: 'Caída máx. prom.', p15: 'Prob. caer >15%', days: 'Días',
    show: 'Ver matriz completa', hide: 'Ocultar matriz', band: 'Banda BHT', here: 'Estás aquí', loading: 'Calculando…', none: 'Sin días con esta combinación',
    note: 'Promedios de días históricos (se traslapan). Debajo de cada celda: caída máxima promedio · probabilidad de caer más de 15% en esos 12 meses. Celdas con pocos días se ven tenues. No es una recomendación.',
    tqqqTitle: '* TQQQ: apalancado 3× — operar con extremo cuidado',
    tqqqText: 'Sus rendimientos solo cuentan desde su lanzamiento (feb 2010), un periodo casi siempre alcista. En crisis financieras mayores, un 3× diario del Nasdaq habría perdido desde el máximo −99.8% en la burbuja puntocom (2000–02) y −95.5% en la crisis financiera de 2008 (2007–09), contra −78.5% y −56.2% del Nasdaq: prácticamente todo el capital.',
    tqqqSrc: 'Simulación: 3× del rendimiento diario del Nasdaq Composite con comisión de 0.95% anual, sin costo de financiamiento.',
  },
  en: {
    title: 'Historical returns', sub: 'Days with the same BHT band and the same trend as today', win5: '5 years', winAll: 'All history',
    inst: 'Instrument', ret: '12m return', pos: '% positive', mdd: 'Avg max drawdown', p15: 'Prob. of falling >15%', days: 'Days',
    show: 'See full matrix', hide: 'Hide matrix', band: 'BHT band', here: 'You are here', loading: 'Computing…', none: 'No days with this combination',
    note: 'Averages of historical days (they overlap). Under each cell: average max drawdown · probability of falling more than 15% within those 12 months. Cells with few days are dimmed. Not a recommendation.',
    tqqqTitle: '* TQQQ: 3× leveraged — trade with extreme care',
    tqqqText: 'Its returns only count from its launch (Feb 2010), an almost always rising period. In major financial crises, a daily 3× Nasdaq would have lost −99.8% from its peak in the dot-com bubble (2000–02) and −95.5% in the 2008 financial crisis (2007–09), versus −78.5% and −56.2% for the Nasdaq: virtually all the capital.',
    tqqqSrc: 'Simulation: 3× the Nasdaq Composite daily return with a 0.95% annual fee, no financing cost.',
  },
};

const pctTxt = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
const pctCls = (v: number | null | undefined) => (v == null ? 'text-slate-500' : v >= 0 ? 'text-favorable-300' : 'text-risk-300');

export function HomeReturnsTable({ locale, date, band, regime: regimeRaw, initial }: { locale: string; date: string; band: number; regime: string | null; initial: Cells }) {
  const t = locale === 'es' ? T.es : T.en;
  const regime = toTrendRegime(regimeRaw);
  const [win, setWin] = useState<MatrixWindow>('5y');
  const [byWin, setByWin] = useState<Partial<Record<MatrixWindow, Cells>>>({ '5y': initial });
  const [showMx, setShowMx] = useState(false);
  const [mxInst, setMxInst] = useState<MatrixInstrument>('spx');
  if (!regime) return null;
  const cells = byWin[win];

  const pickWin = (w: MatrixWindow) => {
    setWin(w);
    if (byWin[w]) return;
    Promise.all(MATRIX_INSTRUMENTS.map((i) => fetchMatrixCells(getApiBase(), date, i, w)))
      .then((rs) => setByWin((prev) => ({ ...prev, [w]: Object.fromEntries(MATRIX_INSTRUMENTS.map((i, k) => [i, rs[k]])) as Cells })));
  };
  const b = BHT_BANDS[band];

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{t.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-mono font-bold" style={{ color: b?.color }}>BHT {b?.range}</span>
            <span>×</span>
            <TrendBadge trend={{ regime }} size="xs" />
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 p-0.5 text-[11px]">
          {(['5y', 'all'] as MatrixWindow[]).map((w) => (
            <button key={w} type="button" onClick={() => pickWin(w)}
              className={`px-2 py-0.5 rounded-md font-semibold transition ${win === w ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {w === '5y' ? t.win5 : t.winAll}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{t.sub}</p>

      {!cells ? <div className="font-mono text-[11px] text-slate-500 mt-2">{t.loading}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px] mt-2">
            <thead className="text-[9px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-700/70">
                <th className="text-left font-normal py-1">{t.inst}</th>
                <th className="text-right font-normal">{t.ret}</th>
                <th className="text-right font-normal">{t.pos}</th>
                <th className="text-right font-normal">{t.mdd}</th>
                <th className="text-right font-normal">{t.p15}</th>
                <th className="text-right font-normal">{t.days}</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX_INSTRUMENTS.map((i) => {
                const c = matrixCell(cells[i], band, regime);
                return (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="py-1 text-slate-200 font-sans font-semibold whitespace-nowrap">{MATRIX_LABEL[i]}{i === 'tqqq' && <span className="text-elevated-400">*</span>}</td>
                    {c ? (
                      <>
                        <td className={`text-right font-bold ${pctCls(c.avg12m)}`}>{pctTxt(c.avg12m)}</td>
                        <td className="text-right text-slate-300">{c.pos12m?.toFixed(0)}%</td>
                        <td className="text-right text-risk-300">{pctTxt(c.avgMdd)}</td>
                        <td className="text-right text-slate-300">{c.pDd15?.toFixed(0)}%</td>
                        <td className={`text-right ${c.n < 60 ? 'text-slate-600' : 'text-slate-500'}`}>{c.n}</td>
                      </>
                    ) : <td colSpan={5} className="text-right text-slate-600">{t.none}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={() => setShowMx((v) => !v)} className="mt-2 text-[11px] font-semibold text-accent-400 hover:text-accent-300">
        {showMx ? t.hide : t.show} {showMx ? '▴' : '▾'}
      </button>
      {showMx && cells && (
        <div className="mt-2">
          <div className="inline-flex rounded-lg border border-slate-700 p-0.5 text-[11px] mb-1.5">
            {MATRIX_INSTRUMENTS.map((i) => (
              <button key={i} type="button" onClick={() => setMxInst(i)}
                className={`px-2 py-0.5 rounded-md font-semibold transition ${mxInst === i ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {MATRIX_LABEL[i]}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[10px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5">{t.band}</th>
                  {TREND_ORDER.map((g) => <th key={g} className="text-right font-normal" style={{ color: TREND_META[g].color }}>{TREND_META[g].arrow} {trendText(g, locale).name}</th>)}
                </tr>
              </thead>
              <tbody>
                {BHT_BANDS.map((bb, bi) => (
                  <tr key={bb.range} className="border-b border-slate-800/60">
                    <td className="py-0.5 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: bb.color }} />{bb.range}</td>
                    {TREND_ORDER.map((g) => {
                      const x = (cells[mxInst] ?? []).find((y) => y.band === bi && y.regime === g);
                      const cur = bi === band && g === regime;
                      if (!x || !x.n) return <td key={g} className="text-right text-slate-600">—</td>;
                      return (
                        <td key={g} className={`text-right px-1 rounded ${cur ? 'bht-cell-now' : x.n < 60 ? 'opacity-50' : ''}`}
                          style={cur ? ({ '--pulse': bb.color } as React.CSSProperties) : undefined}
                          title={`${cur ? `${t.here} · ` : ''}${x.n} ${t.days.toLowerCase()} · ${x.pos12m?.toFixed(0)}% ${t.pos.replace('% ', '')}`}>
                          <div className={`font-bold ${pctCls(x.avg12m)}`}>{pctTxt(x.avg12m)}</div>
                          <div className="text-slate-500">{x.avgMdd?.toFixed(0)}% · {x.pDd15?.toFixed(0)}%</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">{t.note}</p>
      <div className="mt-2 rounded-lg border border-elevated-500/30 bg-elevated-500/10 p-2">
        <div className="text-[11px] font-bold text-elevated-300">⚠ {t.tqqqTitle}</div>
        <p className="text-[11px] text-slate-300 leading-snug mt-0.5">{t.tqqqText}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{t.tqqqSrc}</p>
      </div>
    </div>
  );
}
