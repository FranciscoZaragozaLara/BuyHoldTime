'use client';
// Detalle del BHT desde una tabla (BHT Forward, grandes crisis, historial diario) con el mismo diseño que la gráfica:
// el hover abre el popover y, al usar ← → o el calendario (o al hacer clic en el valor), se fija con navegación por
// fecha. Fijado se cierra con ✕, Esc o clic fuera. Las fechas navegables son los días con BHT guardado.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { useBhtDetail, useBhtPin } from './BhtDetail';
import type { BhtPinNav } from './bhtChartPin';

let datesPromise: Promise<string[]> | null = null;
/** Días con BHT (bt_thermo_history), una sola descarga por sesión. */
function bhtDates(): Promise<string[]> {
  if (!datesPromise) {
    datesPromise = fetch(`${getApiBase()}/api/backtesting/thermo-history?from=1990-01-01`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ date: string; value: number | null }>) => rows.filter((x) => x.value != null).map((x) => String(x.date).slice(0, 10)).sort())
      .catch(() => { datesPromise = null; return []; });
  }
  return datesPromise;
}

/** Índice del último día ≤ d (o el primero si d es anterior a toda la historia). */
export function snapIndex(dates: string[], d: string): number {
  let lo = 0, hi = dates.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

export function useBhtTablePin() {
  const det = useBhtDetail();
  const pin = useBhtPin();
  const [dates, setDates] = useState<string[] | null>(null);
  const { setPin } = pin;
  const { load } = det;

  const pinAt = useCallback((d: string, x: number, y: number) => {
    setPin({ d, x, y });
    load(d);
    if (!dates) bhtDates().then((ds) => setDates(ds.length ? ds : null));
  }, [setPin, load, dates]);

  // Navegación: desde el popover fijado o desde el hover (que se fija al navegar).
  const navFor = useCallback((cur: { d: string; x: number; y: number } | null): BhtPinNav | null => {
    if (!cur) return null;
    const goIdx = (i: number, ds: string[]) => { const j = Math.max(0, Math.min(ds.length - 1, i)); det.setHover(null); pinAt(ds[j], cur.x, cur.y); };
    return {
      step: (dir) => {
        if (dates) goIdx(snapIndex(dates, cur.d) + dir, dates);
        else bhtDates().then((ds) => { setDates(ds); if (ds.length) goIdx(snapIndex(ds, cur.d) + dir, ds); });
      },
      goTo: (d) => {
        if (dates) goIdx(snapIndex(dates, d), dates);
        else bhtDates().then((ds) => { setDates(ds); if (ds.length) goIdx(snapIndex(ds, d), ds); });
      },
      bounds: () => (dates && dates.length ? [dates[0], dates[dates.length - 1]] : null),
    };
  }, [dates, det, pinAt]);

  // ← → mueven el día del popover fijado (como en la gráfica).
  const pinnedNav = useMemo(() => navFor(pin.pin), [navFor, pin.pin]);
  useEffect(() => {
    if (!pinnedNav) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); pinnedNav.step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); pinnedNav.step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinnedNav]);

  return {
    det, pin: pin.pin, close: pin.close, pinAt,
    /** Navegación del popover fijado. */
    pinnedNav,
    /** Navegación del popover de hover (al usarla, se fija). */
    hoverNav: navFor(det.hover),
    /** Mostrar el hover solo si no hay uno fijado. */
    showHover: !!det.hover && !pin.pin,
  };
}
