'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, IChartApi, LineSeries } from 'lightweight-charts';

interface CapeRow { date: string; cape: number | null; capeRatio?: number | null; }
interface Props { marketHistory: Record<string, Map<string, number>>; cape?: CapeRow[]; }

const COLORS = {
  ratio: '#991b1b',
  spx: '#38bdf8',
  cape: '#f59e0b',
  capeRatio: '#a78bfa',
  ndx: '#06b6d4',
  tqqq: '#ec4899',
  hyOas: '#ea580c',
  sma50: '#f97316',
  sma200: '#22c55e',
};

export function MarginGdpChart({ marketHistory, cape = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, any>>({});

  const [range, setRange] = useState<'1Y' | '5Y' | '10Y' | '20Y' | '30Y' | 'ALL'>('5Y');
  const [visible, setVisible] = useState({ ratio: true, spx: true, cape: false, capeRatio: true, ndx: false, tqqq: false, hyOas: false, sma50: false, sma200: false });
  const toggle = (k: keyof typeof visible) => setVisible(v => ({ ...v, [k]: !v[k] }));

  const getIdxPrice = (ticker: string, iso: string): number | null => {
    const m = marketHistory[ticker];
    if (!m) return null;
    for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = m.get(k); if (v != null) return v; }
    let best: string | null = null; for (const k of m.keys()) if (k <= iso && (best == null || k > best)) best = k;
    return best ? m.get(best)! : null;
  };

  // Construir datos base (misma lógica que antes pero sin filtrar por ventana)
  const allSeries = useMemo(() => {
    const finraMap = marketHistory['FINRA_DEBIT'];
    const gdpMap = marketHistory['GDP'];
    const spxMap = marketHistory['^GSPC'];
    if (!finraMap || !gdpMap || !spxMap) return null;
    const capeMap = new Map<string, number>();
    const capeRatioMap = new Map<string, number>();
    const mean3yMap = new Map<string, number>();
    for (const r of cape) { const k = String(r.date).slice(0, 10); if (r.cape != null) capeMap.set(k, Number(r.cape)); if ((r as any).capeRatio != null) capeRatioMap.set(k, Number((r as any).capeRatio)); const m = (r as any).mean3y ?? (r as any).mean; if(m!=null) mean3yMap.set(k, Number(m)); }
    const getCape = (iso: string): number | null => {
      for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = capeMap.get(k); if (v != null) return v; }
      let best: string | null = null; for (const k of capeMap.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? capeMap.get(best)! : null;
    };
    const getMean3y = (iso: string): number | null => {
      for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = mean3yMap.get(k); if (v != null) return v; }
      let best: string | null = null; for (const k of mean3yMap.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? mean3yMap.get(best)! : null;
    };
    const getCapeRatio = (iso: string): number | null => {
      for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = capeRatioMap.get(k); if (v != null) return v; }
      let best: string | null = null; for (const k of capeRatioMap.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? capeRatioMap.get(best)! : null;
    };
    const ndxMap = marketHistory['^IXIC'];
    const tqqqMap = marketHistory['TQQQ'];
    const hyOasMap = marketHistory['BAMLH0A0HYM2'];
    const getIdx = (mp: Map<string, number> | undefined, iso: string): number | null => {
      if (!mp) return null;
      for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = mp.get(k); if (v != null) return v; }
      let best: string | null = null; for (const k of mp.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? mp.get(best)! : null;
    };
    const spxAllDates = Array.from(spxMap.keys()).sort();
    const spxAllCloses = spxAllDates.map(d => spxMap.get(d)!);
    const smaMap50 = new Map<string, number>();
    const smaMap200 = new Map<string, number>();
    for (let i = 0; i < spxAllDates.length; i++) {
      if (i >= 49) { let s = 0; for (let j = i - 49; j <= i; j++) s += spxAllCloses[j]; smaMap50.set(spxAllDates[i], s / 50); }
      if (i >= 199) { let s = 0; for (let j = i - 199; j <= i; j++) s += spxAllCloses[j]; smaMap200.set(spxAllDates[i], s / 200); }
    }
    const getSma = (m: Map<string, number>, iso: string): number | null => {
      for (let i = 0; i < 7; i++) { const d = new Date(iso); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); const v = m.get(k); if (v != null) return v; }
      let best: string | null = null; for (const k of m.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? m.get(best)! : null;
    };
    const dates = Array.from(finraMap.keys()).sort();
    const rows: any[] = [];
    const getFinra = (iso: string): number | null => {
      if (finraMap.has(iso)) return finraMap.get(iso)!;
      let best: string | null = null;
      for (const k of finraMap.keys()) if (k <= iso && (best==null || k>best)) best=k;
      return best ? finraMap.get(best)! : null;
    };
    const getGdp = (iso: string): number | null => {
      let best: string | null = null;
      for (const k of gdpMap.keys()) if (k <= iso && (best == null || k > best)) best = k;
      return best ? gdpMap.get(best)! : null;
    };
    for (const d of dates) {
      const finra = getFinra(d);
      const gdp = getGdp(d);
      if (finra != null && gdp != null && gdp !== 0) {
        const ratio = (finra / 1000) / gdp * 100;
        const spx = (() => { if (!spxMap) return null; for (let i = 0; i < 7; i++) { const dd = new Date(d); dd.setDate(dd.getDate() - i); const k = dd.toISOString().slice(0, 10); const v = spxMap.get(k); if (v != null) return v; } let b: string | null = null; for (const k of spxMap.keys()) if (k <= d && (b == null || k > b)) b = k; return b ? spxMap.get(b)! : null; })();
        rows.push({ date: d, time: d, ratio: Number(ratio.toFixed(3)), spx, cape: getCape(d), capeRatio: getCapeRatio(d), mean3y: getMean3y(d), ndx: getIdx(ndxMap, d), tqqq: getIdx(tqqqMap, d), hyOas: getIdx(hyOasMap, d), sma50: getSma(smaMap50, d), sma200: getSma(smaMap200, d) });
      }
    }
    // Complementar hasta hoy con forward-fill de FINRA/GDP para que no trunque en junio
    try {
      const lastFinra = dates[dates.length-1];
      const spxDates = spxMap ? Array.from(spxMap.keys()).sort() : [];
      const lastSpx = spxDates.length ? spxDates[spxDates.length-1] : null;
      const extraDates: string[] = [];
      if (lastSpx && lastFinra < lastSpx) {
        const candidates = ['2026-08-01', lastSpx];
        for (const cand of candidates) if (cand > lastFinra && !dates.includes(cand)) extraDates.push(cand);
        if (!extraDates.length && lastSpx) {
          const d = new Date(lastSpx); d.setDate(1);
          const firstOfMonth = d.toISOString().slice(0,10);
          if (firstOfMonth > lastFinra && !dates.includes(firstOfMonth)) extraDates.push(firstOfMonth);
        }
      }
      for (const d of extraDates) {
        const finra = getFinra(d);
        const gdp = getGdp(d);
        if (finra==null || gdp==null || gdp===0) continue;
        if (rows.some(r=>r.date===d)) continue;
        const ratio = (finra/1000)/gdp*100;
        const spx = (() => { if (!spxMap) return null; for (let i=0;i<7;i++){ const dd=new Date(d); dd.setDate(dd.getDate()-i); const k=dd.toISOString().slice(0,10); const v=spxMap.get(k); if(v!=null) return v; } let b:string|null=null; for(const k of spxMap.keys()) if(k<=d && (b==null||k>b)) b=k; return b? spxMap.get(b)!:null; })();
        rows.push({ date: d, time: d, ratio: Number(ratio.toFixed(3)), spx, cape: getCape(d), capeRatio: getCapeRatio(d), mean3y: getMean3y(d), ndx: getIdx(ndxMap, d), tqqq: getIdx(tqqqMap, d), hyOas: getIdx(hyOasMap, d), sma50: getSma(smaMap50, d), sma200: getSma(smaMap200, d) });
      }
      rows.sort((a,b)=> a.date.localeCompare(b.date));
    } catch {}
    // Sin escalado global — el escalado se hace dinámico por ventana visible (ver useEffect de chart)
    if (!rows.length) return { rows: [], yMin: 1.5, yMax: 5 };
    const yMin = 1.5, yMax = 5.0;
    return { rows, yMin, yMax };
  }, [marketHistory, cape]);

  const rangeLabel = useMemo(() => {
    if (!allSeries || !allSeries.rows.length) return '—';
    const r = allSeries.rows; return `${r[0].date.slice(0, 10)} → ${r[r.length - 1].date.slice(0, 10)} (${r.length} pts)`;
  }, [allSeries]);

  const [tooltip, setTooltip] = useState<null | { x: number; y: number; date: string; ratio: number | null; spx: number | null; cape: number | null; capeRatio: number | null; mean3y: number | null; ndx: number | null; tqqq: number | null; hyOas: number | null; sma50: number | null; sma200: number | null }>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !allSeries || !allSeries.rows.length) { setIsLoaded(true); return; }
    const rows = allSeries.rows;
    const w = containerRef.current.clientWidth || 600;
    const h = containerRef.current.clientHeight || 440;
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

    // Helper para crear series — respeta visible inicial
    const add = (key: string, color: string, priceScaleId: string, lineWidth = 2, lineStyle = 0 as any) => {
      const vis = (visible as any)[key];
      const s = chart.addSeries(LineSeries as any, { color, lineWidth, lineStyle, priceScaleId, priceLineVisible: false, lastValueVisible: true, title: key, visible: vis !== false } as any);
      seriesRefs.current[key] = s;
      return s;
    };

    // Eje izquierdo para ratio/CAPE (comparten priceScale left)
    chart.priceScale('left' as any).applyOptions({ borderColor: 'rgba(30,41,59,0.5)', scaleMargins: { top: 0.12, bottom: 0.12 }, visible: true } as any);

    const mapTime = (v: number | null, date: string) => v == null ? null : { time: date as any, value: v };

    // Series: ratio en left, resto según visible pero preparamos todas
    const sRatio = add('ratio', COLORS.ratio, 'left', 2);
    const sSpx = add('spx', COLORS.spx, 'right', 2);
    const sCape = add('cape', COLORS.cape, 'left', 2);
    const sCr = add('capeRatio', COLORS.capeRatio, 'left', 2);
    const sNdx = add('ndx', COLORS.ndx, 'left', 2);
    const sTqqq = add('tqqq', COLORS.tqqq, 'left', 2);
    const sHy = add('hyOas', COLORS.hyOas, 'left', 2, 2 as any);
    const sSma50 = add('sma50', COLORS.sma50, 'right', 2);
    const sSma200 = add('sma200', COLORS.sma200, 'right', 2);

    const yMin = allSeries.yMin, yMax = allSeries.yMax;
    // Escalado dinámico por ventana visible — Nasdaq/TQQQ/CAPE/HY dejan de verse planos
    const applyScalingForRange = (from: string | null, to: string | null) => {
      try {
        const visibleRows = (!from || !to) ? rows : rows.filter(r => r.date >= from && r.date <= to);
        const src = visibleRows.length >= 2 ? visibleRows : rows;
        const getMinMax = (key: string) => {
          const vals = src.map((r: any) => r[key]).filter((v: any) => v != null);
          if (!vals.length) return null;
          return { min: Math.min(...vals), max: Math.max(...vals) };
        };
        const toData = (m: {min:number,max:number}|null, key:string) => {
          if (!m) return [];
          const range = m.max - m.min || 1;
          return src.map((r:any)=> r[key]==null? null : { time: r.date as any, value: yMin + (r[key]-m.min)/range*(yMax-yMin) }).filter(Boolean) as any;
        };
        const mCape = getMinMax('cape'); const mCr = getMinMax('capeRatio'); const mNdx = getMinMax('ndx'); const mTqqq = getMinMax('tqqq'); const mHy = getMinMax('hyOas');
        // Aplicar escalado a cada serie
        if (mCape) sCape.setData(toData(mCape,'cape')); else sCape.setData([]);
        if (mCr) sCr.setData(toData(mCr,'capeRatio')); else sCr.setData([]);
        if (mNdx) sNdx.setData(toData(mNdx,'ndx')); else sNdx.setData([]);
        if (mTqqq) sTqqq.setData(toData(mTqqq,'tqqq')); else sTqqq.setData([]);
        if (mHy) sHy.setData(toData(mHy,'hyOas')); else sHy.setData([]);
      } catch {}
    };

    sRatio.setData(rows.map(r => mapTime(r.ratio, r.date)).filter(Boolean) as any);
    sSpx.setData(rows.map(r => mapTime(r.spx, r.date)).filter(Boolean) as any);
    // Inicial: escalar según ventana inicial (5Y por defecto)
    try {
      const initTo = rows[rows.length-1].date;
      const d = new Date(initTo); d.setFullYear(d.getFullYear()-5);
      applyScalingForRange(d.toISOString().slice(0,10), initTo);
    } catch { applyScalingForRange(null,null); }
    sSma50.setData(rows.map(r => mapTime(r.sma50, r.date)).filter(Boolean) as any);
    sSma200.setData(rows.map(r => mapTime(r.sma200, r.date)).filter(Boolean) as any);

    chart.timeScale().fitContent();
    setIsLoaded(true);

    const handler = (param: any) => {
      if (!param.time || !param.point) { setTooltip(null); return; }
      const toKey = (t: any) => typeof t === 'string' ? t : typeof t === 'number' ? new Date(t * 1000).toISOString().split('T')[0] : String(t);
      const date = toKey(param.time);
      const row = rows.find(r => r.date === date) || (() => {
        let best = rows[0]; let bd = Infinity;
        for (const r of rows) { const d = Math.abs(new Date(r.date).getTime() - new Date(date).getTime()); if (d < bd) { bd = d; best = r; } }
        return best;
      })();
      if (!row) { setTooltip(null); return; }
      const rect = containerRef.current?.getBoundingClientRect();
      const cw = rect?.width ?? 600;
      const tx = Math.max(8, Math.min(param.point.x + 16, cw - 260));
      const ty = Math.max(8, Math.min(param.point.y - 90, 360));
      setTooltip({ x: tx, y: ty, date: row.date, ratio: row.ratio, spx: row.spx, cape: row.cape, capeRatio: row.capeRatio, mean3y: row.mean3y, ndx: row.ndx, tqqq: row.tqqq, hyOas: row.hyOas, sma50: row.sma50, sma200: row.sma200 });
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
          const toStr = (v:any)=> typeof v==='string'? v : typeof v==='number'? new Date(v*1000).toISOString().slice(0,10) : String(v);
          applyScalingForRange(toStr(vr.from), toStr(vr.to));
        } else applyScalingForRange(null,null);
      } catch {}
    };
    try { chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRange); } catch {}
    ro.observe(containerRef.current);
    return () => { try { chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRange); } catch {} ro.disconnect(); try { chart.unsubscribeCrosshairMove(handler); } catch {} chart.remove(); chartRef.current = null; seriesRefs.current = {}; setTooltip(null); };
  }, [allSeries]);

  // Visibilidad toggle (show/hide series) — debe correr también tras montar el chart
  useEffect(() => {
    const vis: Record<string, boolean> = { ratio: visible.ratio, spx: visible.spx, cape: visible.cape, capeRatio: visible.capeRatio, ndx: visible.ndx, tqqq: visible.tqqq, hyOas: visible.hyOas, sma50: visible.sma50, sma200: visible.sma200 };
    for (const [k, s] of Object.entries(seriesRefs.current)) {
      try { s.applyOptions({ visible: !!vis[k] } as any); } catch {}
    }
  }, [visible, isLoaded, allSeries]);

  // Rango visible igual que EquityChart (1Y/5Y/ALL + 10Y/20Y/30Y como extensión)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isLoaded || !allSeries || !allSeries.rows.length) return;
    const all = allSeries.rows.map(r => r.date).sort();
    const latest = all[all.length - 1];
    const latestDate = new Date(latest);
    let from: Date | null = null;
    if (range === '1Y') { from = new Date(latestDate); from.setFullYear(from.getFullYear() - 1); }
    else if (range === '5Y') { from = new Date(latestDate); from.setFullYear(from.getFullYear() - 5); }
    else if (range === '10Y') { from = new Date(latestDate); from.setFullYear(from.getFullYear() - 10); }
    else if (range === '20Y') { from = new Date(latestDate); from.setFullYear(from.getFullYear() - 20); }
    else if (range === '30Y') { from = new Date(latestDate); from.setFullYear(from.getFullYear() - 30); }
    else if (range === 'ALL') { from = null; }
    const t = setTimeout(() => {
      try {
        if (from) chart.timeScale().setVisibleRange({ from: from.toISOString().split('T')[0] as any, to: latest as any });
        else chart.timeScale().fitContent();
      } catch {}
    }, 50);
    return () => clearTimeout(t);
  }, [range, allSeries, isLoaded]);

  const last = allSeries?.rows?.[allSeries.rows.length - 1] ?? null;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-100">Evolución del Apalancamiento: Margin Debt to GDP Ratio — {rangeLabel}</h3>
        <div className="flex gap-1">
          {(['1Y','5Y','10Y','20Y','30Y','ALL'] as const).map(r=>(
            <button key={r} onClick={()=>setRange(r)} className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${range===r ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="relative w-full h-[440px] overflow-visible">
        <div ref={containerRef} className="w-full h-full relative z-0" />
        {/* Semaforización fondo por encima del canvas (lightweight-charts tiene bg sólido #020617) */}
        <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden z-[15]" style={{ left: 52, right: 62, top: 0, bottom: 30 }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: '0 0 12%' }} />
            {/* Rojo peligro >3.5 (top 42.86% del dominio 1.5-5.0) */}
            <div style={{ flex: '0 0 32.57%', background: 'rgba(239,68,68,0.16)', borderTop: '1px solid rgba(239,68,68,0.32)', borderBottom: '1px solid rgba(239,68,68,0.32)' }} />
            {/* Neutro 2.5-3.5 */}
            <div style={{ flex: '0 0 21.71%' }} />
            {/* Verde claro 1.5-2.5 (bottom 28.57% del dominio) */}
            <div style={{ flex: '0 0 21.71%', background: 'rgba(34,197,94,0.22)', borderTop: '1px solid rgba(34,197,94,0.40)', borderBottom: '1px solid rgba(34,197,94,0.40)' }} />
            <div style={{ flex: '0 0 12%' }} />
          </div>
        </div>
        {tooltip && (
          <div className="absolute z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 min-w-[240px]" style={{ left: tooltip.x, top: tooltip.y }}>
            <div className="font-semibold text-slate-100 border-b border-slate-700 pb-1.5 mb-1.5">{new Date(tooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} <span className="font-normal text-slate-400">· {tooltip.date}</span></div>
            <div className="flex justify-between gap-4 font-mono"><span className="text-slate-400">Margin/GDP</span><span className="text-white font-bold">{tooltip.ratio!=null ? `${tooltip.ratio.toFixed(2)}%` : '—'}</span></div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-700 grid grid-cols-1 gap-1 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">SP500</span><span className="text-sky-300">{tooltip.spx!=null ? `$${Number(tooltip.spx).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Nasdaq</span><span className="text-sky-300">{tooltip.ndx!=null ? `$${Number(tooltip.ndx).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TQQQ</span><span className="text-sky-300">{tooltip.tqqq!=null ? `$${Number(tooltip.tqqq).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-orange-400">HY OAS</span><span className="text-orange-300">{tooltip.hyOas!=null ? `${tooltip.hyOas.toFixed(2)}%` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-amber-400">CAPE</span><span className="text-amber-300">{tooltip.cape!=null ? tooltip.cape.toFixed(2) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-violet-400">CAPE Ratio</span><span className="text-violet-300">{tooltip.capeRatio!=null ? `${tooltip.capeRatio.toFixed(3)}X` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-violet-300">CAPE mean3Y</span><span className="text-violet-200">{tooltip.mean3y!=null ? tooltip.mean3y.toFixed(2) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-orange-400">SMA50 SP500</span><span className="text-orange-300">{tooltip.sma50!=null ? `$${Number(tooltip.sma50).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-green-400">SMA200 SP500</span><span className="text-green-300">{tooltip.sma200!=null ? `$${Number(tooltip.sma200).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-200">
        <span className="flex items-center gap-1.5 text-slate-100 select-none"><span className="w-3 h-3 rounded-sm bg-[#22c55e]/30 border border-[#22c55e]/60 shadow-sm" /> Zona Normal (1.5-2.5)</span>
        <span className="flex items-center gap-1.5 text-slate-100 select-none"><span className="w-3 h-3 rounded-sm bg-[#ef4444]/30 border border-[#ef4444]/60 shadow-sm" /> Zona Peligro (&gt;3.5)</span>
        <button onClick={()=>toggle('ratio')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.ratio ? 'bg-slate-800 border-[#991b1b]/50 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#991b1b]" /> Apalancamiento/PIB</button>
        <button onClick={()=>toggle('spx')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.spx ? 'bg-slate-800 border-sky-500/50 text-sky-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#38bdf8]" /> SP500</button>
        <button onClick={()=>toggle('cape')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.cape ? 'bg-slate-800 border-amber-500/50 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#f59e0b]" style={{ borderTop: '2px dashed #f59e0b' }} /> CAPE escalado</button>
        <button onClick={()=>toggle('capeRatio')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.capeRatio ? 'bg-slate-800 border-violet-500/50 text-violet-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#a78bfa]" style={{ borderTop: '2px dashed #a78bfa' }} /> CAPE Ratio escalado</button>
        <button onClick={()=>toggle('ndx')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.ndx ? 'bg-slate-800 border-cyan-500/50 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#06b6d4]" style={{ borderTop: '2px dashed #06b6d4' }} /> Nasdaq escalado</button>
        <button onClick={()=>toggle('tqqq')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.tqqq ? 'bg-slate-800 border-pink-500/50 text-pink-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#ec4899]" style={{ borderTop: '2px dashed #ec4899' }} /> TQQQ escalado</button>
        <button onClick={()=>toggle('hyOas')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.hyOas ? 'bg-slate-800 border-orange-600/50 text-orange-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#ea580c]" style={{ borderTop: '2px dashed #ea580c' }} /> HY OAS escalado</button>
        <button onClick={()=>toggle('sma50')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.sma50 ? 'bg-slate-800 border-orange-500/50 text-orange-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#f97316]" /> SMA50</button>
        <button onClick={()=>toggle('sma200')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.sma200 ? 'bg-slate-800 border-green-500/50 text-green-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#22c55e]" /> SMA200</button>
        {last && <span className="ml-auto font-mono text-slate-400 self-center">Actual {last.ratio.toFixed(2)}% @ {last.date.slice(0,7)}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 text-xs text-slate-500"><span>Scroll/arrastra para zoom • 5Y por defecto • Eje izq Margin/GDP (%) y Cape escalado • Eje der SP500/SMA ($)</span></div>
    </div>
  );
}
