'use client';
// Detalle del cálculo del BHT de hoy (se restauró del antiguo termómetro de la pestaña de indicadores): historia mensual
// del BHT y la tabla indicador · valor · puntaje · peso · aporte, con los ajustes de crédito, liquidez y petróleo y la
// fórmula final. Misma fuente que el resumen (thermo-live), así que suma exactamente el BHT de arriba.
import { Fragment, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { BhtHistoryBlock, ScoreOrb } from '@/components/backtesting/ThermoOrbs';
import { capeScoreColor } from '@/components/backtesting/bhtBands';
import type { ThermoLive } from '@/components/backtesting/useThermoLive';
import { hyAdjustmentLabel, liqAdjustmentLabel, oilAdjustmentLabel, PART_EXPLAIN, PART_META } from '@/lib/bhtComponents';
import { PART_ORB_NAME } from '@/lib/orbHistory';
import { PART_BANDS, PART_DEC, partLabel } from '@/lib/thermoScoring';
import { BAND_ONLY_PARTS, bandOnlyText } from '@/lib/bandOnly';

const sgn = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const adjCls = (b: number) => (b > 0 ? 'text-risk-300' : b < 0 ? 'text-favorable-300' : 'text-slate-500');

// (i) de cada fila: al tocarla se abre la explicación sencilla del indicador en una fila debajo (dentro de la tabla,
// que tiene scroll horizontal y recortaría un globo flotante).
function InfoButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label} title={label}
      className={`ml-1.5 align-middle transition-colors ${open ? 'text-accent-300' : 'text-slate-500 hover:text-accent-400'}`}>
      <Info size={12} />
    </button>
  );
}

export function BhtCalcDetail({ th }: { th: ThermoLive }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale() === 'es' ? 'es' : 'en';
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const infoLabel = loc === 'es' ? '¿Qué es este indicador?' : 'What is this indicator?';
  const explainRow = (k: string) => open.has(k) && PART_EXPLAIN[k] ? (
    <tr className="border-b border-slate-800/60 bg-slate-900/50">
      <td colSpan={5} className="px-3 py-2 font-sans text-[11px] leading-relaxed text-slate-300 whitespace-normal">{PART_EXPLAIN[k][loc]}</td>
    </tr>
  ) : null;
  const wTotal = th.parts.reduce((m, p) => m + p.weight, 0) || 1;
  const score = th.value ?? 0;
  const adjustments = [
    { key: 'HY', label: ti('hyBonusRow', { label: hyAdjustmentLabel(th.hy.label, loc) }), value: th.hy.hy != null ? `${th.hy.hy.toFixed(2)}%` : '—', bonus: th.hy.bonus },
    {
      key: 'LIQ', label: ti('liqBonusRow', { label: liqAdjustmentLabel(th.liq.label, loc) }), bonus: th.liq.bonus,
      value: `${th.liq.yoy != null ? `M2 ${sgn(th.liq.yoy, 1)}%` : '—'}${th.liq.m0d3 != null ? ` · M0 ${sgn(th.liq.m0d3, 1)}%` : ''}`,
    },
    {
      key: 'OIL', label: ti('oilBonusRow', { label: oilAdjustmentLabel(th.oil.label, loc) }), bonus: th.oil.bonus,
      value: `${th.oil.price != null ? `$${th.oil.price.toFixed(2)}` : '—'}${th.oil.ratio != null ? ` · ×${th.oil.ratio.toFixed(2)}` : ''}`,
    },
  ];
  const adjText = adjustments.filter((a) => a.bonus !== 0).map((a) => ` ${sgn(a.bonus)} ${a.key === 'HY' ? 'HY' : a.key === 'LIQ' ? 'liq' : 'WTI'}`).join('');
  return (
    <div className="flex flex-col gap-2">
      <BhtHistoryBlock />
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left font-normal px-3 py-1.5">{ti('colIndicator')}</th>
              <th className="text-right font-normal px-3 py-1.5">{ti('colValue')}</th>
              <th className="text-right font-normal px-3 py-1.5">{ti('colScore')}</th>
              <th className="text-right font-normal px-3 py-1.5">{ti('colWeight')}</th>
              <th className="text-right font-normal px-3 py-1.5">{ti('colContribution')}</th>
            </tr>
          </thead>
          <tbody>
            {th.parts.map((p) => {
              const dec = PART_DEC[p.key] ?? 2;
              return (
                <Fragment key={p.key}>
                <tr className="border-b border-slate-800/60 text-slate-300">
                  <td className="px-3 py-1.5">{PART_META[p.key]?.name[loc] ?? partLabel(p.key, loc)}<InfoButton open={open.has(p.key)} onClick={() => toggle(p.key)} label={infoLabel} /></td>
                  <td className="text-right px-3 py-1.5">{bandOnlyText(p.key, p.value, loc) ?? p.value.toFixed(dec)}</td>
                  <td className="text-right px-3 py-1" style={{ color: capeScoreColor(p.score) }}>
                    {PART_BANDS[p.key] && PART_ORB_NAME[p.key]
                      ? <span className="inline-flex justify-end"><ScoreOrb hideValue={BAND_ONLY_PARTS.has(p.key)} name={PART_ORB_NAME[p.key]} value={p.value} dec={dec} weight={p.weight} score={Math.round(p.score)} bands={PART_BANDS[p.key]} small /></span>
                      : p.score.toFixed(0)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-slate-400">{p.weight}</td>
                  <td className="text-right px-3 py-1.5 text-accent-300">{(p.score * p.weight / wTotal).toFixed(1)}</td>
                </tr>
                {explainRow(p.key)}
                </Fragment>
              );
            })}
            {adjustments.map((a) => (
              <Fragment key={a.key}>
              <tr className="border-b border-slate-800/60 text-slate-300">
                <td className="px-3 py-1.5">{a.label}<InfoButton open={open.has(a.key)} onClick={() => toggle(a.key)} label={infoLabel} /></td>
                <td className="text-right px-3 py-1.5">{a.value}</td>
                <td className={`text-right px-3 py-1.5 ${adjCls(a.bonus)}`}>{a.bonus !== 0 ? sgn(a.bonus) : '0'}</td>
                <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                <td className="text-right px-3 py-1.5 text-accent-300">{a.bonus !== 0 ? sgn(a.bonus, 1) : '0.0'}</td>
              </tr>
              {explainRow(a.key)}
              </Fragment>
            ))}
            <tr className="text-slate-100 font-semibold">
              <td className="px-3 py-1.5" colSpan={4}>{ti('finalScore')} = Σ ÷ {wTotal}{adjText}</td>
              <td className="text-right px-3 py-1.5">{score.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">{ti('thermoFootA')} {ti('thermoFootB', { n: th.parts.length })}</p>
    </div>
  );
}
