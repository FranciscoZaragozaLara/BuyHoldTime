'use client';
// Resumen del día de la página de indicadores: termómetro BHT, tendencia del S&P 500, 4 KPIs de valuación,
// composición del BHT (base + ajustes) y rendimientos históricos de la combinación de hoy (BHT × tendencia).
// Fuente única: /api/backtesting/thermo-live (el mismo cálculo que guarda el BHT); el servidor manda la primera
// lectura para que la página no salga vacía.
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BhtGauge } from '@/components/BhtGauge';
import { BhtReturnsTable } from '@/components/BhtReturnsTable';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { BHT_BANDS, bhtBand } from '@/components/backtesting/bhtBands';
import { TrendBadge } from '@/components/backtesting/TrendBadge';
import { type ThermoLive, useThermoLive } from '@/components/backtesting/useThermoLive';
import { bhtComposition, stampLabel } from '@/lib/bhtComponents';

const T = {
  es: {
    title: 'BHT Index hoy', sub: 'Termómetro de riesgo del mercado (0 = miedo extremo / oportunidad, 100 = euforia / riesgo).',
    spx: 'S&P 500', cape: 'CAPE de Shiller', capeNote: (r: string) => `${r} su media de 3 años`, fwd: 'P/E estimado', fwdNote: 'Precio ÷ EPS a 12 meses (WSJ / Birinyi)',
    pe: 'P/E', peNote: 'Precio ÷ utilidades de 12 meses', close: 'cierre',
    base: (n: number) => `Base ${n} componentes`, hy: 'crédito HY', liq: 'liquidez M2/M0', oil: 'petróleo',
    asOf: 'Datos al', bands: 'Ver todas las bandas', hideBands: 'Ocultar bandas', loading: 'Cargando el termómetro…', error: 'No se pudo leer el termómetro en este momento.',
  },
  en: {
    title: 'BHT Index today', sub: 'Market risk thermometer (0 = extreme fear / opportunity, 100 = euphoria / risk).',
    spx: 'S&P 500', cape: 'Shiller CAPE', capeNote: (r: string) => `${r} its 3-year mean`, fwd: 'Forward P/E', fwdNote: 'Price ÷ 12-month EPS (WSJ / Birinyi)',
    pe: 'P/E', peNote: 'Price ÷ trailing 12-month earnings', close: 'close',
    base: (n: number) => `Base ${n} components`, hy: 'HY credit', liq: 'M2/M0 liquidity', oil: 'oil',
    asOf: 'Data as of', bands: 'Show all bands', hideBands: 'Hide bands', loading: 'Loading the thermometer…', error: 'Could not read the thermometer right now.',
  },
};
// Distancia del cierre a sus SMA 50 y 200 (la regla del régimen, en texto que sí se ajusta al ancho).
const trendRule = (c: number | null, s50: number | null, s200: number | null, loc: 'es' | 'en') => {
  const g = (s: number | null) => (c != null && s ? `${c >= s ? '+' : ''}${((c / s - 1) * 100).toFixed(1)}%` : '—');
  return loc === 'es' ? `Cierre vs SMA 50 ${g(s50)} · vs SMA 200 ${g(s200)}` : `Close vs 50-day SMA ${g(s50)} · vs 200-day SMA ${g(s200)}`;
};
const sgn = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;

export function BhtTodaySummary({ initial, pe }: { initial?: ThermoLive | null; pe?: number | null }) {
  const loc = useLocale() === 'es' ? 'es' : 'en';
  const t = T[loc];
  const ti = useTranslations('Backtesting.indicators');
  const q = useThermoLive(initial);
  const [showBands, setShowBands] = useState(false);
  const th = q.data;
  if (!th) return <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">{q.isError ? t.error : t.loading}</section>;

  const score = th.value ?? 0;
  const band = bhtBand(score);
  const bi = BHT_BANDS.indexOf(band);
  const fwd = th.parts.find((p) => p.key === 'FWD')?.value ?? null;
  const comp = bhtComposition(th.parts, [th.hy.bonus, th.liq.bonus, th.oil.bonus]);
  const spx = th.trend?.close ?? null;
  const ratio = th.cape?.ratio ?? null;
  const kpis: Array<{ label: string; value: string; note: string; cls: string }> = [
    { label: t.spx, value: spx != null ? spx.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', note: th.live?.['^GSPC']?.date ? `${t.close} ${stampLabel(th.live['^GSPC'].date, 'daily', loc)}` : '', cls: 'text-accent-400' },
    { label: t.cape, value: th.cape ? `${th.cape.cape.toFixed(2)}x` : '—', note: ratio != null ? t.capeNote(`${ratio.toFixed(3)}×`) : '', cls: 'text-risk-400' },
    { label: t.pe, value: pe != null && Number.isFinite(pe) ? `${pe.toFixed(2)}x` : '—', note: t.peNote, cls: 'text-caution-400' },
    { label: t.fwd, value: fwd != null ? `${fwd.toFixed(2)}x` : '—', note: t.fwdNote, cls: 'text-favorable-400' },
  ];

  return (
    <section id="bht-hoy" className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t.title}</h2>
          <p className="text-xs text-slate-400">{t.sub}</p>
        </div>
        <span className="text-[11px] text-slate-500">{t.asOf} {stampLabel(th.date, 'daily', loc)}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4">
          <BhtGauge score={score} className="w-full max-w-[300px] shrink-0" ariaLabel={ti('riskAria', { score, label: ti(`bht.b${bi}.label`) })} />
          <div className="text-center sm:text-left lg:text-center xl:text-left">
            <div className="font-mono text-5xl font-bold text-slate-100">{score.toFixed(1)}<span className="text-lg text-slate-500">/100</span></div>
            <div className={`text-base font-semibold mt-1 ${band.textClass}`}>{ti(`bht.b${bi}.label`)}</div>
            {th.trend && <div className="mt-2"><TrendBadge trend={th.trend} size="sm" /></div>}
            {th.trend && <div className="mt-1 text-[11px] text-slate-400">{trendRule(th.trend.close, th.trend.sma50, th.trend.sma200, loc)}</div>}
          </div>
        </div>
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</div>
                <div className={`font-mono text-2xl font-extrabold mt-0.5 ${k.cls}`}>{k.value}</div>
                {k.note && <div className="text-[11px] text-slate-400 mt-0.5">{k.note}</div>}
              </div>
            ))}
          </div>
          <div className="text-[11px] font-mono text-slate-400 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
            {t.base(th.parts.length)} <b className="text-slate-200">{comp.base.toFixed(1)}</b>
            {' '}{sgn(th.hy.bonus)} {t.hy} {sgn(th.liq.bonus)} {t.liq} {sgn(th.oil.bonus)} {t.oil}
            {' '}= <b className="text-slate-100">{score.toFixed(1)}</b>
          </div>
          <div className="rounded-lg bg-slate-800/50 px-3 py-2 text-xs text-slate-300">
            <span className={`font-semibold ${band.textClass}`}>{ti(`bht.b${bi}.label`)} ({band.range}): </span>{ti(`bht.b${bi}.advice`)}
          </div>
          <button type="button" onClick={() => setShowBands((v) => !v)} className="self-start text-[11px] text-accent-400 hover:text-accent-300">{showBands ? t.hideBands : t.bands}</button>
          {showBands && (
            <ul className="space-y-1">
              {BHT_BANDS.map((b, i) => (
                <li key={b.label} className={`px-3 py-1.5 rounded-lg text-xs ${i === bi ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                    <span className={`flex-1 ${i === bi ? 'font-semibold' : ''}`}>{ti(`bht.b${i}.label`)}</span>
                    <span className="font-mono">{b.range}</span>
                  </div>
                  <p className="mt-0.5 pl-5 text-[11px] leading-snug">{ti(`bht.b${i}.advice`)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {th.trend?.regime && <BhtReturnsTable locale={loc} date={th.date} score={score} regime={th.trend.regime} />}
      <RiskDisclaimer variant="signal" className="mt-3" />
    </section>
  );
}
