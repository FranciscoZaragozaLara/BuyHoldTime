'use client';
import { getApiBase } from '@/lib/apiBase';
import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { bhtBandColor } from './bhtBands';
import { capeRiskScore } from './IndicatorsPanel';


type Agg = { n: number; min: number; avg: number; max: number } | null;
type Bucket = { lo: number; n: number; pct: number; min: number; avg: number; max: number; y3: Agg; cagr3: number | null };
type CapeBucket = Bucket & { score: number };
type Slot = { y1: number[]; y3: number[]; c3: number[] };

const cagr3fn = (v: number) => ((1 + v / 100) ** (1 / 3) - 1) * 100;
const aggFn = (v: number[]): Agg => v.length
  ? { n: v.length, min: Math.min(...v), avg: v.reduce((m, x) => m + x, 0) / v.length, max: Math.max(...v) }
  : null;
const pushSlot = (map: Map<number, Slot>, lo: number, y1: number, y3: number | null) => {
  if (!map.has(lo)) map.set(lo, { y1: [], y3: [], c3: [] });
  const s = map.get(lo)!;
  s.y1.push(y1);
  if (y3 != null) { s.y3.push(y3); s.c3.push(cagr3fn(y3)); }
};
const toBuckets = (groups: Map<number, Slot>, denom: number): Bucket[] =>
  [...groups.entries()]
    .map(([lo, s]) => {
      const a1 = aggFn(s.y1)!;
      return {
        lo,
        n: a1.n,
        pct: (a1.n / Math.max(denom, 1)) * 100,
        min: a1.min,
        avg: a1.avg,
        max: a1.max,
        y3: aggFn(s.y3),
        cagr3: s.c3.length ? s.c3.reduce((m, x) => m + x, 0) / s.c3.length : null,
      };
    })
    .sort((a, b) => b.lo - a.lo);

function BucketPerfCells({ b }: { b: Bucket }) {
  return (<>
    <td className={`py-1 pr-2 text-right ${b.min >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.min)}</td>
    <td className={`py-1 pr-2 text-right font-bold ${b.avg >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.avg)}</td>
    <td className={`py-1 pr-2 text-right ${b.max >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.max)}</td>
    {b.y3 == null ? (
      <><td className="py-1 pr-2 text-right text-slate-600">—</td><td className="py-1 pr-2 text-right text-slate-600">—</td><td className="py-1 pr-2 text-right text-slate-600">—</td><td className="py-1 text-right text-slate-600">—</td></>
    ) : (
      <><td className={`py-1 pr-2 text-right ${b.y3.min >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.y3.min)}</td><td className={`py-1 pr-2 text-right font-bold ${b.y3.avg >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.y3.avg)}</td><td className={`py-1 pr-2 text-right ${b.y3.max >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{fmtSigned(b.y3.max)}</td><td className={`py-1 text-right font-bold ${b.cagr3 != null && b.cagr3 >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{b.cagr3 == null ? '—' : fmtSigned(b.cagr3)}</td></>
    )}
  </>);
}

const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoYearsAgo = (n: number) => {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

type AssetKey = 'spx' | 'ndx' | 'tqqq';
const ASSETS: { k: AssetKey; label: string; note: string }[] = [
  { k: 'spx', label: 'SP500', note: 'S&P 500 al contado' },
  { k: 'ndx', label: 'Nasdaq', note: 'Nasdaq Composite al contado' },
  { k: 'tqqq', label: 'TQQQ', note: 'TQQQ 3× diario (inception 2010-02-11; decae con volatilidad)' },
];

export function BhtStats() {
  const t = useTranslations('Backtesting.bhtStats');
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [capeBuckets, setCapeBuckets] = useState<CapeBucket[]>([]);
  const [capeTotal, setCapeTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [span, setSpan] = useState('');
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(isoYearsAgo(10));
  const [to, setTo] = useState(isoToday());
  const [asset, setAsset] = useState<AssetKey>('spx');
  const assetLabel = ASSETS.find((a) => a.k === asset)!.label;
  const assetNote = t(`note_${asset}`);
  const RICH = { b: (c: React.ReactNode) => <span className="font-bold text-slate-100">{c}</span>, g: (c: React.ReactNode) => <span className="text-favorable-400 font-bold">{c}</span>, r: (c: React.ReactNode) => <span className="text-risk-400 font-bold">{c}</span> };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ff = fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : []));
    const cf = fetch(`${getApiBase()}/api/backtesting/shiller-daily?from=${from}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : []));
    Promise.all([ff, cf])
      .then(([fj, cj]: any[]) => {
        if (!alive) return;
        const y1k = `${asset}1y`, y3k = `${asset}3y`;
        const rows = (Array.isArray(fj) ? fj : []).filter((r) => r.bhtValue != null && r[y1k] != null && String(r.date).slice(0, 10) <= to);
        const capeByDate = new Map<string, number>();
        for (const c of (Array.isArray(cj) ? cj : [])) {
          const d = String(c.date).slice(0, 10);
          if (c.cape != null && d <= to) capeByDate.set(d, Number(c.cape));
        }
        const bhtGroups = new Map<number, Slot>();
        const capeGroups = new Map<number, Slot>();
        for (const r of rows) {
          const y1 = Number(r[y1k]);
          const y3 = r[y3k] != null ? Number(r[y3k]) : null;
          pushSlot(bhtGroups, Math.floor(Number(r.bhtValue) / 5) * 5, y1, y3);
          const cape = capeByDate.get(String(r.date).slice(0, 10));
          if (cape != null) pushSlot(capeGroups, Math.floor(cape / 2) * 2, y1, y3);
        }
        setBuckets(toBuckets(bhtGroups, rows.length));
        const capeDenom = [...capeGroups.values()].reduce((m, s) => m + s.y1.length, 0);
        setCapeBuckets(toBuckets(capeGroups, capeDenom).map((b) => ({ ...b, score: Math.round(capeRiskScore(b.lo + 1)) })));
        setCapeTotal(capeDenom);
        setTotal(rows.length);
        if (rows.length) setSpan(`${String(rows[0].date).slice(0, 10)} → ${String(rows[rows.length - 1].date).slice(0, 10)}`);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to, asset]);

  if (loading) return <div className="text-[11px] text-slate-500 font-mono">{t('loading')}</div>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="text-[11px] text-slate-400 font-mono">{t('from')}
          <input type="date" value={from} min="1993-01-01" max={to} onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="ml-1.5 px-2 py-1 text-[11px] font-mono rounded-md bg-slate-800 border border-slate-700 text-slate-200 [color-scheme:dark]" />
        </label>
        <label className="text-[11px] text-slate-400 font-mono">{t('to')}
          <input type="date" value={to} min={from} max={isoToday()} onChange={(e) => e.target.value && setTo(e.target.value)}
            className="ml-1.5 px-2 py-1 text-[11px] font-mono rounded-md bg-slate-800 border border-slate-700 text-slate-200 [color-scheme:dark]" />
        </label>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5" title={t('assetTitle')}>
          {ASSETS.map((a) => (
            <button key={a.k} type="button" onClick={() => setAsset(a.k)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition ${asset === a.k ? 'bg-accent-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed mb-2 space-y-1">
        <p>{t.rich('p1', RICH)}</p>
        <p>{t.rich('p2', { ...RICH, asset: assetLabel, note: assetNote })}</p>
        <p>{asset === 'spx' ? t('p3spx') : t('p3other')}{t.rich('compass', RICH)}</p>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        {t('summaryBht', { from, to, n1: total.toLocaleString('en-US'), n3: buckets.reduce((m, b) => m + (b.y3?.n ?? 0), 0).toLocaleString('en-US'), span, asset: assetLabel })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-slate-500 text-left border-b border-slate-800">
              <th className="py-1 pr-2 font-normal">{t('band')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('days')}</th>
              <th className="py-1 pr-2 font-normal text-right">%</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1min')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1avg')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1max')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3min')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3avg')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3max')}</th>
              <th className="py-1 font-normal text-right">{t('y3cagr')}</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.lo} className="border-b border-slate-800/50">
                <td className="py-1 pr-2 text-slate-200 whitespace-nowrap">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: bhtBandColor(b.lo + 2.5) }} />
                  {b.lo}–{b.lo + 5}
                </td>
                <td className="py-1 pr-2 text-right text-slate-300">{b.n.toLocaleString('en-US')}</td>
                <td className="py-1 pr-2 text-right text-slate-300">{b.pct.toFixed(1)}%</td>
                <BucketPerfCells b={b} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed mt-4 mb-2">
        {t.rich('capeIntro', RICH)}
      </p>
      <p className="text-[11px] text-slate-500 mb-2">
        {t('summaryCape', { from, to, n1: capeTotal.toLocaleString('en-US'), n3: capeBuckets.reduce((m, b) => m + (b.y3?.n ?? 0), 0).toLocaleString('en-US'), asset: assetLabel })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-slate-500 text-left border-b border-slate-800">
              <th className="py-1 pr-2 font-normal">CAPE</th>
              <th className="py-1 pr-2 font-normal text-right">{t('score')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('days')}</th>
              <th className="py-1 pr-2 font-normal text-right">%</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1min')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1avg')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y1max')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3min')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3avg')}</th>
              <th className="py-1 pr-2 font-normal text-right">{t('y3max')}</th>
              <th className="py-1 font-normal text-right">{t('y3cagr')}</th>
            </tr>
          </thead>
          <tbody>
            {capeBuckets.map((b) => (
              <tr key={b.lo} className="border-b border-slate-800/50">
                <td className="py-1 pr-2 text-slate-200 whitespace-nowrap">{b.lo}–{b.lo + 2}</td>
                <td className="py-1 pr-2 text-right font-bold" style={{ color: bhtBandColor(b.score) }}>{b.score}</td>
                <td className="py-1 pr-2 text-right text-slate-300">{b.n.toLocaleString('en-US')}</td>
                <td className="py-1 pr-2 text-right text-slate-300">{b.pct.toFixed(1)}%</td>
                <BucketPerfCells b={b} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
