'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { applyCrisisMarkers, snapToTime } from '@/lib/crisisEvents';

interface CapeRow { date: string; cape: number | null; capeRatio?: number | null; }
interface Props { marketHistory: Record<string, Map<string, number>>; cape?: CapeRow[]; volHistory?: Record<string, Map<string, number>>; }

const COLORS = {
  ratio: '#991b1b',
  spx: '#38bdf8',
  cape: '#f59e0b',
  capeRatio: '#a78bfa',
  ndx: '#06b6d4',
  tqqq: '#ec4899',
  hyOas: '#ea580c',
  msacsr: '#eab308',
  fed: '#c084fc',
  dgs10: '#7dd3fc',
  dgs30: '#5eead4',
  vix: '#f87171',
  fg: '#4ade80',
  obv: '#e879f9',
  fuerza: '#fb7185',
  obvt: '#c4b5fd',
  netadv: '#a3e635',
  updown: '#93c5fd',
  sma50: '#f97316',
  sma200: '#22c55e',
};

export function MarginGdpChart({ marketHistory, cape = [], volHistory = {} }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, any>>({});

  const [range, setRange] = useState<'1Y' | '5Y' | '10Y' | '20Y' | '30Y' | 'ALL'>('5Y');
  const [visible, setVisible] = useState({ ratio: true, spx: true, cape: false, capeRatio: true, ndx: false, tqqq: false, hyOas: false, msacsr: true, fed: false, dgs10: false, dgs30: false, vix: false, fg: false, obv: false, fuerza: false, obvt: false, netadv: false, updown: false, sma50: false, sma200: false });
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
    const msacsrMap = marketHistory['MSACSR'];
    const fedMap = marketHistory['DFEDTARU'];
    const dgs10Map = marketHistory['DGS10'];
    const dgs30Map = marketHistory['DGS30'];
    const vixMap = marketHistory['VIXCLS'];
    const fgMap = marketHistory['FEAR_GREED'];
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
    // Calendario DIARIO (como la gráfica de Regimes): base en cierres diarios del SPX,
    // el resto de series hace forward-fill al último dato disponible (getIdx/getFinra/getGdp).
    const spxDaily = Array.from(spxMap.keys()).sort();
    const firstFinra = Array.from(finraMap.keys()).sort()[0];
    const dates = spxDaily.filter(d => d >= firstFinra);
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
    // MSACSR mensual con forward-fill (igual que resto de series)
    for (const r of rows) r.msacsr = getIdx(msacsrMap, r.date);
    // Tasas FED/10Y/30Y con forward-fill
    for (const r of rows) { r.fed = getIdx(fedMap, r.date); r.dgs10 = getIdx(dgs10Map, r.date); r.dgs30 = getIdx(dgs30Map, r.date); }
    // VIX/F&G diarios con forward-fill corto
    for (const r of rows) { r.vix = getIdx(vixMap, r.date); r.fg = getIdx(fgMap, r.date); }
    // Volumen y amplitud: OBV SPY + Fuerza diaria + Tend-OBV (Z-Score 20d) + NetAdv/UpDown
    const spyCloses = marketHistory['SPY'];
    const spyVols = volHistory['SPY'];
    const obvCumu = new Map<string, number>();
    const fuerzaMap = new Map<string, number>();
    const obvtMap = new Map<string, number>();
    if (spyCloses && spyVols) {
      const ds = Array.from(spyCloses.keys()).sort();
      let acc = 0; let prev: number | null = null;
      const seq: { d: string; obv: number; v: number }[] = [];
      for (const dd of ds) { const c = spyCloses.get(dd); const v = spyVols.get(dd) ?? 0; if (c == null) continue; if (prev != null) { if (c > prev) acc += v; else if (c < prev) acc -= v; } prev = c; obvCumu.set(dd, acc); seq.push({ d: dd, obv: acc, v }); }
      // Fuerza diaria = (OBV_hoy − OBV_ayer) / SMA20(Vol) ; Tend-OBV = Z-Score 20d del OBV
      for (let i = 0; i < seq.length; i++) {
        if (i < 19) continue; // ventana completa de 20 ruedas
        let volSum = 0; let obvSum = 0;
        for (let j = i - 19; j <= i; j++) { volSum += seq[j].v; obvSum += seq[j].obv; }
        const smaVol = volSum / 20;
        if (smaVol > 0) fuerzaMap.set(seq[i].d, (seq[i].obv - seq[i - 1].obv) / smaVol);
        const mean = obvSum / 20;
        let varSum = 0;
        for (let j = i - 19; j <= i; j++) varSum += (seq[j].obv - mean) ** 2;
        const sd = Math.sqrt(varSum / 20);
        if (sd > 0) obvtMap.set(seq[i].d, (seq[i].obv - mean) / sd);
      }
    }
    const sxAdv = marketHistory['SPX_ADV_VOL']; const sxDec = marketHistory['SPX_DEC_VOL'];
    for (const r of rows) {
      r.vol = (spyVols?.get(r.date)) ?? getIdx(spyVols, r.date);
      r.obvV = getIdx(obvCumu, r.date);
      r.fuerza = getIdx(fuerzaMap, r.date);
      r.obvt = getIdx(obvtMap, r.date);
      const a = getIdx(sxAdv, r.date);
      const dd = getIdx(sxDec, r.date);
      r.netadv = (a != null && dd != null && (a !== 0 || dd !== 0)) ? a - dd : null;
      r.updown = (a != null && dd != null && dd > 0) ? a / dd : null;
    }
    // Componentes del ratio: deuda en margen ($B) y PIB nominal ($B SAAR)
    for (const r of rows) { const f = getFinra(r.date); const g = getGdp(r.date); r.mgDebt = f != null ? f / 1000 : null; r.gdpN = g; }
    // Sin escalado global — el escalado se hace dinámico por ventana visible (ver useEffect de chart)
    if (!rows.length) return { rows: [], yMin: 1.5, yMax: 5 };
    const yMin = 1.5, yMax = 5.0;
    return { rows, yMin, yMax };
  }, [marketHistory, cape]);

  const rangeLabel = useMemo(() => {
    if (!allSeries || !allSeries.rows.length) return '—';
    const r = allSeries.rows; return `${r[0].date.slice(0, 10)} → ${r[r.length - 1].date.slice(0, 10)} (${r.length} pts)`;
  }, [allSeries]);

  const [tooltip, setTooltip] = useState<null | { x: number; y: number; date: string; ratio: number | null; spx: number | null; cape: number | null; capeRatio: number | null; mean3y: number | null; ndx: number | null; tqqq: number | null; hyOas: number | null; msacsr: number | null; fed: number | null; dgs10: number | null; dgs30: number | null; vix: number | null; fg: number | null; mgDebt: number | null; gdpN: number | null; vol: number | null; obvV: number | null; fuerza: number | null; obvt: number | null; netadv: number | null; updown: number | null; sma50: number | null; sma200: number | null }>(null);
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
    const sMsacsr = add('msacsr', COLORS.msacsr, 'left', 2, 2 as any);
    const sFed = add('fed', COLORS.fed, 'left', 2, 2 as any);
    const sDgs10 = add('dgs10', COLORS.dgs10, 'left', 2, 2 as any);
    const sDgs30 = add('dgs30', COLORS.dgs30, 'left', 2, 2 as any);
    const sVix = add('vix', COLORS.vix, 'left', 2, 2 as any);
    const sFg = add('fg', COLORS.fg, 'left', 2, 2 as any);
    const sObv = add('obv', COLORS.obv, 'left', 2, 2 as any);
    const sFuerza = add('fuerza', COLORS.fuerza, 'left', 2, 2 as any);
    const sObvt = add('obvt', COLORS.obvt, 'left', 2, 2 as any);
    const sNetadv = add('netadv', COLORS.netadv, 'left', 2, 2 as any);
    const sUpdown = add('updown', COLORS.updown, 'left', 2, 2 as any);
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
        const mCape = getMinMax('cape'); const mCr = getMinMax('capeRatio'); const mNdx = getMinMax('ndx'); const mTqqq = getMinMax('tqqq'); const mHy = getMinMax('hyOas'); const mMsacsr = getMinMax('msacsr'); const mFed = getMinMax('fed'); const mDgs10 = getMinMax('dgs10'); const mDgs30 = getMinMax('dgs30'); const mVix = getMinMax('vix'); const mFg = getMinMax('fg'); const mObv = getMinMax('obvV'); const mFuerza = getMinMax('fuerza'); const mObvt = getMinMax('obvt'); const mNetadv = getMinMax('netadv'); const mUpdown = getMinMax('updown');
        // Aplicar escalado a cada serie
        if (mCape) sCape.setData(toData(mCape,'cape')); else sCape.setData([]);
        if (mCr) sCr.setData(toData(mCr,'capeRatio')); else sCr.setData([]);
        if (mNdx) sNdx.setData(toData(mNdx,'ndx')); else sNdx.setData([]);
        if (mTqqq) sTqqq.setData(toData(mTqqq,'tqqq')); else sTqqq.setData([]);
        if (mHy) sHy.setData(toData(mHy,'hyOas')); else sHy.setData([]);
        // MSACSR: escala fija 0–12m (no dinámica) — si supera 12 se pinta al techo
        if (mMsacsr) sMsacsr.setData(src.map((r:any)=> r.msacsr==null? null : { time: r.date as any, value: yMin + Math.min(r.msacsr,12)/12*(yMax-yMin) }).filter(Boolean) as any); else sMsacsr.setData([]);
        if (mFed) sFed.setData(toData(mFed,'fed')); else sFed.setData([]);
        if (mDgs10) sDgs10.setData(toData(mDgs10,'dgs10')); else sDgs10.setData([]);
        if (mDgs30) sDgs30.setData(toData(mDgs30,'dgs30')); else sDgs30.setData([]);
        if (mVix) sVix.setData(toData(mVix,'vix')); else sVix.setData([]);
        if (mFg) sFg.setData(toData(mFg,'fg')); else sFg.setData([]);
        if (mObv) sObv.setData(toData(mObv,'obvV')); else sObv.setData([]);
        if (mFuerza) sFuerza.setData(toData(mFuerza,'fuerza')); else sFuerza.setData([]);
        if (mObvt) sObvt.setData(toData(mObvt,'obvt')); else sObvt.setData([]);
        if (mNetadv) sNetadv.setData(toData(mNetadv,'netadv')); else sNetadv.setData([]);
        if (mUpdown) sUpdown.setData(toData(mUpdown,'updown')); else sUpdown.setData([]);
      } catch {}
    };

    sRatio.setData(rows.map(r => mapTime(r.ratio, r.date)).filter(Boolean) as any);
    sSpx.setData(rows.map(r => mapTime(r.spx, r.date)).filter(Boolean) as any);
    // Picos/suelos de grandes crisis sobre el SP500 (anclados a puntos mensuales reales)
    applyCrisisMarkers(sSpx as any, createSeriesMarkers as any, snapToTime(rows.map((r:any)=>r.date)));
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
      setTooltip({ x: tx, y: ty, date: row.date, ratio: row.ratio, spx: row.spx, cape: row.cape, capeRatio: row.capeRatio, mean3y: row.mean3y, ndx: row.ndx, tqqq: row.tqqq, hyOas: row.hyOas, msacsr: row.msacsr, fed: row.fed, dgs10: row.dgs10, dgs30: row.dgs30, vix: row.vix, fg: row.fg, mgDebt: row.mgDebt, gdpN: row.gdpN, vol: row.vol, obvV: row.obvV, fuerza: row.fuerza, obvt: row.obvt, netadv: row.netadv, updown: row.updown, sma50: row.sma50, sma200: row.sma200 });
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
    const vis: Record<string, boolean> = { ratio: visible.ratio, spx: visible.spx, cape: visible.cape, capeRatio: visible.capeRatio, ndx: visible.ndx, tqqq: visible.tqqq, hyOas: visible.hyOas, msacsr: visible.msacsr, fed: visible.fed, dgs10: visible.dgs10, dgs30: visible.dgs30, vix: visible.vix, fg: visible.fg, obv: visible.obv, fuerza: visible.fuerza, obvt: visible.obvt, netadv: visible.netadv, updown: visible.updown, sma50: visible.sma50, sma200: visible.sma200 };
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
          <div className="absolute z-50 pointer-events-none bg-slate-950 border border-slate-500 rounded-lg px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/20 min-w-[360px] max-w-[400px]" style={{ left: tooltip.x, top: tooltip.y }}>
            <div className="font-semibold text-white border-b border-slate-600 pb-1.5 mb-1 col-span-2">{new Date(tooltip.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} <span className="font-normal text-slate-300">· {tooltip.date}</span></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-red-300 mt-1">🏦 Apalancamiento</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Margin/GDP</span><span className="text-white font-bold">{tooltip.ratio!=null ? `${tooltip.ratio.toFixed(2)}%` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-300">= Deuda margen</span><span className="text-rose-300 font-semibold">{tooltip.mgDebt!=null ? `$${Number(tooltip.mgDebt).toLocaleString('en-US', { maximumFractionDigits: 0 })}B` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-300">÷ PIB nominal</span><span className="text-indigo-300 font-semibold">{tooltip.gdpN!=null ? `$${(Number(tooltip.gdpN) / 1000).toFixed(1)}T` : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-sky-300 mt-2 pt-1.5 border-t border-slate-700">💹 Mercado</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">SP500</span><span className="text-sky-300 font-semibold">{tooltip.spx!=null ? `$${Number(tooltip.spx).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Nasdaq</span><span className="text-cyan-300 font-semibold">{tooltip.ndx!=null ? `$${Number(tooltip.ndx).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">TQQQ</span><span className="text-pink-300 font-semibold">{tooltip.tqqq!=null ? `$${Number(tooltip.tqqq).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-violet-300 mt-2 pt-1.5 border-t border-slate-700">🏛️ Tasas</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">FED</span><span className="text-purple-300 font-semibold">{tooltip.fed!=null ? `${tooltip.fed.toFixed(2)}%` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">10Y</span><span className="text-sky-200 font-semibold">{tooltip.dgs10!=null ? `${tooltip.dgs10.toFixed(2)}%` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">30Y</span><span className="text-teal-200 font-semibold">{tooltip.dgs30!=null ? `${tooltip.dgs30.toFixed(2)}%` : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-orange-300 mt-2 pt-1.5 border-t border-slate-700">📈 Crédito y vivienda</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">HY OAS</span><span className="text-orange-300 font-semibold">{tooltip.hyOas!=null ? `${tooltip.hyOas.toFixed(2)}%` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">MSACSR</span><span className="text-yellow-300 font-semibold">{tooltip.msacsr!=null ? `${tooltip.msacsr.toFixed(1)} m` : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-emerald-300 mt-2 pt-1.5 border-t border-slate-700">😱 Sentimiento</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">VIX</span><span className="text-red-300 font-semibold">{tooltip.vix!=null ? tooltip.vix.toFixed(2) : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">F&G</span><span className="text-green-300 font-semibold">{tooltip.fg!=null ? tooltip.fg.toFixed(0) : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-amber-300 mt-2 pt-1.5 border-t border-slate-700">📊 Valuación</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">CAPE</span><span className="text-amber-300 font-semibold">{tooltip.cape!=null ? tooltip.cape.toFixed(2) : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">CAPE Ratio</span><span className="text-violet-300 font-semibold">{tooltip.capeRatio!=null ? `${tooltip.capeRatio.toFixed(3)}X` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">CAPE mean3Y</span><span className="text-violet-200 font-semibold">{tooltip.mean3y!=null ? tooltip.mean3y.toFixed(2) : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-slate-300 mt-2 pt-1.5 border-t border-slate-700">📉 Medias SP500</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">SMA50</span><span className="text-orange-300 font-semibold">{tooltip.sma50!=null ? `$${Number(tooltip.sma50).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">SMA200</span><span className="text-green-300 font-semibold">{tooltip.sma200!=null ? `$${Number(tooltip.sma200).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'}</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider col-span-2 text-fuchsia-300 mt-2 pt-1.5 border-t border-slate-700">⚖️ Volumen</div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Vol SPY</span><span className="text-sky-300 font-semibold">{tooltip.vol!=null ? (tooltip.vol>=1e9 ? `${(tooltip.vol/1e9).toFixed(2)}B` : `${(tooltip.vol/1e6).toFixed(1)}M`) : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">OBV</span><span className="text-fuchsia-300 font-semibold">{tooltip.obvV!=null ? (tooltip.obvV>=1e9 ? `${(tooltip.obvV/1e9).toFixed(2)}B` : `${(tooltip.obvV/1e6).toFixed(1)}M`) : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Fuerza</span><span className={tooltip.fuerza!=null && tooltip.fuerza>=0 ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'}>{tooltip.fuerza!=null ? `${tooltip.fuerza>=0?'+':''}${tooltip.fuerza.toFixed(2)}` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Tend-OBV</span><span className={tooltip.obvt!=null && tooltip.obvt>=0 ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'}>{tooltip.obvt!=null ? `${tooltip.obvt>=0?'+':''}${tooltip.obvt.toFixed(2)}σ` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">NetAdv</span><span className={tooltip.netadv!=null && tooltip.netadv>=0 ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'}>{tooltip.netadv!=null ? `${tooltip.netadv>=0?'+':'−'}${(Math.abs(tooltip.netadv)/1e9).toFixed(2)}B` : '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-200">Up/Down</span><span className="text-blue-300 font-semibold">{tooltip.updown!=null ? `${tooltip.updown.toFixed(2)}x` : '—'}</span></div>
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
        <button onClick={()=>toggle('msacsr')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.msacsr ? 'bg-slate-800 border-yellow-500/50 text-yellow-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#eab308]" style={{ borderTop: '2px dashed #eab308' }} /> MSACSR escalado</button>
        <button onClick={()=>toggle('fed')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.fed ? 'bg-slate-800 border-purple-500/50 text-purple-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#c084fc]" style={{ borderTop: '2px dashed #c084fc' }} /> FED escalado</button>
        <button onClick={()=>toggle('dgs10')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.dgs10 ? 'bg-slate-800 border-sky-500/50 text-sky-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#7dd3fc]" style={{ borderTop: '2px dashed #7dd3fc' }} /> 10Y escalado</button>
        <button onClick={()=>toggle('dgs30')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.dgs30 ? 'bg-slate-800 border-teal-500/50 text-teal-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#5eead4]" style={{ borderTop: '2px dashed #5eead4' }} /> 30Y escalado</button>
        <button onClick={()=>toggle('vix')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.vix ? 'bg-slate-800 border-red-500/50 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#f87171]" style={{ borderTop: '2px dashed #f87171' }} /> VIX escalado</button>
        <button onClick={()=>toggle('fg')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.fg ? 'bg-slate-800 border-green-500/50 text-green-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#4ade80]" style={{ borderTop: '2px dashed #4ade80' }} /> F&G escalado</button>
        <button onClick={()=>toggle('obv')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.obv ? 'bg-slate-800 border-fuchsia-500/50 text-fuchsia-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#e879f9]" style={{ borderTop: '2px dashed #e879f9' }} /> OBV escalado</button>
        <button onClick={()=>toggle('fuerza')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.fuerza ? 'bg-slate-800 border-rose-500/50 text-rose-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#fb7185]" style={{ borderTop: '2px dashed #fb7185' }} /> Fuerza escalado</button>
        <button onClick={()=>toggle('obvt')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.obvt ? 'bg-slate-800 border-purple-500/50 text-purple-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#c4b5fd]" style={{ borderTop: '2px dashed #c4b5fd' }} /> Tend-OBV escalado</button>
        <button onClick={()=>toggle('netadv')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.netadv ? 'bg-slate-800 border-lime-500/50 text-lime-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#a3e635]" style={{ borderTop: '2px dashed #a3e635' }} /> NetAdv escalado</button>
        <button onClick={()=>toggle('updown')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.updown ? 'bg-slate-800 border-blue-500/50 text-blue-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#93c5fd]" style={{ borderTop: '2px dashed #93c5fd' }} /> Up/Down escalado</button>
        <button onClick={()=>toggle('sma50')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.sma50 ? 'bg-slate-800 border-orange-500/50 text-orange-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#f97316]" /> SMA50</button>
        <button onClick={()=>toggle('sma200')} className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 border transition ${visible.sma200 ? 'bg-slate-800 border-green-500/50 text-green-200' : 'bg-slate-900 border-slate-700 text-slate-500 opacity-60'}`}><span className="w-3 h-0.5 bg-[#22c55e]" /> SMA200</button>
        {last && <span className="ml-auto font-mono text-slate-400 self-center">Actual {last.ratio.toFixed(2)}% @ {last.date.slice(0,7)}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 text-xs text-slate-500"><span>Scroll/arrastra para zoom • 5Y por defecto • Eje izq Margin/GDP (%) y Cape escalado • Eje der SP500/SMA ($)</span></div>
    </div>
  );
}
