'use client';
import { getApiBase } from '@/lib/apiBase';
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, LineSeries } from 'lightweight-charts';
import { BhtDetailPopover, useBhtDetail, bhtLeaveGuard } from './IndicatorsPanel';
import { BHT_CUTS, bhtBandColor } from './bhtBands';


type RangeKey = '1A' | '3A' | '5A' | '10A';
const RANGE_YEARS: Record<RangeKey, number> = { '1A': 1, '3A': 3, '5A': 5, '10A': 10 };

const C_BHT = '#2dd4bf';
const C_SPX = '#38bdf8';
const C_NDX = '#a78bfa';
const C_TQQQ = '#f472b6';

type Row = { date: string; bht: number | null; spx: number | null; ndx: number | null; tqqq: number | null };

// Banda del semáforo para un valor BHT (cortes ascendentes en ./bhtBands).
const bandOf = (v: number): number => {
  let lo = 0;
  for (const b of BHT_CUTS) { if (v >= b) lo = b; else break; }
  return lo;
};

export function BhtTimeline() {
  const [range, setRange] = useState<RangeKey>('3A');
  const [showSpx, setShowSpx] = useState(true);
  const [showNdx, setShowNdx] = useState(false);
  const [showTqqq, setShowTqqq] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, any>>({});
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  const bhtDet = useBhtDetail();
  const [fwdCache, setFwdCache] = useState<Record<string, any>>({});
  const loadFwd = (d: string) => {
    if (fwdCache[d] !== undefined) return;
    setFwdCache((m) => ({ ...m, [d]: null }));
    const from = new Date(d); from.setDate(from.getDate() - 7);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((fj) => setFwdCache((m) => ({ ...m, [d]: fj.length ? fj[fj.length - 1] : null })))
      .catch(() => {});
  };

  // Una sola carga amplia (11 años: cubre el rango 10A + pan); los rangos son ventanas.
  // Cargar toda la historia (1993→) triplicaba las series y el render inicial.
  const from11 = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 11); return d.toISOString().slice(0, 10); })();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from11}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!alive) return;
        setRows((Array.isArray(j) ? j : []).map((r: any) => ({
          date: String(r.date).slice(0, 10),
          bht: r.bhtValue != null ? Number(r.bhtValue) : null,
          spx: r.spx != null ? Number(r.spx) : null,
          ndx: r.ndx != null ? Number(r.ndx) : null,
          tqqq: r.tqqq != null ? Number(r.tqqq) : null,
        })));
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!containerRef.current || !rows.length) { if (!rows.length) setIsLoaded(true); return; }
    const data = rows;
    const w = containerRef.current.clientWidth || 600;
    const h = containerRef.current.clientHeight || 300;
    const chart = createChart(containerRef.current, {
      width: w, height: h,
      layout: { background: { type: ColorType.Solid, color: '#020617' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(30,41,59,0.3)' }, horzLines: { color: 'rgba(30,41,59,0.3)' } },
      crosshair: { mode: 1, vertLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' }, horzLine: { color: '#14b8a6', width: 1, style: 3, labelBackgroundColor: '#14b8a6' } },
      rightPriceScale: { borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: 'rgba(30,41,59,0.5)', rightOffset: 5, barSpacing: 4, fixLeftEdge: false, fixRightEdge: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;
    // Escala BHT ajustada al min/max de la ventana visible (típico 40-70): se calcula
    // en un solo pase sobre las filas (barato) en vez de reescalar cientos de series.
    const fitLeftToRange = (from: string | null, to: string | null) => {
      try {
        const rows = rowsRef.current;
        const vis = (!from || !to) ? rows : rows.filter((r) => r.date >= from && r.date <= to);
        const vals = vis.map((r) => r.bht).filter((v): v is number => v != null);
        if (!vals.length) return;
        chart.priceScale('left' as any).setVisibleRange({ from: Math.floor(Math.min(...vals) - 3), to: Math.ceil(Math.max(...vals) + 3) } as any);
      } catch { /* noop */ }
    };
    chart.priceScale('left' as any).applyOptions({ borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.12, bottom: 0.12 }, visible: true, autoScale: false } as any);

    const add = (key: string, color: string, priceScaleId: string, lineWidth = 2, lastValueVisible = true) => {
      const s = chart.addSeries(LineSeries as any, { color, lineWidth, priceScaleId, priceLineVisible: false, lastValueVisible, title: key } as any);
      seriesRefs.current[key] = s;
      return s;
    };

    // BHT como línea continua del color del semáforo: se parte en una serie por
    // tramo contiguo (misma banda y sesiones seguidas). Unir tramos lejanos mentía
    // con rectas largas porque esta versión ignora los puntos vacíos.
    // Cada tramo comparte su punto frontera con el vecino (1px del color nuevo):
    // no quedan huecos grises entre tramos.
    const DAY = 86400000;
    const runs: { band: number; pts: { time: string; value: number }[] }[] = [];
    let prevSess: { time: string; value: number } | null = null;
    for (const r of data) {
      if (r.bht == null) continue;
      const b = bandOf(r.bht);
      const pt = { time: r.date as any, value: r.bht };
      const last = runs[runs.length - 1];
      const gapOk = prevSess != null && (new Date(r.date).getTime() - new Date(prevSess.time).getTime()) <= 4 * DAY;
      if (last && last.band === b && gapOk) {
        last.pts.push(pt);
      } else {
        const pts: { time: string; value: number }[] = [];
        if (gapOk && prevSess) pts.push({ ...prevSess });
        pts.push(pt);
        runs.push({ band: b, pts });
      }
      prevSess = pt;
    }
    let firstBht: any = null;
    runs.forEach((run, i) => {
      const s = chart.addSeries(LineSeries as any, {
        color: bhtBandColor(run.band + 0.001), lineWidth: 2, priceScaleId: 'left',
        priceLineVisible: false, lastValueVisible: false,
        pointMarkersVisible: run.pts.length < 2, pointMarkersRadius: 3,
      } as any);
      seriesRefs.current[`bhtrun${i}`] = s;
      s.setData(run.pts as any);
      if (!firstBht) firstBht = s;
    });
    const sSpx = add('spx', C_SPX, 'right', 2);
    const sNdx = add('ndx', C_NDX, 'right', 2);
    const sTqqq = add('tqqq', C_TQQQ, 'right', 2);

    // Línea neutral 50.
    try { (firstBht ?? sSpx).createPriceLine({ price: 50, color: '#e2e8f0', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }); } catch {}

    sSpx.setData(data.map((r) => r.spx == null ? null : { time: r.date as any, value: r.spx }).filter(Boolean) as any);

    // Nasdaq/TQQQ normalizados al rango visible del SPX (como en Apalancamiento).
    const applyScalingForRange = (from: string | null, to: string | null) => {
      try {
        const vis = (!from || !to) ? data : data.filter((r) => r.date >= from && r.date <= to);
        const src = vis.length >= 2 ? vis : data;
        const spxVals = src.map((r) => r.spx).filter((v): v is number => v != null);
        if (!spxVals.length) { sNdx.setData([]); sTqqq.setData([]); return; }
        const sMin = Math.min(...spxVals), sMax = Math.max(...spxVals);
        const norm = (v: number | null, vals: number[]) => {
          if (v == null || !vals.length) return null;
          const mn = Math.min(...vals), mx = Math.max(...vals);
          return sMin + ((v - mn) / ((mx - mn) || 1)) * (sMax - sMin);
        };
        const ndxVals = src.map((r) => r.ndx).filter((v): v is number => v != null);
        const tqqqVals = src.map((r) => r.tqqq).filter((v): v is number => v != null);
        sNdx.setData(src.map((r) => { const v = norm(r.ndx, ndxVals); return v == null ? null : { time: r.date as any, value: v }; }).filter(Boolean) as any);
        sTqqq.setData(src.map((r) => { const v = norm(r.tqqq, tqqqVals); return v == null ? null : { time: r.date as any, value: v }; }).filter(Boolean) as any);
      } catch { /* noop */ }
    };
    try {
      const initTo = data[data.length - 1].date;
      const d = new Date(initTo); d.setFullYear(d.getFullYear() - 3);
      applyScalingForRange(d.toISOString().slice(0, 10), initTo);
    } catch { applyScalingForRange(null, null); }

    chart.timeScale().fitContent();
    setIsLoaded(true);

    const toKey = (t: any) => typeof t === 'string' ? t : typeof t === 'number' ? new Date(t * 1000).toISOString().split('T')[0] : String(t);
    const handler = (param: any) => {
      if (!param.time || !param.point) return;
      const date = toKey(param.time);
      const all = rowsRef.current;
      const row = all.find((r) => r.date === date) || (() => {
        let best = all[0]; let bd = Infinity;
        for (const r of all) { const dd = Math.abs(new Date(r.date).getTime() - new Date(date).getTime()); if (dd < bd) { bd = dd; best = r; } }
        return best;
      })();
      if (!row || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      bhtDet.setHover({ d: row.date, x: rect.left + param.point.x, y: rect.top + param.point.y });
      bhtDet.load(row.date);
      loadFwd(row.date);
    };
    chart.subscribeCrosshairMove(handler);
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        const ww = containerRef.current.clientWidth; const hh = containerRef.current.clientHeight;
        if (ww > 0 && hh > 0) chartRef.current.applyOptions({ width: ww, height: hh });
      }
    });
    const onVisibleRange = () => {
      try {
        const vr = chart.timeScale().getVisibleRange() as any;
        if (vr && vr.from && vr.to) {
          const f = toKey(vr.from), t = toKey(vr.to);
          applyScalingForRange(f, t);
          fitLeftToRange(f, t);
        } else {
          applyScalingForRange(null, null);
          fitLeftToRange(null, null);
        }
      } catch { /* noop */ }
    };
    try { chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRange); } catch { /* noop */ }
    ro.observe(containerRef.current);
    const leave = () => { try { (bhtLeaveGuard as any)({ relatedTarget: null }, bhtDet); } catch { /* noop */ } };
    containerRef.current.addEventListener('mouseleave', leave);
    return () => {
      try { chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRange); } catch { /* noop */ }
      ro.disconnect();
      try { chart.unsubscribeCrosshairMove(handler); } catch { /* noop */ }
      try { containerRef.current?.removeEventListener('mouseleave', leave); } catch { /* noop */ }
      chart.remove(); chartRef.current = null; seriesRefs.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  // Toggles de visibilidad.
  useEffect(() => {
    const vis: Record<string, boolean> = { spx: showSpx, ndx: showNdx, tqqq: showTqqq };
    for (const [k, s] of Object.entries(seriesRefs.current)) {
      if (k.startsWith('bht')) continue;
      try { s.applyOptions({ visible: !!vis[k] } as any); } catch { /* noop */ }
    }
  }, [showSpx, showNdx, showTqqq, isLoaded, rows.length]);

  // Rango visible (3A por defecto).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isLoaded || !rows.length) return;
    const latest = rows[rows.length - 1].date;
    const d = new Date(latest); d.setFullYear(d.getFullYear() - RANGE_YEARS[range]);
    const t = setTimeout(() => {
      try { chart.timeScale().setVisibleRange({ from: d.toISOString().split('T')[0] as any, to: latest as any }); } catch { /* noop */ }
    }, 50);
    return () => clearTimeout(t);
  }, [range, rows.length, isLoaded]);

  const shownAssets = [showSpx && 'SP500', showNdx && 'Nasdaq (esc.)', showTqqq && 'TQQQ (esc.)'].filter(Boolean).join(' + ');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
          {(Object.keys(RANGE_YEARS) as RangeKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setRange(k)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition ${range === k ? 'bg-teal-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
              {k === '1A' ? '1 año' : k === '3A' ? '3 años' : k === '5A' ? '5 años' : '10 años'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
          <button type="button" className="px-2.5 py-1 text-[11px] font-mono rounded-md bg-slate-700 text-slate-100 font-bold">BHT</button>
          <button type="button" onClick={() => setShowSpx((v) => !v)}
            className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition ${showSpx ? 'bg-sky-500/30 text-sky-200 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
            SP500
          </button>
          <button type="button" onClick={() => setShowNdx((v) => !v)}
            className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition ${showNdx ? 'bg-violet-500/30 text-violet-200 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
            NASDAQ
          </button>
          <button type="button" onClick={() => setShowTqqq((v) => !v)}
            className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition ${showTqqq ? 'bg-fuchsia-500/30 text-fuchsia-200 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
            TQQQ
          </button>
        </div>
        {loading && <span className="text-[11px] text-slate-500 font-mono">Cargando…</span>}
      </div>
      <div ref={containerRef} className="w-full h-[300px]" />
      <p className="text-[11px] text-slate-500 mt-1">Evolución del BHT Index al cierre{shownAssets ? ` + ${shownAssets}` : ''} · línea 50 = neutral · pasa el mouse para el detalle · scroll/arrastra para zoom y moverte.</p>
      {bhtDet.hover && (
        <BhtDetailPopover
          hover={bhtDet.hover}
          detail={bhtDet.cache[bhtDet.hover.d]}
          forward={fwdCache[bhtDet.hover.d]}
          onLeave={() => bhtDet.scheduleClear()} onHold={() => bhtDet.cancelClear()}
        />
      )}
    </div>
  );
}
