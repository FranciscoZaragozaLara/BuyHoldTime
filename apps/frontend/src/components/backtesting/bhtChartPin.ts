// Interacción de las gráficas con el detalle del BHT (opción "clic para fijar"):
// - Pasar el cursor: tooltip compacto que ignora el mouse (no bloquea la gráfica).
// - Clic en un punto: fija el popover completo en esa fecha; otro clic lo mueve a otra fecha.
// - ← →: mueven el crosshair un día con dato (y el popover fijo, si está abierto).
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';
import { stepIndex } from '@/lib/chartStep';

export type BhtPoint = { d: string; x: number; y: number };
/** Control de navegación del popover fijo (flechas y calendario del encabezado). */
export type BhtPinNav = { step: (dir: 1 | -1) => void; goTo: (d: string) => void; bounds: () => [string, string] | null };

export function timeKey(t: Time | undefined): string | null {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
  const o = t as { year: number; month: number; day: number };
  return `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
}

export function attachBhtChartPin(chart: IChartApi, container: HTMLElement, o: {
  /** Fecha con detalle del BHT para la fecha bajo el cursor (o null si no hay). */
  resolve: (d: string) => string | null;
  /** Fechas navegables con teclado (con BHT), ordenadas. */
  dates: () => string[];
  /** Serie y valor donde se ancla el crosshair al moverse con teclado. */
  anchor: () => { series: ISeriesApi<SeriesType>; value: (d: string) => number | null } | null;
  onTip: (p: BhtPoint | null) => void;
  onPin: (p: BhtPoint) => void;
  pinned: () => string | null;
  /** Recibe el control de navegación (step/goTo) para el encabezado del popover. */
  register?: (nav: BhtPinNav | null) => void;
}): () => void {
  let over = false;
  let last: BhtPoint | null = null;
  // param.point cuenta desde el área de trazo: se suma el ancho del eje izquierdo (0 si no hay).
  const toScreen = (px: number, py: number) => {
    const r = container.getBoundingClientRect();
    return { x: r.left + chart.priceScale('left').width() + px, y: r.top + py };
  };
  const pointFrom = (param: MouseEventParams): BhtPoint | null => {
    const k = timeKey(param.time);
    const d = k ? o.resolve(k) : null;
    return d && param.point ? { d, ...toScreen(param.point.x, param.point.y) } : null;
  };
  const onMove = (param: MouseEventParams) => {
    if (!over) return; // el crosshair puesto por teclado con el mouse fuera no debe mover el tooltip
    const p = pointFrom(param);
    if (p) last = p;
    o.onTip(p);
  };
  const onClick = (param: MouseEventParams) => {
    const p = pointFrom(param);
    if (p) { last = p; o.onPin(p); }
  };
  const enter = () => { over = true; };
  const leave = () => { over = false; o.onTip(null); };

  const place = (d: string): BhtPoint | null => {
    const x = chart.timeScale().timeToCoordinate(d as Time);
    // Fuera del área visible timeToCoordinate devuelve una coordenada fuera de rango (no null): se trata como no visible.
    if (x == null || x < 0 || x > chart.timeScale().width()) return null;
    const a = o.anchor();
    const v = a?.value(d) ?? null;
    let y = last ? last.y - container.getBoundingClientRect().top : container.clientHeight / 2;
    if (a && v != null) {
      try { chart.setCrosshairPosition(v, d as Time, a.series); } catch { /* noop */ }
      const py = a.series.priceToCoordinate(v);
      if (py != null) y = py;
    }
    return { d, ...toScreen(x, y) };
  };
  // Lleva el crosshair (y el popover fijo) a la fecha ds[i]; si está fuera de la vista desplaza la gráfica.
  const goIndex = (ds: string[], i: number, dir: 1 | -1 | 0, forcePin: boolean) => {
    const pin = o.pinned();
    const d = ds[i];
    const apply = (p: BhtPoint) => {
      last = p;
      if (over) o.onTip(p);
      if (pin || forcePin) o.onPin(p);
    };
    const p = place(d);
    if (p) { apply(p); return; }
    const ts = chart.timeScale();
    if (dir !== 0) {
      // Un día fuera de la vista: desplaza la gráfica un día.
      const lr = ts.getVisibleLogicalRange();
      if (lr) ts.setVisibleLogicalRange({ from: lr.from + dir, to: lr.to + dir });
    } else {
      // Salto a una fecha lejana: centra la vista en ella conservando el ancho actual.
      const vr = ts.getVisibleRange();
      const f = timeKey(vr?.from), t = timeKey(vr?.to);
      if (f && t) {
        const half = (Date.parse(t) - Date.parse(f)) / 2, c = Date.parse(d);
        const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
        try { ts.setVisibleRange({ from: iso(c - half) as Time, to: iso(c + half) as Time }); } catch { /* noop */ }
      }
    }
    requestAnimationFrame(() => { const q = place(d); if (q) apply(q); });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const pin = o.pinned();
    if (!over && !pin) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const ds = o.dates();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const i = stepIndex(ds, pin ?? last?.d, dir);
    if (i < 0) return;
    e.preventDefault();
    goIndex(ds, i, dir, false);
  };
  o.register?.({
    step: (dir) => { const ds = o.dates(); const i = stepIndex(ds, o.pinned() ?? last?.d, dir); if (i >= 0) goIndex(ds, i, dir, true); },
    // Fecha elegida en el calendario: el último día con dato ≤ esa fecha (o el primero si es anterior a todos).
    goTo: (d) => { const ds = o.dates(); const i = stepIndex(ds, d, 0); if (i >= 0) goIndex(ds, i, 0, true); },
    bounds: () => { const ds = o.dates(); return ds.length ? [ds[0], ds[ds.length - 1]] : null; },
  });

  chart.subscribeCrosshairMove(onMove);
  chart.subscribeClick(onClick);
  container.addEventListener('mouseenter', enter);
  container.addEventListener('mousemove', enter); // por si el cursor ya estaba encima al recrear la gráfica
  container.addEventListener('mouseleave', leave);
  window.addEventListener('keydown', onKey);
  return () => {
    try { chart.unsubscribeCrosshairMove(onMove); chart.unsubscribeClick(onClick); } catch { /* noop */ }
    container.removeEventListener('mouseenter', enter);
    container.removeEventListener('mousemove', enter);
    container.removeEventListener('mouseleave', leave);
    window.removeEventListener('keydown', onKey);
    o.register?.(null);
  };
}
