'use client';
// Secciones inferiores de la página de indicadores: apalancamiento (Margen/PIB), grandes crisis y BHT Forward.
// Cada una se monta al acercarse a la pantalla, así la parte de arriba (BHT de hoy, gráfica y componentes) carga
// rápido y la deuda de margen y los retornos históricos solo se piden si el usuario baja.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { getApiBase } from '@/lib/apiBase';
import { MarginGdpChart } from '@/components/backtesting/MarginGdpChart';
import { CrisisEventsTable } from '@/components/backtesting/CrisisEventsTable';
import { BhtForwardTable } from '@/components/backtesting/BhtForwardTable';
import { type ThermoLive, useThermoLive } from '@/components/backtesting/useThermoLive';

function WhenVisible({ id, minH, children }: { id: string; minH: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Un enlace directo (#apalancamiento) lleva el scroll ahí: el observador la ve y la monta.
    const el = ref.current;
    if (!el || on) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return <div id={id} ref={ref} className="scroll-mt-24" style={on ? undefined : { minHeight: minH }}>{on ? children : null}</div>;
}

// Series de la gráfica Margen/PIB en modo compacto (desde 1997, cuando empieza la deuda de margen de FINRA).
const LEVERAGE_TICKERS = ['FINRA_DEBIT', 'GDP', '^GSPC', 'MSACSR'];
type CapeRows = NonNullable<Parameters<typeof MarginGdpChart>[0]['cape']>;
function LeverageChart() {
  const loc = useLocale();
  const [data, setData] = useState<{ hist: Record<string, Map<string, number>>; cape: CapeRows } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const base = getApiBase(), to = new Date().toISOString().slice(0, 10);
    Promise.all([
      ...LEVERAGE_TICKERS.map((t) => fetch(`${base}/api/backtesting/market-data?ticker=${encodeURIComponent(t)}&from=1997-01-01&to=${to}`)
        .then((r) => (r.ok ? r.json() : [])).then((rows: Array<{ date: string; close: number }>) => [t, new Map(rows.map((x) => [String(x.date).slice(0, 10), Number(x.close)]))] as const)),
      fetch(`${base}/api/backtesting/shiller-daily?from=1997-01-01`).then((r) => (r.ok ? r.json() : [])),
    ]).then((res) => {
      if (!alive) return;
      const cape = res.pop() as CapeRows;
      setData({ hist: Object.fromEntries(res as Array<readonly [string, Map<string, number>]>), cape });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  if (failed) return <div className="text-sm text-slate-500">{loc === 'es' ? 'No se pudo cargar la deuda de margen.' : 'Could not load margin debt.'}</div>;
  if (!data) return <div className="h-[420px] rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />;
  return <MarginGdpChart marketHistory={data.hist} cape={data.cape} compact />;
}

function ForwardTable({ initial }: { initial?: ThermoLive | null }) {
  const th = useThermoLive(initial).data;
  // BhtForwardTable lee el BHT en vivo de una ref (fila de hoy); se arma con el termómetro de la página.
  const live = useRef<{ v: number | null; d: string | null; trend?: ThermoLive['trend'] }>({ v: null, d: null, trend: null });
  useEffect(() => { live.current = { v: th?.value ?? null, d: th?.date ?? null, trend: th?.trend ?? null }; }, [th]);
  return <BhtForwardTable live={live} />;
}

export function IndicatorsLowerSections({ initial }: { initial?: ThermoLive | null }) {
  const es = useLocale() === 'es';
  return (
    <>
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">{es ? 'Apalancamiento: deuda de margen / PIB' : 'Leverage: margin debt / GDP'}</h2>
          <p className="text-xs text-slate-400">{es ? 'Deuda en cuentas de margen (FINRA) contra el tamaño de la economía. Arriba de 3.5% fue zona de peligro antes de 2000, 2007 y 2021.' : 'Margin account debt (FINRA) relative to the size of the economy. Above 3.5% was the danger zone before 2000, 2007 and 2021.'}</p>
        </div>
        <WhenVisible id="apalancamiento" minH={480}><LeverageChart /></WhenVisible>
      </section>
      <WhenVisible id="crisis" minH={320}><CrisisEventsTable /></WhenVisible>
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">{es ? '¿Funciona el BHT? Retornos posteriores' : 'Does the BHT work? Subsequent returns'}</h2>
          <p className="text-xs text-slate-400">{es ? 'Para cada día: el BHT de ese día y lo que hicieron el S&P 500, el Nasdaq-100 y TQQQ a 1, 2, 3 y 5 años.' : 'For each day: that day’s BHT and what the S&P 500, Nasdaq-100 and TQQQ did over 1, 2, 3 and 5 years.'}</p>
        </div>
        <WhenVisible id="bht-forward" minH={480}><ForwardTable initial={initial} /></WhenVisible>
      </section>
    </>
  );
}
