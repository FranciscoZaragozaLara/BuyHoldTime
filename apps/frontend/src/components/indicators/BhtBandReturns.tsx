'use client';
// "¿Funciona el BHT?" en una tabla: retornos a 1 y 3 años según la banda del BHT del día de compra (las 7 bandas de la
// matriz), o según el nivel del CAPE para comparar qué agrega el BHT sobre la valuación sola. Reemplaza a la vista
// "Stats" del termómetro. Comparte la descarga de bht-forward con la tabla BHT Forward.
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { getApiBase } from '@/lib/apiBase';
import { fetchBhtForwardAll } from '@/lib/bhtForwardData';
import { bandReturns, type Asset, type FwdRow, type Stat, type Window } from '@/lib/bandReturns';
import { MATRIX_BANDS, matrixBandOf } from '@/lib/bhtMatrix';
import { capeScoreColor } from '@/components/backtesting/bhtBands';
import { capeRiskScore } from '@/lib/thermoScoring';

const T = {
  es: {
    byBht: 'Por banda del BHT', byCape: 'Por nivel del CAPE', w5: '5 años', w10: '10 años', wAll: 'Toda la historia',
    band: 'BHT', cape: 'CAPE', days: 'Días', time: '% tiempo', y1: 'A 1 año', y3: 'A 3 años', avg: 'Prom.', med: 'Mediana', pos: '% pos.', cagr: 'CAGR 3a',
    here: 'hoy', loading: 'Calculando retornos por banda…', dense: 'Periodo más denso', without: '1A sin él', denseTip: 'Ventana de 5 años con más días en la banda y su % del total. Los días seguidos de un mismo rally no son casos independientes.', withoutTip: 'Promedio a 1 año quitando ese periodo: si cambia mucho, el resultado depende de un solo episodio.',
    noteBht: 'Días comprados en cada banda del BHT y lo que hizo el activo después. Si el BHT funciona, las bandas bajas (miedo) deben rendir más y con más % positivos que las altas (euforia).',
    noteCape: 'Mismo cálculo agrupando por el CAPE de Shiller del día: compara qué tanto separa el CAPE solo contra el BHT.',
    foot: 'Promedios de días históricos (se traslapan). CAGR 3a = anual equivalente al promedio a 3 años. Solo días con el plazo ya cumplido. ⚠ = un solo periodo de 5 años concentra 45% o más de los días de la banda: el resultado depende de ese episodio (compara con «1A sin él»). No es una recomendación de inversión.',
  },
  en: {
    byBht: 'By BHT band', byCape: 'By CAPE level', w5: '5 years', w10: '10 years', wAll: 'All history',
    band: 'BHT', cape: 'CAPE', days: 'Days', time: '% time', y1: '1 year later', y3: '3 years later', avg: 'Avg', med: 'Median', pos: '% pos.', cagr: '3y CAGR',
    here: 'today', loading: 'Computing returns by band…', dense: 'Densest period', without: '1y without it', denseTip: '5-year window with the most days in the band and its % of the total. Consecutive days of the same rally are not independent cases.', withoutTip: '1-year average excluding that period: if it changes a lot, the result depends on a single episode.',
    noteBht: 'Days bought in each BHT band and what the asset did afterwards. If the BHT works, low bands (fear) should return more and be positive more often than high bands (euphoria).',
    noteCape: 'Same calculation grouped by that day’s Shiller CAPE: compares how well CAPE alone separates outcomes versus the BHT.',
    foot: 'Averages of historical days (overlapping). 3y CAGR = annual rate equivalent to the 3-year average. Only days whose horizon is complete. ⚠ = a single 5-year period holds 45% or more of the band’s days: the result depends on that episode (compare with “1y without it”). Not investment advice.',
  },
};
const ASSETS: Array<{ k: Asset; label: string }> = [{ k: 'spx', label: 'S&P 500' }, { k: 'ndx', label: 'Nasdaq' }, { k: 'tqqq', label: 'TQQQ' }];
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const cls = (v: number | null | undefined) => (v == null ? 'text-slate-600' : v >= 0 ? 'text-favorable-300' : 'text-risk-300');

export function BhtBandReturns({ bhtToday, capeToday }: { bhtToday?: number | null; capeToday?: number | null }) {
  const loc = useLocale() === 'es' ? 'es' : 'en';
  const t = T[loc];
  const [rows, setRows] = useState<FwdRow[] | null>(null);
  const [cape, setCape] = useState<Map<string, number> | null>(null);
  const [by, setBy] = useState<'bht' | 'cape'>('bht');
  const [win, setWin] = useState<Window>('all');
  const [asset, setAsset] = useState<Asset>('spx');
  useEffect(() => { let alive = true; fetchBhtForwardAll().then((j) => { if (alive) setRows(j as FwdRow[]); }); return () => { alive = false; }; }, []);
  // El CAPE diario solo se pide al elegir "Por nivel del CAPE".
  useEffect(() => {
    if (by !== 'cape' || cape) return;
    let alive = true;
    fetch(`${getApiBase()}/api/backtesting/shiller-daily?from=1993-01-01`).then((r) => (r.ok ? r.json() : []))
      .then((j: Array<{ date: string; cape: number | null }>) => { if (alive) setCape(new Map(j.filter((x) => x.cape != null).map((x) => [String(x.date).slice(0, 10), Number(x.cape)]))); })
      .catch(() => { if (alive) setCape(new Map()); });
    return () => { alive = false; };
  }, [by, cape]);
  const today = new Date().toISOString().slice(0, 10);
  const data = useMemo(() => (rows && (by === 'bht' || cape) ? bandReturns(rows, { asset, window: win, today, by, capeByDate: cape ?? undefined }) : null), [rows, cape, by, win, asset, today]);
  const hereKey = by === 'bht' ? (bhtToday != null ? matrixBandOf(bhtToday) : -1)
    : capeToday != null ? [20, 25, 30, 35, 40].filter((x) => capeToday >= x).length : -1;
  const tab = (on: boolean) => `px-2.5 py-1 text-[11px] rounded-md transition ${on ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`;
  const statCells = (s: Stat) => s
    ? <><td className={`text-right font-bold ${cls(s.avg)}`}>{pct(s.avg)}</td><td className={`text-right ${cls(s.median)}`}>{pct(s.median)}</td><td className="text-right text-slate-300">{s.pos.toFixed(0)}%</td></>
    : <><td className="text-right text-slate-600">—</td><td className="text-right text-slate-600">—</td><td className="text-right text-slate-600">—</td></>;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
          <button type="button" className={tab(by === 'bht')} onClick={() => setBy('bht')}>{t.byBht}</button>
          <button type="button" className={tab(by === 'cape')} onClick={() => setBy('cape')}>{t.byCape}</button>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
          {ASSETS.map((a) => <button key={a.k} type="button" className={tab(asset === a.k)} onClick={() => setAsset(a.k)}>{a.label}</button>)}
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
          {(['5y', '10y', 'all'] as Window[]).map((w) => <button key={w} type="button" className={tab(win === w)} onClick={() => setWin(w)}>{w === '5y' ? t.w5 : w === '10y' ? t.w10 : t.wAll}</button>)}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">{by === 'bht' ? t.noteBht : t.noteCape}</p>
      {!data ? <div className="text-sm text-slate-500 animate-pulse py-6">{t.loading}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left font-normal" rowSpan={2}>{by === 'bht' ? t.band : t.cape}</th>
                <th className="text-right font-normal" rowSpan={2}>{t.days}</th>
                <th className="text-right font-normal" rowSpan={2}>{t.time}</th>
                <th className="text-right font-normal" rowSpan={2} title={t.denseTip}>{t.dense}</th>
                <th className="text-right font-normal" rowSpan={2} title={t.withoutTip}>{t.without}</th>
                <th className="text-center font-normal border-l border-slate-800" colSpan={3}>{t.y1}</th>
                <th className="text-center font-normal border-l border-slate-800" colSpan={4}>{t.y3}</th>
              </tr>
              <tr className="border-b border-slate-700/70">
                <th className="text-right font-normal border-l border-slate-800">{t.avg}</th><th className="text-right font-normal">{t.med}</th><th className="text-right font-normal">{t.pos}</th>
                <th className="text-right font-normal border-l border-slate-800">{t.avg}</th><th className="text-right font-normal">{t.med}</th><th className="text-right font-normal">{t.pos}</th><th className="text-right font-normal">{t.cagr}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => {
                const color = by === 'bht' ? MATRIX_BANDS[b.key].color : capeScoreColor(capeRiskScore(b.key === 0 ? 18 : [20, 25, 30, 35, 40][b.key - 1] + 2));
                const here = b.key === hereKey;
                return (
                  <tr key={b.key} className={`border-b border-slate-800/60 ${here ? 'bg-slate-800/50' : ''}`}>
                    <td className="py-1 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: color }} /><b style={{ color }}>{b.range}</b>{here && <span className="ml-1.5 text-[9px] px-1 rounded bg-accent-500 text-white font-bold">{t.here}</span>}</td>
                    <td className="text-right text-slate-400">{b.days.toLocaleString('en-US')}</td>
                    <td className="text-right text-slate-400">{b.days ? `${b.pctTime.toFixed(1)}%` : '—'}</td>
                    <td className={`text-right whitespace-nowrap ${b.thin ? 'text-caution-300' : 'text-slate-500'}`} title={t.denseTip}>
                      {b.dense ? <>{b.thin && <span className="mr-1">⚠</span>}{b.dense.from === b.dense.to ? b.dense.from : `${b.dense.from}–${b.dense.to.slice(2)}`} <span className="text-[9px]">{Math.round(b.dense.share * 100)}%</span></> : '—'}
                    </td>
                    <td className={`text-right ${cls(b.y1Without)} ${b.thin ? 'font-bold' : ''}`} title={t.withoutTip}>{pct(b.y1Without)}</td>
                    {statCells(b.y1)}
                    {statCells(b.y3)}
                    <td className={`text-right font-bold ${cls(b.cagr3)}`}>{pct(b.cagr3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-2">{t.foot}</p>
    </div>
  );
}
