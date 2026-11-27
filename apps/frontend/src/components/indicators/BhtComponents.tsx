'use client';
// Componentes del BHT Index agrupados por categoría: valor, orbe (puntaje con sus bandas e historia), peso, puntos
// que aporta y fecha del dato; al final los ajustes (crédito HY, liquidez y petróleo). Misma fuente que el resumen
// (thermo-live), así que suman exactamente el BHT que se muestra arriba.
import { useLocale } from 'next-intl';
import { ScoreOrb } from '@/components/backtesting/ThermoOrbs';
import { capeScoreColor } from '@/components/backtesting/bhtBands';
import { type ThermoLive, useThermoLive } from '@/components/backtesting/useThermoLive';
import { publicSourceLabel } from '@/lib/dataSources';
import { groupComponents, hyAdjustmentLabel, liqAdjustmentLabel, oilAdjustmentLabel, stampLabel, type LiveStamp } from '@/lib/bhtComponents';
import { PART_ORB_NAME } from '@/lib/orbHistory';
import { PART_BANDS, PART_DEC } from '@/lib/thermoScoring';

const T = {
  es: {
    title: 'Componentes del BHT Index', sub: 'Cada indicador recibe un puntaje de riesgo de 0 a 100 según sus bandas; el BHT es el promedio ponderado más los ajustes. Toca un orbe para ver sus bandas e historia.',
    weight: 'peso', points: 'pts', data: 'dato', adj: 'Ajustes', adjSub: 'Suman o restan puntos al promedio cuando se activan.',
    hy: 'Crédito (modelo Baa)', hyMean: 'Spread Baa − Tesoro 10 años × 1.913, la serie con la que se calibró el BHT. Suma puntos con crédito muy barato (complacencia) o cuando el crédito se tensa.',
    liq: 'Liquidez M2 / M0', liqMean: 'Resta puntos cuando la Fed inyecta dinero y suma cuando lo retira.',
    oil: 'Petróleo WTI', oilMean: 'Contra su media de 36 meses: suma puntos con choques de precio.',
    real: 'HY OAS real', vsMean: 'vs media 36M', loading: 'Cargando componentes…',
  },
  en: {
    title: 'BHT Index components', sub: 'Each indicator gets a 0–100 risk score from its bands; the BHT is the weighted average plus adjustments. Tap an orb to see its bands and history.',
    weight: 'weight', points: 'pts', data: 'data', adj: 'Adjustments', adjSub: 'They add or subtract points from the average when active.',
    hy: 'Credit (Baa model)', hyMean: 'Baa − 10-year Treasury spread × 1.913, the series the BHT was calibrated on. Adds points when credit is very cheap (complacency) or when credit comes under stress.',
    liq: 'M2 / M0 liquidity', liqMean: 'Subtracts points when the Fed adds money and adds them when it drains it.',
    oil: 'WTI oil', oilMean: 'Versus its 36-month mean: adds points on price shocks.',
    real: 'Real HY OAS', vsMean: 'vs 36M mean', loading: 'Loading components…',
  },
};
const sgn = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;

export function BhtComponents({ initial }: { initial?: ThermoLive | null }) {
  const loc = useLocale() === 'es' ? 'es' : 'en';
  const t = T[loc];
  const q = useThermoLive(initial);
  const th = q.data;
  if (!th) return <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">{t.loading}</section>;
  const live: Record<string, LiveStamp> = { ...(th.live ?? {}), ...(th.cape ? { CAPE: { date: th.cape.date, source: 'Shiller' } } : {}) };
  const groups = groupComponents(th.parts, live, loc);
  // Fecha del dato y, solo si es pública, su fuente (src/lib/dataSources.ts).
  const stamp = (s: LiveStamp | null | undefined, cadence: 'daily' | 'monthly' | 'quarterly') => {
    if (!s) return null;
    const src = publicSourceLabel(s.source);
    return <>{t.data} {stampLabel(s.date, cadence, loc)}{src ? ` · ${src}` : ''}</>;
  };

  const adjustments = [
    // Crédito: el valor es la serie del modelo (1.913 × BAA10Y); el HY OAS real de ICE va debajo, solo informativo.
    { key: 'hy', name: t.hy, bonus: th.hy.bonus, mean: t.hyMean, value: th.hy.hy != null ? `${th.hy.hy.toFixed(2)}%` : '—',
      sub: th.hy.real ? `${t.real}: ${th.hy.real.value.toFixed(2)}% · ${stampLabel(th.hy.real.date, 'daily', loc)}` : null,
      extra: hyAdjustmentLabel(th.hy.label, loc), stamp: live.BAA10Y },
    { key: 'liq', name: t.liq, bonus: th.liq.bonus, mean: t.liqMean, value: th.liq.yoy != null ? `M2 ${th.liq.yoy >= 0 ? '+' : ''}${th.liq.yoy.toFixed(1)}%` : '—', extra: th.liq.m0d3 != null ? `M0 Δ3M ${th.liq.m0d3 >= 0 ? '+' : ''}${th.liq.m0d3.toFixed(1)}% · ${liqAdjustmentLabel(th.liq.label, loc)}` : liqAdjustmentLabel(th.liq.label, loc), stamp: undefined },
    { key: 'oil', name: t.oil, bonus: th.oil.bonus, mean: t.oilMean, value: th.oil.price != null ? `$${th.oil.price.toFixed(2)}` : '—', extra: th.oil.label && th.oil.label !== '—' ? oilAdjustmentLabel(th.oil.label, loc) : th.oil.ratio != null ? `×${th.oil.ratio.toFixed(2)} ${t.vsMean}` : '', stamp: live.DCOILWTICO },
  ];

  return (
    <section id="bht-componentes" className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6 scroll-mt-24">
      <h2 className="text-lg font-bold text-white">{t.title}</h2>
      <p className="text-xs text-slate-400 mb-4">{t.sub}</p>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.key} id={`comp-${g.key}`} className="scroll-mt-24">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-200">{g.name}</h3>
              <span className="text-[11px] font-mono text-slate-500">{g.points.toFixed(1)} {t.points}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.rows.map((r) => (
                <div key={r.key} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">{r.name}</div>
                      <div className="font-mono text-xl text-slate-100">{r.display}</div>
                    </div>
                    {PART_BANDS[r.key] && PART_ORB_NAME[r.key]
                      ? <ScoreOrb name={PART_ORB_NAME[r.key]} value={r.value} dec={PART_DEC[r.key] ?? 2} weight={r.weight} score={Math.round(r.score)} bands={PART_BANDS[r.key]} small />
                      : <span className="font-mono font-bold" style={{ color: capeScoreColor(r.score) }}>{r.score.toFixed(0)}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{r.meaning}</p>
                  <div className="flex flex-wrap justify-between gap-x-3 text-[10px] font-mono text-slate-500">
                    <span>{t.weight} {r.weight} ({r.weightPct.toFixed(0)}%) · <span style={{ color: capeScoreColor(r.score) }}>{r.points.toFixed(1)} {t.points}</span></span>
                    <span>{stamp(r.stamp, r.cadence)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div id="comp-adjustments" className="scroll-mt-24">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-200">{t.adj}</h3>
            <p className="text-[11px] text-slate-500">{t.adjSub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {adjustments.map((a) => (
              <div key={a.key} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100">{a.name}</div>
                    <div className="font-mono text-xl text-slate-100">{a.value}</div>
                    {'sub' in a && a.sub && <div className="text-[11px] font-mono text-slate-400">{a.sub}</div>}
                  </div>
                  <span className={`font-mono text-sm font-bold px-2 py-0.5 rounded-full border ${a.bonus > 0 ? 'text-risk-300 border-risk-500/40' : a.bonus < 0 ? 'text-favorable-300 border-favorable-500/40' : 'text-slate-400 border-slate-700'}`}>{sgn(a.bonus)}</span>
                </div>
                {a.extra && <div className="text-[11px] font-mono text-slate-300">{a.extra}</div>}
                <p className="text-[11px] text-slate-400 leading-snug">{a.mean}</p>
                {a.stamp && <div className="text-[10px] font-mono text-slate-500 text-right">{stamp(a.stamp, 'daily')}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
