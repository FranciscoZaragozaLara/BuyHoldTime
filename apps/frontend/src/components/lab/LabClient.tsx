'use client';
// Página «Laboratorio» del plan Canary & Phoenix: solo informativa. No cambia el semáforo BHT ni los tranches.
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { useAuth } from '@/context/AuthContext';
import { TOKENS } from '@/lib/designTokens';
import { onEpisodes, pnlByStrategy, positionPnl, sparkPath, type PaperPosition } from '@/lib/labPaper';

type Score = { score_key: string; date: string; value: number; state: string | null; components: Record<string, unknown> | null; is_backfill: boolean };
type Summary = {
  experimental: true;
  config?: { version: string; frozen_at: string; notes: string | null };
  configs?: Array<{ version: string; frozen_at: string }>;
  latest: Score[];
  basket: { month: string | null; members: Array<{ symbol: string; rank: number; sector: string | null; ext_sma50: number | null; fragility: Record<string, boolean> | null; is_anchor: boolean }> };
  cohort: { cohort_id?: string; frozen_at?: string; members: Array<{ symbol: string; cohort_size: number; sector: string | null; industry: string | null; phoenix_rank: number; components: Record<string, number | null> | null; status: string }> };
  positions: PaperPosition[];
  events: Array<{ episode_id: string; peak_date: string; trough_date: string | null; depth: number | null; metrics: { h1_h4?: Record<string, { signal: string | null; lead_weeks: number | null } | null> } | null }>;
  options?: { ts: string | null; n: number };
};

const STATE_COLOR: Record<string, string> = { VERDE: TOKENS.favorable, AMARILLO: TOKENS.caution, ROJO: TOKENS.risk, GIRO: TOKENS.favorable };
const SCORE_NAMES: Record<string, [string, string]> = {
  canary_p_etf: ['Canary‑P · canasta ETFs', 'Canary‑P · ETF basket'], canary_p_stocks: ['Canary‑P · canasta de acciones', 'Canary‑P · stock basket'],
  csi_live: ['CSI en vivo (puts simulados)', 'Live CSI (simulated puts)'], csi_synthetic: ['CSI sintético (puts teóricos Black‑Scholes)', 'Synthetic CSI (Black‑Scholes puts)'],
  phoenix_score_20: ['Phoenix Score · cohorte 20', 'Phoenix Score · cohort 20'], phoenix_score_10: ['Phoenix Score · cohorte 10', 'Phoenix Score · cohort 10'],
  ref_arkk_qqq: ['Referencia ARKK/QQQ < MA50', 'ARKK/QQQ < MA50 reference'],
};
const STRAT: Record<string, [string, string]> = {
  canary_put: ['Puts de la canasta Canary (sensor del CSI)', 'Canary basket puts (CSI sensor)'], hedge_put: ['Puts de cobertura QQQ', 'QQQ hedge puts'],
  recovery_bcs: ['Recuperación R1/R2 · bull call spread', 'Recovery R1/R2 · bull call spread'], recovery_leaps: ['Recuperación R3 · LEAPS ITM', 'Recovery R3 · ITM LEAPS'],
  tqqq_benchmark: ['Benchmark TQQQ (fechas T0–T3 del módulo)', 'TQQQ benchmark (module T0–T3 dates)'],
};
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);

function Spark({ k }: { k: string }) {
  const { token } = useAuth();
  const [vals, setVals] = useState<number[] | null>(null);
  useEffect(() => {
    if (!token) return;
    const from = new Date(); from.setFullYear(from.getFullYear() - 2);
    fetch(`${getApiBase()}/api/experimental/scores?key=${k}&from=${from.toISOString().slice(0, 10)}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((j) => setVals((j.rows ?? []).map((r: { value: number }) => Number(r.value)))).catch(() => setVals([]));
  }, [k, token]);
  const d = vals ? sparkPath(vals, 160, 32) : null;
  return d ? <svg width={160} height={32} className="mt-1"><path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.2} /></svg> : <div className="h-8" />;
}

// Riesgo de techo (H1 v1): Canary ROJO (CSI sintético o Canary‑P ETFs ≥ 56) con BHT ≥ 60. Zona de riesgo, no orden de venta.
function TopRiskCard({ x, es }: { x: Score; es: boolean }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Array<{ date: string; state: string | null }> | null>(null);
  useEffect(() => {
    if (!token) return;
    const from = new Date(); from.setFullYear(from.getFullYear() - 1);
    fetch(`${getApiBase()}/api/experimental/scores?key=canary_top_risk&from=${from.toISOString().slice(0, 10)}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((j) => setRows(j.rows ?? [])).catch(() => setRows([]));
  }, [token]);
  const on = x.state === 'ROJO';
  const c = (x.components ?? {}) as { bht?: number | null; canary_p?: number | null; csi?: number | null };
  const ep = rows ? onEpisodes(rows) : null;
  const n = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(1));
  const ok = (v: number | null | undefined, need: number) => <span style={{ color: v != null && v >= need ? TOKENS.risk : '#94a3b8' }}>{n(v)}</span>;
  return (
    <section className="p-4 rounded-xl bg-slate-900 border" style={{ borderColor: on ? TOKENS.risk : '#334155' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-bold">{es ? 'Riesgo de techo' : 'Top risk'}</h2>
        <span className="text-sm font-bold" style={{ color: on ? TOKENS.risk : TOKENS.favorable }}>{on ? (es ? 'ENCENDIDO' : 'ON') : (es ? 'APAGADO' : 'OFF')}</span>
        <span className="text-[10px] text-slate-500 ml-auto">v1 · {x.date}{x.is_backfill ? ' · backtest' : ''}</span>
      </div>
      <div className="text-sm font-mono mt-1">
        BHT {ok(c.bht, 60)} <span className="text-slate-500">(≥ 60)</span> · Canary‑P {ok(c.canary_p, 56)} · CSI {ok(c.csi, 56)} <span className="text-slate-500">({es ? 'alguno ≥ 56' : 'either ≥ 56'})</span>
      </div>
      {ep && <div className="text-xs text-slate-400 mt-1">{es ? 'Último año' : 'Last year'}: {ep.starts} {es ? 'encendidos' : 'activations'}{ep.lastOn && <> · {es ? 'última vez' : 'last on'} {ep.lastOn}</>}{on && ep.run > 0 && <> · {ep.run} {es ? 'sesiones seguidas' : 'sessions in a row'}</>}</div>}
      <p className="text-xs text-slate-500 mt-2">{es
        ? 'Canary en ROJO mientras el BHT está en zona cara. En el backtest 2011–2026 se encendió antes de 7 de 9 caídas de QQQ ≥ 10% que empezaron con BHT alto, con 0.44 falsas alarmas al año, pero en promedio ~14 semanas antes y ~9% abajo del techo: indica zona de riesgo, no momento de venta. No cambia el semáforo BHT ni la escalera de venta (como disparador de V1–V3 no la mejoró).'
        : 'Canary RED while the BHT is in the expensive zone. In the 2011–2026 backtest it lit before 7 of 9 QQQ drops ≥ 10% that began with a high BHT, with 0.44 false alarms a year, but on average ~14 weeks early and ~9% below the top: it flags a risk zone, not a sell moment. It does not change the BHT light or the sell ladder (as a V1–V3 trigger it did not improve it).'}</p>
    </section>
  );
}

export default function LabClient({ locale }: { locale: string }) {
  const es = locale === 'es';
  const { role, token, loading: authLoading } = useAuth();
  const isAdmin = role === 'ADMIN' && !!token;
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${getApiBase()}/api/experimental/summary`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setS).catch(() => setErr(true));
  }, [isAdmin, token]);
  const L = (pair: [string, string] | undefined, fallback: string) => (pair ? (es ? pair[0] : pair[1]) : fallback);
  const tot = s ? pnlByStrategy(s.positions) : {};
  const sig = ['canary_p_red', 'canary_p_yellow', 'ref_arkk_qqq', 'csi_synthetic_red'];
  const sigName: Record<string, string> = { canary_p_red: 'Canary‑P ROJO', canary_p_yellow: es ? 'Canary‑P AMARILLO+' : 'Canary‑P YELLOW+', ref_arkk_qqq: 'ARKK/QQQ', csi_synthetic_red: es ? 'CSI sint. ROJO' : 'Synth. CSI RED' };
  // Solo administradores: a los demás se les muestra «no encontrado» (la página no existe para ellos).
  if (authLoading) return <div className="max-w-6xl mx-auto px-4 py-16 text-slate-500 text-sm">…</div>;
  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 text-center text-slate-300">
        <div className="text-5xl font-bold text-slate-600">404</div>
        <p className="mt-3">{es ? 'Página no encontrada.' : 'Page not found.'}</p>
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-slate-200 space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-slate-600 text-slate-300">🧪 {es ? 'Experimental' : 'Experimental'}</div>
        <h1 className="text-2xl font-bold mt-2">{es ? 'Laboratorio Canary & Phoenix' : 'Canary & Phoenix Lab'}</h1>
        <p className="text-sm text-slate-400 mt-1">{es
          ? 'Indicadores de techo (Canary) y suelo (Phoenix), canastas mensuales y paper trading de opciones con datos retrasados. Se calculan en modo sombra: no cambian el semáforo BHT, el termómetro ni los tranches. Investigación cuantitativa, no asesoría financiera.'
          : 'Top (Canary) and bottom (Phoenix) indicators, monthly baskets and paper options trading on delayed data. Shadow mode: they do not change the BHT light, the thermometer or the tranches. Quantitative research, not financial advice.'}</p>
        {s?.config && <p className="text-xs text-slate-500 mt-1">{es ? 'Parámetros congelados' : 'Frozen parameters'} {(s.configs?.length ? s.configs : [s.config]).map((c) => `${c.version} · ${c.frozen_at?.slice(0, 10)}`).join(' / ')}{s.options?.ts && <> · {es ? 'último snapshot de opciones' : 'last options snapshot'} {s.options.ts.slice(0, 16)} ({s.options.n})</>}</p>}
      </div>
      {err && <div className="text-risk-300 text-sm">{es ? 'No se pudo cargar el laboratorio.' : 'Could not load the lab.'}</div>}
      {s && (
        <>
          {(() => { const tr = s.latest.find((x) => x.score_key === 'canary_top_risk'); return tr ? <TopRiskCard x={tr} es={es} /> : null; })()}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {s.latest.filter((x) => SCORE_NAMES[x.score_key]).map((x) => (
              <div key={x.score_key} className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                <div className="text-xs text-slate-400">{L(SCORE_NAMES[x.score_key], x.score_key)}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold font-mono">{Number(x.value).toFixed(1)}</span>
                  {x.state && <span className="text-xs font-bold" style={{ color: STATE_COLOR[x.state] ?? '#94a3b8' }}>{x.state}</span>}
                  <span className="text-[10px] text-slate-500 ml-auto">{x.date}{x.is_backfill ? (es ? ' · backtest' : ' · backtest') : ''}</span>
                </div>
                <Spark k={x.score_key} />
              </div>
            ))}
          </section>

          <section className="p-4 rounded-xl bg-slate-900 border border-slate-700">
            <h2 className="font-bold">{es ? 'Paper trading (cartera virtual USD 100,000)' : 'Paper trading (USD 100,000 virtual portfolio)'}</h2>
            <p className="text-xs text-slate-500">{es ? 'Llenado conservador: compra a mid + ¼ del spread, venta a mid − ¼; USD 0.65 por contrato. Sin órdenes reales.' : 'Conservative fills: buy at mid + ¼ spread, sell at mid − ¼; USD 0.65 per contract. No real orders.'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
              {Object.entries(tot).map(([k, t]) => (
                <div key={k} className="flex justify-between gap-2 px-2 py-1 rounded bg-slate-800/60">
                  <span>{L(STRAT[k], k)} <span className="text-slate-500">· {t.open}/{t.n} {es ? 'abiertas' : 'open'}</span></span>
                  <span className="font-mono font-bold" style={{ color: t.pnl >= 0 ? TOKENS.favorable : TOKENS.risk }}>{usd(t.pnl)} <span className="text-slate-500 font-normal">/ {usd(t.cost)}</span></span>
                </div>
              ))}
              {!s.positions.length && <div className="text-slate-500">{es ? 'Sin posiciones todavía.' : 'No positions yet.'}</div>}
            </div>
            {!!s.positions.length && (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs font-mono">
                  <thead className="text-slate-500 text-[10px] uppercase"><tr className="border-b border-slate-700">
                    <th className="text-left py-1">{es ? 'Estrategia' : 'Strategy'}</th><th className="text-left">{es ? 'Subyacente' : 'Underlying'}</th><th className="text-left">{es ? 'Contrato' : 'Contract'}</th>
                    <th className="text-left">{es ? 'Abierta' : 'Opened'}</th><th className="text-right">{es ? 'Entrada' : 'Entry'}</th><th className="text-right">{es ? 'Marca' : 'Mark'}</th><th className="text-right">ROI</th><th className="text-right">P&L</th><th className="text-left pl-2">{es ? 'Estado' : 'Status'}</th>
                  </tr></thead>
                  <tbody>{s.positions.map((p) => {
                    const pl = positionPnl(p);
                    const leg = p.legs?.[0];
                    const desc = p.strategy === 'tqqq_benchmark' ? `${p.tranche} · ${Number(leg?.qty ?? 0).toFixed(2)} acc.` : p.legs.map((l) => `${l.side === 'short' ? '−' : '+'}${l.right}${l.strike} ${l.expiry}`).join(' ');
                    return (
                      <tr key={p.id} className="border-b border-slate-800/60">
                        <td className="py-0.5 text-slate-400">{p.strategy}{p.tranche && !p.tranche.includes('-') ? ` ${p.tranche}` : ''}</td><td className="font-bold">{p.underlying}</td><td className="text-slate-400">{desc}</td>
                        <td>{p.opened_at}</td><td className="text-right">{Number(p.entry_price).toFixed(2)}</td>
                        <td className="text-right">{p.status === 'closed' ? (p.exit_price ?? 0).toFixed(2) : p.mark_conservative != null ? Number(p.mark_conservative).toFixed(2) : '—'}</td>
                        <td className="text-right" style={{ color: (p.roi_pct ?? 0) >= 0 ? TOKENS.favorable : TOKENS.risk }}>{pct(p.roi_pct)}</td>
                        <td className="text-right" style={{ color: (pl ?? 0) >= 0 ? TOKENS.favorable : TOKENS.risk }}>{pl == null ? '—' : usd(pl)}</td>
                        <td className="pl-2 text-slate-400">{p.status === 'open' ? (es ? 'abierta' : 'open') : p.exit_reason}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700">
              <h2 className="font-bold">{es ? 'Canasta Canary' : 'Canary basket'} {s.basket.month?.slice(0, 7)}</h2>
              <p className="text-xs text-slate-500">{es ? 'Frágiles (FCF < 0, P/S > 12 o P/E fwd > 55), sobreextendidas (≥ 15% sobre su SMA50) y con opciones líquidas; ARKK e IGV anclados.' : 'Fragile (FCF < 0, P/S > 12 or fwd P/E > 55), overextended (≥ 15% above SMA50) and with liquid options; ARKK and IGV anchored.'}</p>
              <table className="w-full text-xs font-mono mt-2"><tbody>{s.basket.members.map((m) => (
                <tr key={m.symbol} className="border-b border-slate-800/60"><td className="py-0.5 font-bold">{m.symbol}</td><td className="text-slate-400">{m.is_anchor ? (es ? 'ancla' : 'anchor') : m.sector}</td>
                  <td className="text-right">{m.ext_sma50 != null ? `×${Number(m.ext_sma50).toFixed(2)}` : ''}</td>
                  <td className="text-right text-slate-500">{m.fragility ? Object.entries(m.fragility).filter(([, v]) => v).map(([k]) => k).join(' ') : ''}</td></tr>
              ))}</tbody></table>
              {!s.basket.members.length && <div className="text-slate-500 text-sm mt-2">{es ? 'Sin canasta registrada.' : 'No basket yet.'}</div>}
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700">
              <h2 className="font-bold">{es ? 'Cohorte Fénix' : 'Phoenix cohort'} {s.cohort.cohort_id} {s.cohort.frozen_at && <span className="text-xs text-slate-500 font-normal">· {es ? 'congelada' : 'frozen'} {s.cohort.frozen_at}</span>}</h2>
              <p className="text-xs text-slate-500">{es ? 'Calidad (cap. > 15 mil millones, FCF > 0, ROE > 15%, deuda/EBITDA < 1.5) ordenada por resiliencia, calidad y volumen; máx. 2 por sector. ★ = también en la cohorte de 10.' : 'Quality (cap > 15B, FCF > 0, ROE > 15%, debt/EBITDA < 1.5) ranked by resilience, quality and volume; max 2 per sector. ★ = also in the 10 cohort.'}</p>
              <table className="w-full text-xs font-mono mt-2"><tbody>{s.cohort.members.filter((m) => m.cohort_size === 20).map((m) => {
                const in10 = s.cohort.members.some((x) => x.cohort_size === 10 && x.symbol === m.symbol);
                return <tr key={m.symbol} className="border-b border-slate-800/60"><td className="py-0.5 font-bold">{in10 ? '★ ' : ''}{m.symbol}</td><td className="text-slate-400">{m.sector}</td><td className="text-right">{Number(m.phoenix_rank).toFixed(0)}</td><td className="text-right text-slate-500">{pct((m.components?.ret_since_qqq_peak ?? 0) * 100)}</td></tr>;
              })}</tbody></table>
              {!s.cohort.members.length && <div className="text-slate-500 text-sm mt-2">{es ? 'Sin cohorte congelada.' : 'No frozen cohort.'}</div>}
            </div>
          </section>

          <section className="p-4 rounded-xl bg-slate-900 border border-slate-700">
            <h2 className="font-bold">{es ? 'Backtest H1 · ¿el Canary anticipa techos de QQQ? (semanas de adelanto; − = después del pico)' : 'Backtest H1 · does the Canary lead QQQ tops? (weeks of lead; − = after the peak)'}</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs font-mono mt-2">
              <thead className="text-slate-500 text-[10px] uppercase"><tr className="border-b border-slate-700"><th className="text-left py-1">{es ? 'Episodio' : 'Episode'}</th><th className="text-right">{es ? 'Caída' : 'Drop'}</th>{sig.map((k) => <th key={k} className="text-right">{sigName[k]}</th>)}</tr></thead>
              <tbody>{s.events.map((e) => (
                <tr key={e.episode_id} className="border-b border-slate-800/60"><td className="py-0.5">{e.peak_date}</td><td className="text-right text-risk-300">{pct((e.depth ?? 0) * 100)}</td>
                  {sig.map((k) => { const m = e.metrics?.h1_h4?.[k]; const w = m?.lead_weeks; return <td key={k} className="text-right" style={{ color: w == null ? '#64748b' : w >= 3 ? TOKENS.favorable : TOKENS.caution }}>{w == null ? '—' : `${w > 0 ? '+' : ''}${w.toFixed(1)}`}</td>; })}
                </tr>
              ))}</tbody>
            </table></div>
            <p className="text-xs text-slate-500 mt-2">{es ? 'Criterio de promoción (preregistrado): adelanto ≥ 3 semanas en 2 de cada 3 techos, ≤ 1 falsa alarma ROJA por año y superar a ARKK/QQQ. v0: ninguna señal lo cumple todavía.' : 'Promotion rule (preregistered): ≥ 3 weeks of lead in 2 of 3 tops, ≤ 1 RED false alarm per year and beating ARKK/QQQ. v0: no signal meets it yet.'}</p>
          </section>
        </>
      )}
    </div>
  );
}
