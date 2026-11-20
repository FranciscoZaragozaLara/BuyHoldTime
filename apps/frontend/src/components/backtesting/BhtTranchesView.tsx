'use client';
// Vista "Tranches" del popover del BHT: Módulo de Reentrada por Tranches (MRT v1.3). Para la fecha del popover y la
// ruta elegida (VOO = S&P 500; QQQ/TQQQ = Nasdaq-100 con QQQ como proxy), estado del episodio desde el último pico,
// condiciones del día (permiso, veto de crédito, votos) y los 5 tranches: disparado, hoy o lo que falta.
// Se carga con next/dynamic y calcula en el backend bajo demanda; resultados en memoria por (fecha, ruta).
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { TOKENS } from '@/lib/designTokens';
import { athColor, athTone } from '@/lib/athDrawdown';
import { trancheCheckText, TRANCHE_LIGHT, type TrancheCheck, type TrancheLight } from '@/lib/tranches';

type Route = 'voo' | 'qqq';
type Rule = 'half' | 'extraVote';
type Tranche = { id: string; weight: number; size: number; lev3x: number; status: 'fired' | 'today' | 'pending'; date: string | null; price: number | null; backup?: boolean; checks: TrancheCheck[] };
type Result = {
  date: string; route: Route; light: TrancheLight;
  episode: null | { start: string; peakDate: string; peak: number; price: number; dd: number; ddMax: number; minDate: string; min: number; days: number; sectorOnly: boolean; spDd: number | null; ndxDd: number | null };
  lastEpisode: null | { start: string; end: string; ddMax: number };
  today: {
    price: number | null; spDd: number | null; ndxDd: number | null; veto: boolean; oas: number | null; oasMax63: number | null; oasSma20: number | null;
    ratio: number | null; volSource: 'ratio' | 'fallback'; volVote: boolean; volArmedAt: string | null;
    volSignal?: 'ratio' | 'level' | null; vix?: number | null; vixMax20?: number | null; bht?: number | null;
    decelVote: boolean; slope: number | null; curv: number | null; slopeMin: number | null; recover: number | null; boll: boolean; votes: number; cape: number | null; capeMedian20: number | null;
  };
  ath?: { spx: Ath | null; qqq: Ath | null; tqqq?: Ath | null };
  tranches: Tranche[]; deployed: number; leverage: number; avgPrice: number | null; captured: number | null;
};
type Both = Partial<Record<Rule, Result | null>>;
type Ath = { pct: number; date: string; price: number; window5y: boolean };

const cache = new Map<string, Promise<Both | null>>();
function fetchTranches(date: string, route: Route) {
  const key = `${date}:${route}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`${getApiBase()}/api/backtesting/bht-tranches?date=${date}&instrument=${route}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j && !j.error ? (j as Both) : null))
      .catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key)!;
}

const money = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(Number(v.toFixed(d)) || 0) > 0 ? '+' : ''}${(Number(v.toFixed(d)) || 0).toFixed(d)}%`);
const Mark = ({ ok }: { ok: boolean }) => <span className={`font-bold ${ok ? 'text-favorable-300' : 'text-slate-500'}`}>{ok ? '✓' : '✗'}</span>;

const T = {
  es: {
    title: 'Módulo de Reentrada por Tranches', route: 'Ruta', vooRoute: 'S&P 500', qqqRoute: 'Nasdaq-100 (QQQ como proxy)',
    rule: 'Corrección sectorial', half: 'T1 a medio tamaño', extra: 'T1 con voto extra', ruleTitle: 'Si solo cae el Nasdaq-100 y el S&P 500 no confirma',
    episode: 'Episodio desde el pico del', days: 'días', ddNow: 'Caída hoy', ddMax: 'máxima del episodio', trough: 'mínimo', sector: 'corrección sectorial: el S&P 500 no confirma',
    noEpisode: 'Sin episodio abierto', fromAth: 'desde ATH', atAth: 'En máximo histórico', at5y: 'En máximo de 5 años', lastEp: 'Último episodio', ended: 'cerró el',
    cond: 'Condiciones del día', permit: 'Permiso', veto: 'Veto de crédito', vol: 'Voto de volatilidad', decel: 'Voto de desaceleración', val: 'Valuación (T4)',
    vetoOn: 'activo: HY OAS en su máximo de 63 días y sobre su SMA20', vetoOff: 'sin veto',
    volFallback: 'respaldo con niveles de VIX (sin VIX3M antes de 2007)', armed: 'armado el', notArmed: 'no se armó en este episodio', orLevel: 'o nivel:', max20: 'máx 20d', ratio: 'VIX/VIX3M',
    slope: 'pendiente EMA50', recover: 'recuperó', boll: 'reingreso a la banda de Bollinger −2σ', capeVs: 'CAPE vs mediana 20 años',
    tranche: 'Tranche', weight: 'Peso', mix: 'Mezcla', status: 'Estado', fired: 'Disparado', today: 'Hoy', pending: 'Falta', backup: 'respaldo (12 meses sobre la EMA200)', halfSize: 'medio tamaño',
    names: { T0: 'Capitulación', T1: 'Pánico terminando', T2: 'Desaceleración', T3: 'Validación', T4: 'Valuación profunda' } as Record<string, string>,
    deployed: 'Desplegado', lev: 'apalancamiento', avg: 'precio promedio', captured: 'de la caída capturada',
    note: 'Metodología de investigación cuantitativa (MRT v1.3, adaptado): permiso por caída del precio vs su máximo de 12 meses; voto de volatilidad híbrido blindado (VIX/VIX3M, o VIX ≥25% bajo su máximo de 20 días con BHT < 50); T4 con CAPE debajo de su mediana de 20 años; sin voto de amplitud. No es asesoría financiera.',
    loading: 'Calculando…', error: 'No se pudo calcular.',
  },
  en: {
    title: 'Tranche Re-entry Module', route: 'Route', vooRoute: 'S&P 500', qqqRoute: 'Nasdaq-100 (QQQ as proxy)',
    rule: 'Sector correction', half: 'T1 at half size', extra: 'T1 with an extra vote', ruleTitle: 'When only the Nasdaq-100 falls and the S&P 500 does not confirm',
    episode: 'Episode since the peak of', days: 'days', ddNow: 'Drawdown today', ddMax: 'episode max', trough: 'low', sector: 'sector correction: the S&P 500 does not confirm',
    noEpisode: 'No open episode', fromAth: 'from ATH', atAth: 'At all-time high', at5y: 'At 5-year high', lastEp: 'Last episode', ended: 'closed on',
    cond: 'Conditions of the day', permit: 'Permission', veto: 'Credit veto', vol: 'Volatility vote', decel: 'Deceleration vote', val: 'Valuation (T4)',
    vetoOn: 'active: HY OAS at its 63-day high and above its SMA20', vetoOff: 'no veto',
    volFallback: 'VIX-level fallback (no VIX3M before 2007)', armed: 'armed on', notArmed: 'not armed in this episode', orLevel: 'or level:', max20: '20d high', ratio: 'VIX/VIX3M',
    slope: 'EMA50 slope', recover: 'recovered', boll: 'back inside the −2σ Bollinger band', capeVs: 'CAPE vs 20-year median',
    tranche: 'Tranche', weight: 'Weight', mix: 'Mix', status: 'Status', fired: 'Fired', today: 'Today', pending: 'Missing', backup: 'backup (12 months above the EMA200)', halfSize: 'half size',
    names: { T0: 'Capitulation', T1: 'Panic ending', T2: 'Deceleration', T3: 'Validation', T4: 'Deep value' } as Record<string, string>,
    deployed: 'Deployed', lev: 'leverage', avg: 'average price', captured: 'of the drawdown captured',
    note: 'Quantitative research methodology (MRT v1.3, adapted): permission by price drawdown vs its 12-month high; hardened hybrid volatility vote (VIX/VIX3M, or VIX ≥25% below its 20-day high with BHT < 50); T4 with CAPE below its 20-year median; no breadth vote. Not financial advice.',
    loading: 'Computing…', error: 'Could not compute.',
  },
};

export default function BhtTranchesView({ date, locale }: { date: string; locale: string }) {
  const es = locale === 'es';
  const t = es ? T.es : T.en;
  const [route, setRoute] = useState<Route>('qqq');
  const [rule, setRule] = useState<Rule>('half');
  const key = `${date}:${route}`;
  const [state, setState] = useState<{ key: string; data: Both | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTranches(date, route).then((data) => { if (alive) setState({ key, data }); });
    return () => { alive = false; };
  }, [date, route, key]);
  const fresh = state?.key === key;
  const both = state?.data;
  const r = both ? both[rule] ?? both.half ?? null : state ? null : undefined;
  const [one, three] = route === 'qqq' ? ['QQQ', 'TQQQ'] : ['VOO', 'UPRO'];
  const L = r ? TRANCHE_LIGHT[r.light] : null;

  const seg = (on: boolean) => `px-2 py-0.5 rounded-md transition ${on ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`;
  return (
    <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.title}</span>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 font-bold" title={t.route}>
          <button type="button" className={seg(route === 'voo')} onClick={(e) => { e.stopPropagation(); setRoute('voo'); }}>VOO</button>
          <button type="button" className={seg(route === 'qqq')} onClick={(e) => { e.stopPropagation(); setRoute('qqq'); }}>QQQ / TQQQ</button>
        </div>
        {route === 'qqq' && (
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5" title={t.ruleTitle}>
            <button type="button" className={seg(rule === 'half')} onClick={(e) => { e.stopPropagation(); setRule('half'); }}>{t.half}</button>
            <button type="button" className={seg(rule === 'extraVote')} onClick={(e) => { e.stopPropagation(); setRule('extraVote'); }}>{t.extra}</button>
          </div>
        )}
      </div>

      {r === undefined ? <div className="font-mono text-slate-500">{t.loading}</div> : r === null ? <div className="font-mono text-risk-300">{t.error}</div> : (
        <div className={`space-y-2 transition-opacity ${fresh ? '' : 'opacity-50'}`}>
          {/* Semáforo y episodio */}
          <div className="p-2 rounded-lg border" style={{ borderColor: `${L!.color}66`, backgroundColor: `${L!.color}12` }}>
            <div className="flex items-center gap-2 font-bold" style={{ color: L!.color }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: L!.color }} />{es ? L!.es : L!.en}
              <span className="ml-auto text-[10px] font-normal text-slate-500">{route === 'qqq' ? t.qqqRoute : t.vooRoute}</span>
            </div>
            {r.episode ? (
              <div className="mt-1 font-mono text-slate-300 space-y-0.5">
                <div>{t.episode} {r.episode.peakDate} ({route === 'qqq' ? 'QQQ' : 'S&P 500'} {money(r.episode.peak)}) · {r.episode.days} {t.days}</div>
                <div>{t.ddNow} <span className="text-risk-300 font-bold">{pct(r.episode.dd)}</span> · {t.ddMax} <span className="text-risk-300">{pct(r.episode.ddMax)}</span> · {t.trough} {money(r.episode.min)} ({r.episode.minDate})</div>
                {r.episode.sectorOnly && <div className="text-caution-300">{t.sector}</div>}
              </div>
            ) : (
              <>
                <div className="mt-1 font-mono text-slate-400">{t.noEpisode}{r.lastEpisode && <> · {t.lastEp} {r.lastEpisode.start} → {t.ended} {r.lastEpisode.end} ({pct(r.lastEpisode.ddMax)})</>}</div>
                {/* Sin episodio: caída desde el ATH de cada instrumento analizado, con el semáforo de las cards. */}
                {r.ath && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono">
                    {([['S&P 500', r.ath.spx], ['QQQ', r.ath.qqq], ['TQQQ', r.ath.tqqq ?? null]] as [string, Ath | null][]).filter(([, a]) => a).map(([k, a]) => {
                      const c = athColor(athTone(a!.pct));
                      const ath = a!.window5y ? 'ATH 5Y' : 'ATH';
                      return (
                        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${ath} ${money(a!.price)} · ${a!.date}`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                          <span className="text-slate-400">{k}</span>
                          <span className="font-bold" style={{ color: c }}>{a!.pct > -0.05 ? (a!.window5y ? t.at5y : t.atAth) : `${pct(a!.pct)} ${t.fromAth}${a!.window5y ? ' 5Y' : ''}`}</span>
                          <span className="text-slate-500">· {a!.date}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Condiciones del día */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{t.cond}</div>
            <table className="w-full font-mono">
              <tbody className="[&_td]:py-[1px]">
                <tr className="border-b border-slate-800/60">
                  <td className="w-4"><Mark ok={!!r.episode} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.permit}</td>
                  <td className="text-slate-400">S&P 500 {pct(r.today.spDd)} (≤ −10%){route === 'qqq' && <> · QQQ {pct(r.today.ndxDd)} (≤ −15%)</>}</td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={!r.today.veto} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.veto}</td>
                  <td className={r.today.veto ? 'text-risk-300' : 'text-slate-400'}>{r.today.veto ? t.vetoOn : t.vetoOff} · OAS {r.today.oas?.toFixed(2) ?? '—'}% · máx63 {r.today.oasMax63?.toFixed(2) ?? '—'} · SMA20 {r.today.oasSma20?.toFixed(2) ?? '—'}</td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={r.today.volVote} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.vol}</td>
                  <td className="text-slate-400">
                    <span className={r.today.volSignal === 'ratio' ? 'text-favorable-300' : ''}>{r.today.volSource === 'ratio' ? <>{t.ratio} {r.today.ratio?.toFixed(2)} (&gt; 1.05 → &lt; 1)</> : t.volFallback}{r.episode && (r.today.volArmedAt ? <> · {t.armed} {r.today.volArmedAt}</> : <> · {t.notArmed}</>)}</span>
                    {/* Señal por nivel del modo híbrido blindado: VIX ≥25% bajo su máximo de 20 días (≥25) con BHT < 50. */}
                    <span className={r.today.volSignal === 'level' ? 'text-favorable-300' : ''}> · {t.orLevel} VIX {r.today.vix?.toFixed(1) ?? '—'} / {t.max20} {r.today.vixMax20?.toFixed(1) ?? '—'} (≤ 75%) · BHT {r.today.bht?.toFixed(1) ?? '—'} (&lt; 50)</span>
                  </td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td><Mark ok={r.today.decelVote} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.decel}</td>
                  <td className="text-slate-400">{t.slope} {pct(r.today.slope, 2)}{r.today.slopeMin != null && <> (mín {pct(r.today.slopeMin, 2)})</>}{r.today.recover != null && <> · {t.recover} {r.today.recover.toFixed(0)}% / 50%</>}{r.today.boll && <> · {t.boll}</>}</td>
                </tr>
                <tr>
                  <td><Mark ok={r.today.cape != null && r.today.capeMedian20 != null && r.today.cape < r.today.capeMedian20} /></td><td className="text-slate-300 pr-2 whitespace-nowrap">{t.val}</td>
                  <td className="text-slate-400">{t.capeVs}: {r.today.cape?.toFixed(1) ?? '—'} vs {r.today.capeMedian20?.toFixed(1) ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tranches */}
          <table className="w-full font-mono">
            <thead className="text-[9px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-700/70">
                <th className="text-left font-normal py-0.5">{t.tranche}</th><th className="text-right font-normal">{t.weight}</th>
                <th className="text-right font-normal px-2">{t.mix} {one}/{three}</th><th className="text-left font-normal">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {r.tranches.map((x) => {
                const missing = x.checks.filter((c) => !c.ok);
                return (
                  <tr key={x.id} className={`border-b border-slate-800/60 align-top ${x.status === 'today' ? 'bg-favorable-500/10' : ''}`}>
                    <td className="py-0.5 whitespace-nowrap"><span className="font-bold text-slate-100">{x.id}</span> <span className="text-slate-400 font-sans">{t.names[x.id]}</span></td>
                    <td className="text-right text-slate-300">{(x.weight * 100).toFixed(0)}%</td>
                    <td className="text-right text-slate-400 px-2 whitespace-nowrap">{Math.round((1 - x.lev3x) * 100)}/{Math.round(x.lev3x * 100)}</td>
                    <td className="text-slate-300">
                      {x.status !== 'pending' ? (
                        <span className="text-favorable-300 font-bold">{x.status === 'today' ? t.today : t.fired} {x.date} @ {money(x.price)}{x.size < 1 && <span className="font-normal text-caution-300"> · {t.halfSize}</span>}{x.backup && <span className="font-normal text-slate-400"> · {t.backup}</span>}</span>
                      ) : !r.episode ? <span className="text-slate-600">—</span> : (
                        <span className="text-slate-400">{t.pending}: {missing.map((c) => trancheCheckText(c, locale)).join(' · ') || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="font-mono text-slate-300">
            {t.deployed} <span className="font-bold text-slate-100">{(r.deployed * 100).toFixed(1)}%</span> · {t.lev} <span className="font-bold" style={{ color: r.leverage > 1 ? TOKENS.elevated : undefined }}>{r.leverage.toFixed(2)}x</span>
            {r.avgPrice != null && <> · {t.avg} {money(r.avgPrice)}</>}{r.captured != null && <> · <span className="text-favorable-300">{r.captured.toFixed(0)}%</span> {t.captured}</>}
          </div>
          <div className="text-[10px] text-slate-500 leading-snug">{t.note}</div>
        </div>
      )}
    </div>
  );
}
