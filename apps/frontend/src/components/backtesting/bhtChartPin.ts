// Interacción de las gráficas con el detalle del BHT (opción "clic para fijar"):
// - Pasar el cursor: tooltip compacto que ignora el mouse (no bloquea la gráfica).
// - Clic en un punto: fija el popover completo en esa fecha; otro clic lo mueve a otra fecha.
// - ← →: mueven el crosshair un día con dato (y el popover fijo, si está abierto).
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';
import { stepIndex } from '@/lib/chartStep';

export type BhtPoint = { d: string; x: number; y: number };

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
    if (x == null) return null;
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
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const pin = o.pinned();
    if (!over && !pin) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const ds = o.dates();
    const i = stepIndex(ds, pin ?? last?.d, e.key === 'ArrowRight' ? 1 : -1);
    if (i < 0) return;
    e.preventDefault();
    const d = ds[i];
    const apply = (p: BhtPoint) => {
      last = p;
      if (over) o.onTip(p);
      if (pin) o.onPin(p);
    };
    const p = place(d);
    if (p) { apply(p); return; }
    // Fuera de la vista: desplaza la gráfica un día y vuelve a medir.
    const ts = chart.timeScale(), lr = ts.getVisibleLogicalRange();
    if (lr) {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      ts.setVisibleLogicalRange({ from: lr.from + dir, to: lr.to + dir });
    }
    requestAnimationFrame(() => { const q = place(d); if (q) apply(q); });
  };

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
  };
}
