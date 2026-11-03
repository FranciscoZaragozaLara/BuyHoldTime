'use client';
import React, { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts';
import { BhtDetailPopover, useBhtDetail } from './IndicatorsPanel';
import { BHT_CUTS, bhtBandColor } from './bhtBands';
import { bhtLeaveGuard } from './IndicatorsPanel';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

type RangeKey = '1A' | '3A' | '5A' | '10A';
const RANGE_YEARS: Record<RangeKey, number> = { '1A': 1, '3A': 3, '5A': 5, '10A': 10 };
// Puntos visibles por defecto (~252 sesiones/año). El pan recorre toda la historia cargada.
const SPAN_PTS: Record<RangeKey, number> = { '1A': 252, '3A': 756, '5A': 1260, '10A': 2520 };
const MIN_SPAN = 60;

const fmtMoney = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

export function BhtTimeline() {
  const [range, setRange] = useState<RangeKey>('3A');
  const [showSpx, setShowSpx] = useState(true);
  const [rows, setRows] = useState<Array<{ date: string; bht: number | null; spx: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  // Ventana visible: últimos `span` puntos terminando en `end` (null = pegado al último dato).
  const [span, setSpan] = useState(SPAN_PTS['3A']);
  const [end, setEnd] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; end: number } | null>(null);

  const n = rows.length;
  const effEnd = end == null ? n - 1 : Math.min(Math.max(end, 0), n - 1);
  const effSpan = Math.max(MIN_SPAN, Math.min(span, Math.max(n, MIN_SPAN)));
  const start = Math.max(0, Math.min(effEnd - effSpan + 1, Math.max(n - effSpan, 0)));
  const visible = rows.slice(start, start + effSpan);

  // Degradado con los colores/bandas del semáforo mapeados al valor del BHT visible (ver ./bhtBands).
  const bandStops = (() => {
    const vals = visible.map((r) => r.bht).filter((v): v is number => v != null);
    if (!vals.length) return [{ o: 0, c: '#2dd4bf' }, { o: 100, c: '#2dd4bf' }];
    const dmin = Math.min(...vals), dmax = Math.max(...vals);
    if (dmax - dmin < 1e-9) return [{ o: 0, c: bhtBandColor(dmin) }, { o: 100, c: bhtBandColor(dmin) }];
    const stops = [{ o: 0, c: bhtBandColor(dmin) }];
    for (const b of BHT_CUTS) {
      if (b > dmin && b < dmax) {
        const o = ((b - dmin) / (dmax - dmin)) * 100;
        stops.push({ o, c: bhtBandColor(b - 0.001) }, { o, c: bhtBandColor(b + 0.001) });
      }
    }
    stops.push({ o: 100, c: bhtBandColor(dmax) });
    return stops;
  })();
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

  // Una sola carga amplia (toda la historia); los rangos y el pan/zoom son ventanas locales.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=1993-01-01`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!alive) return;
        setRows((Array.isArray(j) ? j : []).map((r: any) => ({
          date: String(r.date).slice(0, 10),
          bht: r.bhtValue != null ? Number(r.bhtValue) : null,
          spx: r.spx != null ? Number(r.spx) : null,
        })));
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Refs para el listener de rueda (evita re-suscribir en cada render).
  const effEndRef = useRef(effEnd);
  effEndRef.current = effEnd;
  const spanRef = useRef(effSpan);
  spanRef.current = effSpan;

  // Zoom con rueda (listener nativo no-pasivo para frenar el scroll de página sobre la gráfica).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!rows.length) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const nn = rows.length;
      const eEnd = Math.min(Math.max(effEndRef.current, 0), nn - 1);
      const eSpan = Math.max(MIN_SPAN, Math.min(spanRef.current, Math.max(nn, MIN_SPAN)));
      const eStart = Math.max(0, Math.min(eEnd - eSpan + 1, Math.max(nn - eSpan, 0)));
      const newSpan = Math.max(MIN_SPAN, Math.min(nn, Math.round(eSpan * (e.deltaY > 0 ? 1.2 : 1 / 1.2))));
      const anchor = eStart + frac * eSpan;
      const newEnd = Math.max(newSpan - 1, Math.min(nn - 1, Math.round(anchor + (1 - frac) * newSpan - 1)));
      setSpan(newSpan);
      setEnd(newEnd >= nn - 1 && newSpan >= nn ? null : newEnd);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [rows.length]);

  // Pan por arrastre.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dr = dragRef.current;
      const el = wrapRef.current;
      if (!dr || !el || !rows.length) return;
      const rect = el.getBoundingClientRect();
      const plotW = Math.max(50, rect.width - 90);
      const dIdx = Math.round((e.clientX - dr.x) / plotW * spanRef.current);
      const nn = rows.length;
      const sp = Math.max(MIN_SPAN, Math.min(spanRef.current, Math.max(nn, MIN_SPAN)));
      setEnd(Math.max(sp - 1, Math.min(nn - 1, dr.end - dIdx)));
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, rows.length]);

  const pickRange = (k: RangeKey) => { setRange(k); setSpan(SPAN_PTS[k]); setEnd(null); };
  const resetView = () => { setSpan(SPAN_PTS[range]); setEnd(null); };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
          {(Object.keys(RANGE_YEARS) as RangeKey[]).map((k) => (
            <button key={k} type="button" onClick={() => pickRange(k)}
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
        </div>
        {loading && <span className="text-[11px] text-slate-500 font-mono">Cargando…</span>}
      </div>
      <div ref={wrapRef} className={`w-full h-[300px] ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        onMouseDown={(e) => { if (e.button !== 0 || !rows.length) return; dragRef.current = { x: e.clientX, end: effEnd }; setDragging(true); }}
        onDoubleClick={resetView} title="Arrastra para moverte en el tiempo · rueda para zoom · doble clic para recentrar">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visible} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            onMouseMove={(s: any, e: any) => {
              if (dragRef.current) return;
              const d = s?.activeLabel;
              if (d && e?.clientX != null) {
                bhtDet.setHover({ d, x: e.clientX, y: e.clientY });
                bhtDet.load(d);
                loadFwd(d);
              }
            }}
            onMouseLeave={(e: any) => bhtLeaveGuard(e, bhtDet)}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={48}
              tickFormatter={(v: string) => new Date(v + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })} />
            <YAxis yAxisId="bht" domain={[(dataMin: number) => Math.floor(dataMin - 3), (dataMax: number) => Math.ceil(dataMax + 3)]} tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
            {showSpx && (
              <YAxis yAxisId="spx" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} tickFormatter={(v: number) => fmtMoney(Number(v))} />
            )}
            <defs>
              <linearGradient id="bhtBand" x1="0" y1="1" x2="0" y2="0">
                {bandStops.map((s, i) => <stop key={i} offset={`${s.o}%`} stopColor={s.c} />)}
              </linearGradient>
            </defs>
            <ReferenceLine yAxisId="bht" y={50} stroke="#334155" strokeDasharray="4 4" />
            <Line yAxisId="bht" type="monotone" dataKey="bht" name="bht" stroke="url(#bhtBand)" strokeWidth={2} dot={false} connectNulls />
            {showSpx && <Line yAxisId="spx" type="monotone" dataKey="spx" name="spx" stroke="#38bdf8" strokeWidth={1.5} dot={false} connectNulls opacity={0.9} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">Evolución del BHT Index al cierre{showSpx ? ' + SP500' : ''} · línea 50 = neutral · pasa el mouse para el detalle · arrastra para moverte en el tiempo · rueda para zoom · doble clic para recentrar.</p>
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
