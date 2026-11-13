'use client';
import { useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';

/** Texto por idioma para este componente de documentación (mucho texto mezclado con valores en vivo). */
function useL() {
  const loc = useLocale();
  return (es: string, en: string) => (loc === 'es' ? es : en);
}

type Row = {
  regimen: string;
  mide: string;
  gatillo: string;
  crisis: string;
  indicador: string;
  umbral: string;
  icon: string;
  color: string;
  border: string;
};

// Estado vivo del último día disponible (lo calcula RegimesPanel y lo pasa por prop).
// Todo number|null: si falta dato, el tooltip lo muestra como "sin dato" en gris.
export type RegimeLiveR1 = { active: boolean; cape: number|null; thr: number|null; ratio: number|null; cpi: number|null; cpiSma: number|null; dFed: number|null; dgs10: number|null; sma200x110: number|null; spy: number|null; sma50: number|null; };
export type RegimeLiveR2 = { active: boolean; armed: boolean; z: number|null; mg: number|null; mean: number|null; std: number|null; roc3m: number|null; sigma24: number|null; spy: number|null; sma50: number|null; };
export type RegimeLiveR3 = { active: boolean; armed: boolean; hy: number|null; p20: number|null; d3m: number|null; sig: number|null; d1m: number|null; sma36: number|null; sma3m: number|null; sma12m: number|null; spy: number|null; sma50: number|null; sma30: number|null; sma100: number|null; };
export type RegimeLive = { date: string; r1: RegimeLiveR1; r2: RegimeLiveR2; r3: RegimeLiveR3; } | null;

const fmt = (v: any, d = 2) => v != null && isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
// Resaltado de valores vivos: actual verde (seguro) / rojo (disparado), umbral naranja, diferencial azul.
const vAct = (hit: boolean|null) => `font-mono font-semibold ${hit == null ? 'text-slate-400' : hit ? 'text-red-400' : 'text-emerald-400'}`;
const vThr = 'font-mono font-semibold text-amber-300';
const vGap = 'font-mono font-semibold text-sky-300';
// Diferencial en lenguaje natural: cuánto falta (+) o cuánto sobra (−) respecto al umbral.
const gapTxt = (v: number|null, thr: number|null, unit = '') => {
  if (v == null || thr == null || !isFinite(v) || !isFinite(thr)) return 'sin dato';
  const g = v - thr;
  if (Math.abs(g) < 0.005) return `justo en el umbral (${fmt(thr)}${unit})`;
  return g > 0 ? `lo supera por +${fmt(g)}${unit}` : `le faltan ${fmt(-g)}${unit}`;
};

function LiveLine({ tone, icon, children }: { tone: 'ok'|'warn'|'bad'|'idle'|'lock'; icon: string; children: ReactNode }) {
  const cls = tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : tone === 'bad' ? 'border-red-500/30 bg-red-500/10 text-red-200'
    : 'border-slate-700 bg-slate-800/60 text-slate-300';
  return <div className={`mt-2 rounded-lg border px-2 py-1.5 text-[11px] leading-relaxed ${cls}`}><span className="mr-1">{icon}</span>{children}</div>;
}

// Pata de disparo en formato preciso: actual / disparo / faltan (o margen si ya dispara).
// dir 'up': dispara con actual >= objetivo · dir 'down': dispara con actual <= objetivo.
function Leg({ name, actual, target, unit = '', dir = 'up', dec = 2, strict = false }: { name: string; actual: number|null|undefined; target: number|null|undefined; unit?: string; dir?: 'up'|'down'; dec?: number; strict?: boolean }) {
  const L = useL();
  const a = actual != null && isFinite(Number(actual)) ? Number(actual) : null;
  const t = target != null && isFinite(Number(target)) ? Number(target) : null;
  if (a == null || t == null) return <div>▫️ {name}: {L('actual', 'current')} <span className={vAct(null)}>{fmt(a, dec)}{unit}</span> — {L('sin dato de disparo', 'no trigger data')}</div>;
  const hit = dir === 'up' ? (strict ? a > t : a >= t) : (strict ? a < t : a <= t);
  const d = dir === 'up' ? t - a : a - t;
  if (!hit && strict && Math.abs(d) < 1e-9) return <div>▫️ {name}: {L('actual', 'current')} <span className={vAct(false)}>{fmt(a, dec)}{unit}</span> — {L('se necesita movimiento', 'needs a move')} {dir === 'up' ? L('por encima de', 'above') : L('por debajo de', 'below')} <span className={vThr}>{fmt(t, dec)}{unit}</span></div>;
  return <div>{hit ? '✅' : '▫️'} {name}: {L('actual', 'current')} <span className={vAct(hit)}>{fmt(a, dec)}{unit}</span>, {L('disparo', 'trigger')} <span className={vThr}>{fmt(t, dec)}{unit}</span>{hit ? <> ({L('margen', 'margin')} <span className={vGap}>{fmt(Math.abs(d), dec)}{unit}</span>)</> : <>, {L('faltan', 'missing')} <span className={vGap}>{fmt(d, dec)}{unit}</span></>}</div>;
}

const ROWS_EN: Record<string, { regimen: string; mide: string; gatillo: string; crisis: string; indicador: string; umbral: string }> = {
  "Múltiplos Altos": {
    "regimen": "High Multiples",
    "mide": "CAPE + Core CPI — 4 scaling phases (30/70 and 35/65)",
    "gatillo": "Armed CAPE>1.18 & CPI YoY≥4.0 & >1.20 → G1 Fed>0 or 10Y>1.10 (30%) → G2 Fed≥+0.50 & CPI>1.30 (70%) → G3 3M declines or 2M pause (35%) → G4 CPI<1.05 or Fed<0 + SMA50 (65%)",
    "crisis": "Valuation crisis — duration (scaling out/in)",
    "indicador": "CAPE · CPILFESL · DFEDTARU · DGS10 · SMA50",
    "umbral": "F0 CAPE>1.20 & CPI>1.15 · G1 Fed>0/10Y>1.10 (30%) · G2 Fed≥0.50 & CPI>1.30 (70%) · G3 3M↓/2M pause (35%) · G4 CPI<1.05/Fed<0+SMA50 (65%) · Healing"
  },
  "Alta Deuda/PIB": {
    "regimen": "High Debt/GDP",
    "mide": "Systemic leverage — 4 phases",
    "gatillo": "Armed Z>2.0 in 6M → ROC3M<0+SMA50 (30%) → ROC3M<−σ24M (70%) → Z<0",
    "crisis": "Forced selling crisis — staged avalanche",
    "indicador": "FINRA_DEBIT/GDP · ROC3M · SMA50 · σ24M",
    "umbral": "F1 Z>2.0 in 6M (armed with memory) · G1 ROC<0&SMA50 · G2 ROC<−σ · F3/F4 healing Z<0"
  },
  "Complacencia Crediticia HY OAS": {
    "regimen": "HY OAS Credit Complacency",
    "mide": "Blindness + systemic liquidity — 4 phases + healing",
    "gatillo": "Armed HY<P20 in 6M → G1 Δ3M>1.5σ & >5.0% + <SMA50 (30%) → G2 Δ1M≥1.00% or >SMA36M×1.30 (70%) → G3 <SMA3M+>SMA30 (30%) → G4 <SMA12M+>SMA100 (70%) · V2 mutex",
    "crisis": "Bankruptcy/liquidity crisis — credit freeze",
    "indicador": "BAMLH0A0HYM2 + SMA_3/12/36M + σ24M + SMA_50/30/100",
    "umbral": "Armed P20_36M in 6M · G1 >1.5σ & >5.0% · G2 +1.00% or ×1.30 (V2) · G3 <SMA3M · G4 <SMA12M · SPY 0.75% legacy"
  }
};

const rows: Row[] = [
  {
    regimen: 'Múltiplos Altos',
    mide: 'CAPE + Core CPI — 4 fases Scaling (30/70 y 35/65)',
    gatillo: 'Armado CAPE>1.18 & CPI YoY≥4.0 & >1.20 → G1 Fed>0 o 10Y>1.10 (30%) → G2 Fed≥+0.50 & CPI>1.30 (70%) → G3 3M caídas o Pausa 2M (35%) → G4 CPI<1.05 o Fed<0 + SMA50 (65%)',
    crisis: 'Crisis de Valoración — duración (Scaling Out/In)',
    indicador: 'CAPE · CPILFESL · DFEDTARU · DGS10 · SMA50',
    umbral: 'F0 CAPE>1.20 & CPI>1.15 · G1 Fed>0/10Y>1.10 (30%) · G2 Fed≥0.50 & CPI>1.30 (70%) · G3 3M↓/Pausa2M (35%) · G4 CPI<1.05/Fed<0+SMA50 (65%) · Sanación',
    icon: '📈',
    color: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500/30',
  },
  {
    regimen: 'Alta Deuda/PIB',
    mide: 'Apalancamiento sistémico — 4 fases',
    gatillo: 'Armado Z>2.0 en 6M → ROC3M<0+SMA50 (30%) → ROC3M<−σ24M (70%) → Z<0',
    crisis: 'Crisis de Venta Forzosa — avalancha escalonada',
    indicador: 'FINRA_DEBIT/GDP · ROC3M · SMA50 · σ24M',
    umbral: 'F1 Z>2.0 en 6M (armado con memoria) · G1 ROC<0&SMA50 · G2 ROC<−σ · F3/F4 sanación Z<0',
    icon: '🏦',
    color: 'from-red-500/20 to-rose-500/20',
    border: 'border-red-500/30',
  },
  {
    regimen: 'Complacencia Crediticia HY OAS',
    mide: 'Ceguera + Liquidez sistémica — 4 fases + Sanación',
    gatillo: 'Armado HY<P20 en 6M → G1 Δ3M>1.5σ & >5.0% + <SMA50 (30%) → G2 Δ1M≥1.00% o >SMA36M×1.30 (70%) → G3 <SMA3M+>SMA30 (30%) → G4 <SMA12M+>SMA100 (70%) · V2 mutex',
    crisis: 'Crisis Quiebras/Liquidez — congelamiento crédito',
    indicador: 'BAMLH0A0HYM2 + SMA_3/12/36M + σ24M + SMA_50/30/100',
    umbral: 'Armado P20_36M en 6M · G1 >1.5σ & >5.0% · G2 +1.00% o ×1.30 (V2) · G3 <SMA3M · G4 <SMA12M · SPY 0.75% legacy',
    icon: '😴',
    color: 'from-violet-500/20 to-purple-500/20',
    border: 'border-violet-500/30',
  },
];

export function RegimesDocsTable({ live }: { live?: RegimeLive }) {
  const L = useL();
  const [open, setOpen] = useState<string | null>(null);

  // Tooltip de estado vivo por régimen: lenguaje natural, icono+color y diferencial.
  const liveTip = (regimen: string): ReactNode => {
    if (!live) return <div className="text-slate-400">{L("Calculando estado en vivo…", "Computing live status…")}</div>;
    const head = (icon: string, title: string, ok: boolean|null) => (
      <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-slate-700">
        <span>{icon}</span>
        <span className="font-semibold text-slate-100">{title}</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${ok==null ? 'bg-slate-800 text-slate-400 border-slate-700' : ok ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>{ok==null ? L('sin dato', 'no data') : ok ? L('ACTIVO', 'ACTIVE') : L('apagado', 'off')}</span>
      </div>
    );
    const li = (ok: boolean|null, text: ReactNode) => (
      <div className="flex gap-1.5 leading-relaxed"><span>{ok==null ? '⚪' : ok ? '✅' : '▫️'}</span><span className="text-slate-300">{text}</span></div>
    );
    if (regimen === 'Múltiplos Altos') {
      const r = live.r1;
      const capeOk = r.cape != null && r.thr != null && r.cape > r.thr;
      const cpiOk = r.cpi != null && r.cpi >= 4.0 && r.cpiSma != null && r.cpi > r.cpiSma * 1.20;
      const g1Fed = r.dFed != null && r.dFed > 0;
      const g1Y10 = r.dgs10 != null && r.sma200x110 != null && r.dgs10 > r.sma200x110;
      return (<div className="space-y-1 text-[11px]">
        {head('📈', `${L('Múltiplos Altos', 'High Multiples')} @ ${live.date}`, r.active)}
        {li(r.active, r.active ? <>{L("Bosque seco armado: el mercado está caro ", "Dry forest armed: the market is expensive ")}<b>{L('y', 'and')}</b>{L(' la inflación amenaza (las dos patas de F0 se cumplen).', ' inflation is a threat (both F0 legs are met).')}</> : <>{L("Sin bosque seco: ", "No dry forest: ")}{capeOk ? L("el CAPE sí está caro", "CAPE is expensive") : <>{L("al CAPE ", "CAPE is ")}<span className={vGap}>{gapTxt(r.cape, r.thr)}</span>{L(" para el ×1.18", " away from ×1.18")}</>} {L('y', 'and')} {cpiOk ? L('el CPI sí amenaza', 'CPI is a threat') : L('el Core CPI no llega a 4%+20% sobre su media', 'Core CPI does not reach 4% and +20% over its mean')}. {L('Sin F0 no hay G1/G2.', 'Without F0 there is no G1/G2.')}</>)}
        {li(r.active && (g1Fed || g1Y10), <>{L('G1 (vende 30%):', 'G1 (sells 30%):')} {g1Fed ? L('la Fed subió tasas', 'the Fed raised rates') : <>{L('la Fed no se movió', 'the Fed did not move')} (<span className={vAct(false)}>{fmt(r.dFed, 2)}pp</span>)</>} · {g1Y10 ? <>{L('el 10Y', 'the 10Y')} (<span className={vAct(true)}>{fmt(r.dgs10)}%</span>{L(") supera su media×1.10 (", ") is above its mean×1.10 (")}<span className={vThr}>{fmt(r.sma200x110)}%</span>)</> : <>{L('el 10Y', 'the 10Y')} <span className={vGap}>{gapTxt(r.dgs10, r.sma200x110, '%')}</span> {L('para disparar', 'to trigger')}</>}.</>)}
        <div className="text-slate-500 pt-1">{L("Detalle por fase abajo, en cada gatillo.", "Detail by phase below, in each trigger.")}</div>
      </div>);
    }
    if (regimen === 'Alta Deuda/PIB') {
      const r = live.r2;
      return (<div className="space-y-1 text-[11px]">
        {head('🏦', `${L('Alta Deuda/PIB', 'High Debt/GDP')} @ ${live.date}`, r.active)}
        {li(r.armed, r.armed ? <>{L("Peligro sistémico: el apalancamiento explotó (Z>2.0 en los últimos 6M) y el régimen sigue armado por memoria.", "Systemic danger: leverage exploded (Z>2.0 in the last 6M) and the regime stays armed by memory.")}</> : <>{L("Sin peligro sistémico: ", "No systemic danger: ")}{r.z != null ? <>{L('Z actual', 'Current Z')} <span className={vAct(r.z >= 2)}>{fmt(r.z)}</span> — <span className={vGap}>{gapTxt(r.z, 2, 'σ')}</span>{L(" para armarse", " to arm")}</> : L("sin Z calculado", "no Z computed")} {L('y nada en 6M. Sin armado no hay G1/G2.', 'and nothing in 6M. Without arming there is no G1/G2.')}</>)}
        {li(r.armed && r.roc3m != null && r.roc3m < 0, <>{L('G1 (vende 30%):', 'G1 (sells 30%):')} {r.roc3m != null && r.roc3m < 0 ? L('la deuda ya deja de crecer', 'debt has stopped growing') : <>{L('la deuda sigue creciendo', 'debt keeps growing')} (ROC3M <span className={vAct(false)}>{fmt(r.roc3m)}%</span>)</>} {r.spy != null && r.sma50 != null && r.spy < r.sma50 ? L("y el precio rompió la SMA50", "and price broke the SMA50") : <>{L("pero el precio aguanta sobre la SMA50 (", "but price holds above the SMA50 (")}<span className={vGap}>{gapTxt(r.spy, r.sma50)}</span>)</>}.</>)}
        <div className="text-slate-500 pt-1">{L("Detalle por fase abajo, en cada gatillo.", "Detail by phase below, in each trigger.")}</div>
      </div>);
    }
    const r = live.r3;
    const hyOk = (r.hy != null && r.p20 != null && r.hy < r.p20) || (r.hy != null && r.hy < 3.5);
    return (<div className="space-y-1 text-[11px]">
      {head('😴', `${L('Complacencia HY', 'HY Complacency')} @ ${live.date}`, r.active)}
      {li(hyOk, hyOk ? <>{L("Ceguera al riesgo: el spread está anormalmente barato (HY ", "Risk blindness: the spread is abnormally cheap (HY ")}<span className={vAct(true)}>{fmt(r.hy)}%</span> {r.hy != null && r.hy < 3.5 ? L("bajo 3.5%", "below 3.5%") : <>{L("bajo su P20 de ", "below its P20 of ")}<span className={vThr}>{fmt(r.p20)}%</span></>}).</> : <>{L("Crédito con precio normal: HY ", "Normally priced credit: HY ")}<span className={vAct(r.hy == null ? null : false)}>{fmt(r.hy)}%</span> — {r.hy != null ? <>{L("necesita caer bajo su P20 (", "needs to fall below its P20 (")}<span className={vThr}>{fmt(r.p20)}%</span>{L(") o bajo 3.5%", ") or below 3.5%")}</> : L('sin dato', 'no data')}. {L('Sin armado no hay G1/G2.', 'Without arming there is no G1/G2.')}</>)}
      {li(r.armed && r.d3m != null && r.sig != null && r.d3m > 1.5 * r.sig, <>{L('G1 (vende 30%): el spread', 'G1 (sells 30%): the spread')} {r.d3m != null && r.sig != null && r.d3m > 1.5 * r.sig ? L("se está disparando (+1.5σ en 3M)", "is spiking (+1.5σ in 3M)") : <>{L("aún no acelera (Δ3M ", "is not accelerating yet (Δ3M ")}<span className={vAct(false)}>{fmt(r.d3m)}pp</span> vs <span className={vThr}>+{fmt(r.sig != null ? 1.5 * r.sig : null)}pp</span>)</>}.</>)}
      <div className="text-slate-500 pt-1">{L("Detalle por fase abajo, en cada gatillo.", "Detail by phase below, in each trigger.")}</div>
    </div>);
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{L("Documentación de Regímenes", "Regime documentation")}</h3>
          <p className="text-sm text-slate-400 mt-1">{L("Matriz de escaneo de bosque seco — combustible, chispa y crisis. ", "Dry-forest scan matrix — fuel, spark and crisis. ")}<span className="text-amber-400">{L("Activo en backtesting", "Active in backtesting")}</span>{L(" — `SPY_REGIMEN3` + `TQQQ_EXCLUSIVE_V2` `G2 1.00%`. Click para ver regla.", " — click a regime to see its rule.")}</p>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">v2 · 2026-08-26 · 5.0%/1.5σ/1.00% · mutex</span>
      </div>

      {/* Tabla estilo markdown pero con Tailwind */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 backdrop-blur">
              <tr className="text-slate-300">
                <th className="p-3 text-left font-semibold whitespace-nowrap">{L("Régimen", "Regime")}</th>
                <th className="p-3 text-left font-semibold">{L("Qué Mide", "What it measures")}</th>
                <th className="p-3 text-left font-semibold">{L("Qué lo Detona ", "What triggers it ")}<span className="text-slate-500 font-normal">{L("(El Gatillo)", "(the trigger)")}</span></th>
                <th className="p-3 text-left font-semibold">{L("Tipo de Crisis Resultante", "Resulting crisis type")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <tr
                  key={r.regimen}
                  onClick={() => setOpen(open === r.regimen ? null : r.regimen)}
                  className={`cursor-pointer hover:bg-slate-800/40 transition ${open === r.regimen ? 'bg-slate-800/30' : ''}`}
                >
                  <td className="p-3">
                    <div className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${r.color} border ${r.border} text-slate-100 font-semibold text-xs whitespace-nowrap cursor-help`}>
                      <span>{r.icon}</span> {L(r.regimen, ROWS_EN[r.regimen].regimen)}
                      <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center border border-slate-600">?</span>
                      <div className="hidden group-hover:block absolute z-50 left-0 top-full mt-2 w-80 p-3 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl text-left normal-case font-normal whitespace-normal">{liveTip(r.regimen)}</div>
                    </div>
                    {open === r.regimen && (
                      <div className="mt-2 text-xs text-slate-400 space-y-1">
                        <div><span className="text-slate-500">{L("Indicador:", "Indicator:")}</span> <span className="font-mono text-slate-300">{L(r.indicador, ROWS_EN[r.regimen].indicador)}</span></div>
                        <div><span className="text-slate-500">{L("Umbral:", "Threshold:")}</span> <span className="font-mono text-amber-300">{L(r.umbral, ROWS_EN[r.regimen].umbral)}</span></div>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-slate-300">{L(r.mide, ROWS_EN[r.regimen].mide)}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium">{L(r.gatillo, ROWS_EN[r.regimen].gatillo)}</span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-medium ${r.regimen==='Múltiplos Altos' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : r.regimen==='Alta Deuda/PIB' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-violet-500/10 text-violet-300 border-violet-500/20'}`}>{L(r.crisis, ROWS_EN[r.regimen].crisis)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-slate-800/50 border-t border-slate-800 text-xs text-slate-500 flex flex-wrap gap-3">
          <span>{L("💡 Click en el régimen para ver indicador y umbral", "💡 Click a regime to see indicator and threshold")}</span>
          <span className="ml-auto">{L("CAPE = Shiller · OAS = BAMLH0A0HYM2 · Margin = FINRA_DEBIT/GDP · Fuente: ", "CAPE = Shiller · OAS = BAMLH0A0HYM2 · Margin = FINRA_DEBIT/GDP · Source: ")}<span className="font-mono">docs/regimes.md</span></span>
        </div>
      </div>

      {/* Detalle expandido estilo markdown */}
      {open && (
        <div className="mt-4 rounded-xl bg-slate-800/50 border border-slate-700 p-4">
          {open === 'Múltiplos Altos' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-amber-300">{L("1. Bosque Seco por Múltiplos Altos — 4 Fases + Sanación — Riesgo de Duración y Tasas", "1. Dry Forest from High Multiples — 4 Phases + Healing — Duration and Rate Risk")}</div>
              <p className="text-slate-400 text-xs leading-relaxed">{L("Detecta sobrevaloración + inflación amenazando liquidez. ", "Detects overvaluation + inflation threatening liquidity. ")}<b className="text-amber-300">{L("Scaling In/Out por tranches", "Scaling in/out in tranches")}</b>{L(" calibrado contra choques de inflación y tasas.", " calibrated against inflation and rate shocks.")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("El Combustible", "The Fuel")}</span><span className="text-slate-200">{L("Sobrevaloración + Core CPI acelerado", "Overvaluation + accelerating Core CPI")}</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("La Chispa", "The Spark")}</span><span className="text-amber-300">{L("Fed y Bono 10Y comprimen múltiplos", "Fed and 10Y bond compress multiples")}</span></div>
              </div>
              <div className="space-y-2">
                <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-800/50">
                  <div className="text-[11px] font-semibold text-amber-200">{L("F0 — Condición Estructural (Bosque Seco)", "F0 — Structural Condition (Dry Forest)")}</div>
                  <div className="text-xs text-amber-200 font-mono mt-1">CAPE &gt; SMA<sub>36M</sub>×1.18 AND Core CPI YoY ≥4.0 &amp; &gt; SMA<sub>12M</sub>×1.20</div>
                  <div className="text-[11px] text-amber-300/70 mt-1">{L("+20% sobre media 3a y +15% sobre media 12M Core CPI (CPILFESL) → alerta, detiene compras", "+20% over 3y mean and +15% over 12M mean Core CPI (CPILFESL) → alert, stops buying")}</div>
                  {live && (()=>{ const r=live.r1; const thr120=r.cpiSma!=null?r.cpiSma*1.20:null;
                    const head = r.active
                      ? <div><b>{L("🔴 Armado.", "🔴 Armed.")}</b>{L(" El mercado está caro y la inflación amenaza — se detienen compras.", " The market is expensive and inflation is a threat — buying stops.")}</div>
                      : <div><b>{L("⚪ No armado.", "⚪ Not armed.")}</b>{L(" Falta al menos una pata. Sin F0 no hay G1/G2.", " At least one leg is missing. Without F0 there is no G1/G2.")}</div>;
                    return <LiveLine tone={r.active?'bad':'idle'} icon={r.active?'🔴':'⚪'}>{head}
                      <Leg name={L("Pata CAPE", "CAPE leg")} actual={r.cape} target={r.thr}/>
                      <div>{(()=>{ const c1=r.cpi!=null&&r.cpi>=4.0; const c2=r.cpi!=null&&thr120!=null&&r.cpi>thr120; const hit=c1&&c2; return <>{hit?'✅':'▫️'} {L('Pata CPI: actual', 'CPI leg: current')} <span className={vAct(r.cpi==null?null:hit)}>{fmt(r.cpi)}%</span>{L(" — necesita ≥", " — needs ≥")}<span className={vThr}>4.00%</span> {r.cpi!=null?(c1?<span>(✅ {L('margen', 'margin')} <span className={vGap}>{fmt(r.cpi-4.0)}pp</span>)</span>:<span>({L('faltan', 'missing')} <span className={vGap}>{fmt(4.0-r.cpi)}pp</span>)</span>):L("(sin dato)", "(no data)")} {L('y > media×1.20 =', 'and > mean×1.20 =')} <span className={vThr}>{fmt(thr120)}%</span> {r.cpi!=null&&thr120!=null?(c2?<span>(✅ {L('margen', 'margin')} <span className={vGap}>{fmt(r.cpi-thr120)}pp</span>)</span>:<span>({L('faltan', 'missing')} <span className={vGap}>{fmt(thr120-r.cpi)}pp</span>)</span>):L("(sin dato)", "(no data)")}</>; })()}</div>
                    </LiveLine>; })()}
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-orange-300">{L("Fase Defensiva — Scaling Out", "Defensive Phase — Scaling Out")}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-orange-950/20 rounded p-2 border border-orange-800/30">
                      <div className="text-[11px] font-semibold text-orange-200">{L("Gatillo 1 — Alerta Temprana (30%)", "Trigger 1 — Early Warning (30%)")}</div>
                      <div className="text-[11px] font-mono text-orange-100 mt-1">Δ FED &gt;0 OR 10Y &gt; SMA<sub>200</sub>×1.10</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("1ª subida Fed o 10Y +10% → vende 30% a SGOV · 70/30", "1st Fed hike or 10Y +10% → sells 30% into SGOV · 70/30")}</div>
                      {live && (()=>{ const r=live.r1; if(!r.active) return <LiveLine tone="lock" icon="🔒">{L("Bloqueado: primero debe armarse F0 (hoy apagado).", "Blocked: F0 must arm first (off today).")}</LiveLine>;
                        const fed=r.dFed!=null&&r.dFed>0, y10=r.dgs10!=null&&r.sma200x110!=null&&r.dgs10>r.sma200x110;
                        if(fed||y10) return <LiveLine tone="bad" icon="🔴"><b>{L("Dispara → vende 30%.", "Triggers → sells 30%.")}</b><br/><Leg name={L("Pata FED", "Fed leg")} actual={r.dFed} target={0} unit="pp" strict/><Leg name={L("Pata 10Y", "10Y leg")} actual={r.dgs10} target={r.sma200x110} unit="%"/></LiveLine>;
                        return <LiveLine tone="idle" icon="⚪"><b>{L("No dispara.", "Does not trigger.")}</b><br/><Leg name={L("Pata FED", "Fed leg")} actual={r.dFed} target={0} unit="pp" strict/><Leg name={L("Pata 10Y", "10Y leg")} actual={r.dgs10} target={r.sma200x110} unit="%"/></LiveLine>; })()}
                    </div>
                    <div className="bg-red-950/30 rounded p-2 border border-red-800/30">
                      <div className="text-[11px] font-semibold text-red-200">{L("Gatillo 2 — Venta Total (70%)", "Trigger 2 — Full Sale (70%)")}</div>
                      <div className="text-[11px] font-mono text-red-100 mt-1">{L("Δ FED ≥+0.50% en 1 junta AND Core CPI > SMA", "Δ FED ≥+0.50% in 1 meeting AND Core CPI > SMA")}<sub>36M</sub>×1.30</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Jumbo Hike + inflación +30% 3a → vende 70% restante · 0/100", "Jumbo hike + inflation +30% 3y → sells remaining 70% · 0/100")}</div>
                      {live && (()=>{ const r=live.r1; const spyOk=r.spy!=null&&r.sma50!=null&&r.spy<r.sma50;
                        return <LiveLine tone="lock" icon="🔒">{L("Requiere G1 previo (cadena). Patas hoy: Core CPI ", "Requires prior G1 (chain). Legs today: Core CPI ")}<span className={vAct(r.cpi != null && r.cpi >= 4)}>{fmt(r.cpi)}%</span> {L('y SPX', 'and SPX')} {spyOk?L('bajo', 'below'):L('sobre', 'above')} {L('la SMA50', 'the SMA50')} (<span className={vAct(spyOk)}>{fmt(r.spy)}</span> vs <span className={vThr}>{fmt(r.sma50)}</span>).</LiveLine>; })()}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-sky-300">{L("Fase Ofensiva — Scaling In", "Offensive Phase — Scaling In")}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-sky-950/20 rounded p-2 border border-sky-800/30">
                      <div className="text-[11px] font-semibold text-sky-200">{L("Gatillo 3 — Compra Asalto (35%)", "Trigger 3 — Assault Buy (35%)")}</div>
                      <div className="text-[11px] font-mono text-sky-100 mt-1">{L("Core CPI 3M caídas vs pico OR Δ FED=0 ×2M", "Core CPI 3M declines vs peak OR Δ FED=0 ×2M")}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Desaceleración 3M o Pausa 2M → compra 35% a activo subyacente (SPY/QQQ/TQQQ) · 35/65", "3M slowdown or 2M pause → buys 35% of the underlying asset (SPY/QQQ/TQQQ) · 35/65")}</div>
                      {live && <LiveLine tone="lock" icon="🔒">{L("Requiere G2 previo (cadena). Contexto: Core CPI ", "Requires prior G2 (chain). Context: Core CPI ")}<span className={vAct(live.r1.cpi != null && live.r1.cpi >= 4)}>{fmt(live.r1.cpi)}%</span>{L(" con la Fed en ", " with the Fed at ")}<span className={vAct(live.r1.dFed != null && live.r1.dFed > 0)}>{fmt(live.r1.dFed,2)}pp</span>{L(" de cambio.", " change.")}</LiveLine>}
                    </div>
                    <div className="bg-emerald-950/20 rounded p-2 border border-emerald-800/30">
                      <div className="text-[11px] font-semibold text-emerald-200">{L("Gatillo 4 — Compra Total (65%)", "Trigger 4 — Full Buy (65%)")}</div>
                      <div className="text-[11px] font-mono text-emerald-100 mt-1">(Core CPI &lt; SMA<sub>12M</sub>×1.05 OR Δ FED&lt;0){L(" AND Precio > SMA", " AND Price > SMA")}<sub>50</sub></div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Doble Llave Macro+Técnica → inyecta 65% final · 100% riesgo", "Macro+technical double key → injects final 65% · 100% risk")}</div>
                      {live && (()=>{ const r=live.r1; const cpiOk=r.cpi!=null&&r.cpiSma!=null&&r.cpi<r.cpiSma*1.05; const fedOk=r.dFed!=null&&r.dFed<0; const pxOk=r.spy!=null&&r.sma50!=null&&r.spy>r.sma50;
                        return <LiveLine tone="lock" icon="🔒">{L("Requiere G3 previo (cadena). Llaves hoy: CPI bajo su media×1.05 (", "Requires prior G3 (chain). Keys today: CPI below its mean×1.05 (")}<span className={vAct(cpiOk)}>{fmt(r.cpi)}%</span> vs <span className={vThr}>{fmt(r.cpiSma!=null?r.cpiSma*1.05:null)}%</span>) {cpiOk?'✅':'▫️'} · {L('Fed recortando', 'Fed cutting')} {fedOk?'✅':'▫️'} · {L('precio sobre SMA50', 'price above SMA50')} {pxOk?'✅':<>▫️ (SPY <span className={vGap}>{gapTxt(r.spy,r.sma50)}</span>{L(" para estar arriba)", " to be above)")}</>}.</LiveLine>; })()}
                    </div>
                  </div>
                </div>
                <div className="bg-purple-950/30 rounded-lg p-3 border border-purple-700/50">
                  <div className="text-[11px] font-semibold text-purple-300">{L("Sanación — Falsa Alarma", "Healing — False Alarm")}</div>
                  <div className="text-[11px] font-mono text-purple-200 mt-1">Core CPI &lt; SMA<sub>12M</sub>×1.05{L(" AND Precio > SMA", " AND Price > SMA")}<sub>50</sub></div>
                  <div className="text-[10px] text-slate-400 mt-1">{L("Tras G1 (70/30) sin G2 y precio recupera → recompra 30% → 100%", "After G1 (70/30) without G2 and price recovers → buys back 30% → 100%")}</div>
                  {live && <LiveLine tone="lock" icon="🔒">{L("Solo aplica tras un G1 sin G2 (hoy no hay G1 activo).", "Only applies after a G1 without G2 (no active G1 today).")}</LiveLine>}
                </div>
              </div>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-amber-500 text-xs"><span className="text-slate-400">{L("Ejemplo 2022:", "2022 example:")}</span>{L(" Nasdaq -35% — habría hecho Scaling Out en G1 (10Y>SMA200×1.10) y reingreso en G3/G4 tras pausa Fed y CPI<SMA12M×1.05+SMA50.", " Nasdaq −35% — it would have scaled out at G1 (10Y>SMA200×1.10) and re-entered at G3/G4 after the Fed pause and CPI<SMA12M×1.05+SMA50.")}</p>
            </div>
          )}
          {open === 'Alta Deuda/PIB' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-red-300">{L("2. Bosque Seco por Alta Deuda / PIB — 4 Fases — Riesgo de Liquidación Forzosa", "2. Dry Forest from High Debt / GDP — 4 Phases — Forced Liquidation Risk")}</div>
              <p className="text-slate-400 text-xs leading-relaxed">{L("Mide apalancamiento sistémico. Estado ", "Measures systemic leverage. State ")}<b className="text-red-300">{L("armado con memoria", "armed with memory")}</b>{L(": persiste aunque Z baje, hasta sanación o Z<0.", ": it persists even if Z falls, until healing or Z<0.")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("El Combustible", "The Fuel")}</span><span className="text-slate-200">{L("Dinero prestado (Margin Debt)", "Borrowed money (margin debt)")}</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("Estado", "State")}</span><span className="text-red-300">{L("Armado si Z>2.0 en 6M — detiene compras", "Armed if Z>2.0 in 6M — stops buying")}</span></div>
              </div>
              <div className="space-y-2">
                <div className="bg-red-950/30 rounded-lg p-3 border border-red-800/50">
                  <div className="text-[11px] font-semibold text-red-200">{L("Fase 1 — El Armado (Peligro Sistémico)", "Phase 1 — Arming (Systemic Danger)")}</div>
                  <div className="text-xs text-red-200 font-mono mt-1">{L("Z(Margin/GDP) > +2.0 en cualquier momento de últimos 6 meses", "Z(Margin/GDP) > +2.0 at any time in the last 6 months")}</div>
                  <div className="text-[11px] text-red-300/70 mt-1">Z=(Margin/GDP−SMA36M)/σ36M · Margin/GDP=FINRA_DEBIT/GDP×100 · <b>{L("con memoria", "with memory")}</b>{L(": no se desarma aunque Z baje", ": does not disarm even if Z falls")}</div>
                  {live && (()=>{ const r=live.r2;
                    if(r.armed) return <LiveLine tone="bad" icon="🔴"><b>{L("Armado", "Armed")}</b>{L(" (memoria 6M): el apalancamiento explotó y el régimen sigue activo aunque el Z actual baje.", " (6M memory): leverage exploded and the regime stays active even if the current Z falls.")}<br/><Leg name={L("Z actual", "Current Z")} actual={r.z} target={0} dir="down" unit="σ"/></LiveLine>;
                    return <LiveLine tone="idle" icon="⚪"><b>{L("No armado.", "Not armed.")}</b>{L(" Nada en 6M — sin armado se detiene la cadena (no hay G1/G2).", " Nothing in 6M — without arming the chain stops (no G1/G2).")}<br/><Leg name={L("Pata Z", "Z leg")} actual={r.z} target={2} unit="σ"/></LiveLine>; })()}
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-amber-300">{L("Fase 2 — Scaling Out — Venta Defensiva", "Phase 2 — Scaling Out — Defensive Selling")}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-amber-950/20 rounded p-2 border border-amber-800/30">
                      <div className="text-[11px] font-semibold text-amber-200">{L("Gatillo 1 — Alerta Temprana (30%)", "Trigger 1 — Early Warning (30%)")}</div>
                      <div className="text-[11px] font-mono text-amber-100 mt-1">{L("ROC₃M(Margin/GDP) < 0  AND  Cierre < SMA₅₀d", "ROC₃M(Margin/GDP) < 0  AND  Close < SMA₅₀d")}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Deuda trimestral deja de crecer + ruptura SMA50 → vende 30% · 70/30", "Quarterly debt stops growing + SMA50 break → sells 30% · 70/30")}</div>
                      {live && (()=>{ const r=live.r2; if(!r.armed) return <LiveLine tone="lock" icon="🔒">{L("Bloqueado: primero debe armarse Fase 1 (hoy apagada).", "Blocked: Phase 1 must arm first (off today).")}</LiveLine>;
                        const roc=r.roc3m!=null&&r.roc3m<0, px=r.spy!=null&&r.sma50!=null&&r.spy<r.sma50;
                        if(roc&&px) return <LiveLine tone="bad" icon="🔴"><b>{L("Dispara → vende 30%.", "Triggers → sells 30%.")}</b><br/><Leg name={L("Pata ROC3M", "ROC3M leg")} actual={r.roc3m} target={0} dir="down" unit="pp"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>;
                        return <LiveLine tone="idle" icon="⚪"><b>{L("No dispara.", "Does not trigger.")}</b><br/><Leg name={L("Pata ROC3M", "ROC3M leg")} actual={r.roc3m} target={0} dir="down" unit="pp"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>; })()}
                    </div>
                    <div className="bg-red-950/30 rounded p-2 border border-red-800/30">
                      <div className="text-[11px] font-semibold text-red-200">{L("Gatillo 2 — Pánico Margin Call (70%)", "Trigger 2 — Margin Call Panic (70%)")}</div>
                      <div className="text-[11px] font-mono text-red-100 mt-1">ROC₃M &lt; −1×σ₂₄M(ROC₃M)</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Caída supera volatilidad 2años → vende 70% restante · 0/100", "Drop exceeds 2-year volatility → sells remaining 70% · 0/100")}</div>
                      {live && (()=>{ const r=live.r2; const thr=r.sigma24!=null?-r.sigma24:null; const hit=r.roc3m!=null&&thr!=null&&r.roc3m<thr;
                        if(!r.armed) return <LiveLine tone="lock" icon="🔒">{L("Bloqueado: requiere Fase 1 armada.", "Blocked: requires Phase 1 armed.")}<br/><Leg name={L("Pata ROC3M", "ROC3M leg")} actual={r.roc3m} target={thr} dir="down" unit="pp"/></LiveLine>;
                        if(hit) return <LiveLine tone="bad" icon="🔴"><b>{L("Dispara → vende 70%.", "Triggers → sells 70%.")}</b>{L(" Desapalancamiento violento.", " Violent deleveraging.")}<br/><Leg name={L("Pata ROC3M", "ROC3M leg")} actual={r.roc3m} target={thr} dir="down" unit="pp"/></LiveLine>;
                        return <LiveLine tone="idle" icon="⚪"><b>{L("No dispara.", "Does not trigger.")}</b><br/><Leg name={L("Pata ROC3M", "ROC3M leg")} actual={r.roc3m} target={thr} dir="down" unit="pp"/></LiveLine>; })()}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-emerald-950/20 rounded-lg p-3 border border-emerald-800/30">
                    <div className="text-[11px] font-semibold text-emerald-200">{L("Fase 3 — Sanación (Falsa Alarma)", "Phase 3 — Healing (False Alarm)")}</div>
                    <div className="text-[11px] font-mono text-emerald-100 mt-1">{L("Cierre > SMA₅₀  AND  ROC₃M > 0", "Close > SMA₅₀  AND  ROC₃M > 0")}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{L("Tras G1 sin G2 y precio recupera → recompra 30% → 100% exposición", "After G1 without G2 and price recovers → buys back 30% → 100% exposure")}</div>
                    {live && <LiveLine tone="lock" icon="🔒">{L("Solo aplica tras un G1 sin G2 (hoy no hay G1 activo).", "Only applies after a G1 without G2 (no active G1 today).")}</LiveLine>}
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <div className="text-[11px] font-semibold text-slate-200">{L("Fase 4 — Desarme Total", "Phase 4 — Full Disarm")}</div>
                    <div className="text-[11px] font-mono text-slate-100 mt-1">Z(Margin/GDP) &lt; 0</div>
                    <div className="text-[10px] text-slate-400 mt-1">{L("Deuda bajo promedio 3a → purga completa → régimen desactivo", "Debt below 3y average → full purge → regime inactive")}</div>
                    {live && (()=>{ const r=live.r2; const off=r.z!=null&&r.z<0;
                      if(off) return <LiveLine tone="ok" icon="🟢">{L("Desarmado: Z en ", "Disarmed: Z at ")}<span className={vAct(false)}>{fmt(r.z)}</span>{L(" bajo cero — purga completa, régimen apagado.", " below zero — full purge, regime off.")}</LiveLine>;
                      return <LiveLine tone="idle" icon="⚪">{L("Sin desarme: Z en ", "No disarm: Z at ")}<span className={vAct(r.z != null && r.z >= 0)}>{fmt(r.z)}</span> — <span className={vGap}>{gapTxt(r.z!=null?0-r.z:null,0)}</span>.</LiveLine>; })()}
                  </div>
                </div>
              </div>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-red-500 text-xs"><span className="text-slate-400">{L("Ejemplo 1929 y 2000:", "1929 and 2000 example:")}</span>{L(" Margen extremo + desapalancamiento aniquiló mercado. Nuevo modelo escalona salida por ROC y SMA50.", " Extreme margin + deleveraging wiped out the market. The new model stages the exit by ROC and SMA50.")}</p>
            </div>
          )}
          {open === 'Complacencia Crediticia HY OAS' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-violet-300">{L("3. Complacencia Crediticia & Riesgo Sistémico (HY OAS) — 4 Fases + Sanación ", "3. Credit Complacency & Systemic Risk (HY OAS) — 4 Phases + Healing ")}<span className="text-amber-300 text-xs">{L("· Activo — SPY_REGIMEN3", "· Active")}</span></div>
              <p className="text-slate-400 text-xs leading-relaxed">{L("Protege contra ", "Protects against ")}<b className="text-violet-300">{L("congelamiento del crédito, crisis de liquidez y quiebras sistémicas", "credit freezes, liquidity crises and systemic bankruptcies")}</b>{L(" vía ", " via ")}<b>HY OAS (BAMLH0A0HYM2)</b>{L(" + confirmación técnica ", " + technical confirmation ")}<b>SMA 50/30/100</b>{L(". Escala independiente de R1 y R2.", ". Scales independently of R1 and R2.")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("El Combustible", "The Fuel")}</span><span className="text-slate-200">{L("Ceguera al riesgo — OAS muy bajo (Default Risk ignorado)", "Risk blindness — very low OAS (default risk ignored)")}</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">{L("La Chispa", "The Spark")}</span><span className="text-violet-300">{L("Congelamiento crédito / quiebra que dispara spreads", "Credit freeze / bankruptcy that spikes spreads")}</span></div>
              </div>
              <div className="space-y-2">
                <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-800/50">
                  <div className="text-[11px] font-semibold text-amber-200">{L("F0 — Estado de Armado (Fase Vigilancia · 6M)", "F0 — Armed State (Watch Phase · 6M)")}</div>
                  <div className="text-xs text-amber-200 font-mono mt-1">{L("HY OAS < Percentil", "HY OAS < Percentile")}<sub>20,36M</sub>{L(" en algún momento últimos 6 meses", " at some point in the last 6 months")}</div>
                  <div className="text-[11px] text-amber-300/70 mt-1">{L("BAMLH0A0HYM2 < P20_36M → complacencia extrema previa a burbuja. Sin armado no hay G1/G2.", "BAMLH0A0HYM2 < P20_36M → extreme complacency before a bubble. Without arming there is no G1/G2.")}</div>
                  {live && (()=>{ const r=live.r3;
                    if(r.armed) return <LiveLine tone="bad" icon="🔴"><b>{L("Armado.", "Armed.")}</b>{L(" El spread estuvo anormalmente barato en 6M — el crédito duerme, vigilando el salto.", " The spread was abnormally cheap within 6M — credit is asleep, watching for the jump.")}</LiveLine>;
                    return <LiveLine tone="idle" icon="⚪"><b>{L("No armado.", "Not armed.")}</b>{L(" Sin armado no hay G1/G2.", " Without arming there is no G1/G2.")}<br/><Leg name={L("Pata HY", "HY leg")} actual={r.hy} target={r.p20} dir="down" unit="%"/></LiveLine>; })()}
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-orange-300">{L("Fase Defensiva — Scaling Out", "Defensive Phase — Scaling Out")}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-orange-950/20 rounded p-2 border border-orange-800/30">
                      <div className="text-[11px] font-semibold text-orange-200">{L("Gatillo 1 — Alerta Temprana (30%)", "Trigger 1 — Early Warning (30%)")}</div>
                      <div className="text-[11px] font-mono text-orange-100 mt-1">Δ3M &gt;1.5×σ24M AND &gt;5.0% AND &lt;SMA50</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Doble llave estricta: spread +1.5σ en 3M y nivel >5.0% + <SMA50 → vende 30% · 70/30", "Strict double key: spread +1.5σ in 3M and level >5.0% + <SMA50 → sells 30% · 70/30")}</div>
                      {live && (()=>{ const r=live.r3; if(!r.armed) return <LiveLine tone="lock" icon="🔒">{L("Bloqueado: primero debe armarse (hoy apagado).", "Blocked: it must arm first (off today).")}</LiveLine>;
                        const ace=r.d3m!=null&&r.sig!=null&&r.d3m>1.5*r.sig, lvl=r.hy!=null&&r.hy>5.0, px=r.spy!=null&&r.sma50!=null&&r.spy<r.sma50;
                        const thr15=r.sig!=null?1.5*r.sig:null;
                        if(ace&&lvl&&px) return <LiveLine tone="bad" icon="🔴"><b>{L("Dispara → vende 30%.", "Triggers → sells 30%.")}</b><br/><Leg name={L("Pata aceleración", "Acceleration leg")} actual={r.d3m} target={thr15} unit="pp"/><Leg name={L("Pata nivel", "Level leg")} actual={r.hy} target={5.0} unit="%"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>;
                        return <LiveLine tone="idle" icon="⚪"><b>{L("No dispara.", "Does not trigger.")}</b><br/><Leg name={L("Pata aceleración", "Acceleration leg")} actual={r.d3m} target={thr15} unit="pp"/><Leg name={L("Pata nivel", "Level leg")} actual={r.hy} target={5.0} unit="%"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>; })()}
                    </div>
                    <div className="bg-red-950/30 rounded p-2 border border-red-800/30">
                      <div className="text-[11px] font-semibold text-red-200">{L("Gatillo 2 — Pánico Sistémico (70%)", "Trigger 2 — Systemic Panic (70%)")}</div>
                      <div className="text-[11px] font-mono text-red-100 mt-1">Δ1M ≥+1.00% OR &gt;SMA36M×1.30 AND &lt;SMA50</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("V2 +1.00% (TQQQ `bear -19%` falso → SAN) — SPY legacy 0.75% → evacua 70% · 0/100", "V2 +1.00% (TQQQ false `bear −19%` → healing) — SPY legacy 0.75% → evacuates 70% · 0/100")}</div>
                      {live && (()=>{ const r=live.r3; const thr36=r.sma36!=null?r.sma36*1.30:null; const legA=r.d1m!=null&&r.d1m>=1.00, legB=r.hy!=null&&thr36!=null&&r.hy>thr36; const px=r.spy!=null&&r.sma50!=null&&r.spy<r.sma50;
                        if(!r.armed) return <LiveLine tone="lock" icon="🔒">{L("Bloqueado: requiere armado.", "Blocked: requires arming.")}<br/><Leg name={L("Pata salto mensual", "Monthly jump leg")} actual={r.d1m} target={1.00} unit="pp"/><Leg name={L("Pata nivel vs media", "Level vs mean leg")} actual={r.hy} target={thr36} unit="%"/></LiveLine>;
                        if((legA||legB)&&px) return <LiveLine tone="bad" icon="🔴"><b>{L("Dispara → evacua 70%.", "Triggers → evacuates 70%.")}</b><br/><Leg name={L("Pata salto mensual", "Monthly jump leg")} actual={r.d1m} target={1.00} unit="pp"/><Leg name={L("Pata nivel vs media", "Level vs mean leg")} actual={r.hy} target={thr36} unit="%"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>;
                        return <LiveLine tone="idle" icon="⚪"><b>{L("No dispara.", "Does not trigger.")}</b><br/><Leg name={L("Pata salto mensual", "Monthly jump leg")} actual={r.d1m} target={1.00} unit="pp"/><Leg name={L("Pata nivel vs media", "Level vs mean leg")} actual={r.hy} target={thr36} unit="%"/><Leg name={L("Pata precio", "Price leg")} actual={r.spy} target={r.sma50} dir="down"/></LiveLine>; })()}
                    </div>
                  </div>
                </div>
                <div className="bg-purple-950/30 rounded-lg p-3 border border-purple-700/50">
                  <div className="text-[11px] font-semibold text-purple-300">{L("Sanación — Falsa Alarma", "Healing — False Alarm")}</div>
                  <div className="text-[11px] font-mono text-purple-200 mt-1">{L("HY < SMA3M AND Precio > SMA50", "HY < SMA3M AND Price > SMA50")}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{L("Tras G1 (70/30) sin G2 y spread perfora media 3M con rebote → recompra 30% → 100%", "After G1 (70/30) without G2 and the spread breaks its 3M mean with a rebound → buys back 30% → 100%")}</div>
                  {live && <LiveLine tone="lock" icon="🔒">{L("Solo aplica tras un G1 sin G2 (hoy no hay G1 activo).", "Only applies after a G1 without G2 (no active G1 today).")}</LiveLine>}
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-sky-300">{L("Fase Ofensiva — Scaling In (post-evacuación 0%)", "Offensive Phase — Scaling In (post-evacuation 0%)")}</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-sky-950/20 rounded p-2 border border-sky-800/30">
                      <div className="text-[11px] font-semibold text-sky-200">{L("Gatillo 3 — Primera Recompra (30%)", "Trigger 3 — First Buyback (30%)")}</div>
                      <div className="text-[11px] font-mono text-sky-100 mt-1">HY &lt; SMA3M AND &gt;SMA30</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Perfora media 3M + >SMA30 (SMA50 alternativa) → inyecta 30% · 30/70", "Breaks 3M mean + >SMA30 (SMA50 alternative) → injects 30% · 30/70")}</div>
                      {live && (()=>{ const r=live.r3; const hyOk=r.hy!=null&&r.sma3m!=null&&r.hy<r.sma3m;
                        return <LiveLine tone="lock" icon="🔒">{L('Requiere evacuación previa (cadena). Hoy: spread', 'Requires prior evacuation (chain). Today: spread')} {hyOk?L('bajo su SMA3M ✅', 'below its SMA3M ✅'):<>{L('sobre su SMA3M', 'above its SMA3M')} (<span className={vAct(false)}>{fmt(r.hy)}%</span> vs <span className={vThr}>{fmt(r.sma3m)}%</span>) ▫️</>}.</LiveLine>; })()}
                    </div>
                    <div className="bg-emerald-950/20 rounded p-2 border border-emerald-800/30">
                      <div className="text-[11px] font-semibold text-emerald-200">{L("Gatillo 4 — Reingreso Masivo (70%)", "Trigger 4 — Massive Re-entry (70%)")}</div>
                      <div className="text-[11px] font-mono text-emerald-100 mt-1">HY &lt; SMA12M AND &gt;SMA100</div>
                      <div className="text-[10px] text-slate-400 mt-1">{L("Normalización: <SMA12M + >SMA100 (alternativa SMA200) → recompra 70% → 100%", "Normalization: <SMA12M + >SMA100 (SMA200 alternative) → buys back 70% → 100%")}</div>
                      {live && (()=>{ const r=live.r3; const hyOk=r.hy!=null&&r.sma12m!=null&&r.hy<r.sma12m;
                        return <LiveLine tone="lock" icon="🔒">{L('Requiere G3 previo (cadena). Hoy: spread', 'Requires prior G3 (chain). Today: spread')} {hyOk?L('bajo su SMA12M ✅', 'below its SMA12M ✅'):<>{L('sobre su SMA12M', 'above its SMA12M')} (<span className={vAct(false)}>{fmt(r.hy)}%</span> vs <span className={vThr}>{fmt(r.sma12m)}%</span>) ▫️</>}.</LiveLine>; })()}
                    </div>
                  </div>
                </div>
              </div>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-violet-500 text-xs"><span className="text-slate-400">{L("Ejemplo 2007-08:", "2007-08 example:")}</span>{L(" OAS <3.0% “sin riesgo” → 2008 saltó >11% tras subprime — G1 Δ3M>1.2σ & >4.3% + <SMA50, G2 Δ1M≥0.50%.", " OAS <3.0% “risk-free” → in 2008 it jumped >11% after subprime — G1 Δ3M>1.2σ & >4.3% + <SMA50, G2 Δ1M≥0.50%.")}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        {L('Ver fuente markdown en', 'See markdown source in')} <span className="font-mono text-slate-400">docs/regimes.md</span> · <em>{L('Activo — umbrales iguales a los del backtesting (V2 1.00%).', 'Active — thresholds match the backtesting (V2 1.00%).')}</em>
      </div>
    </div>
  );
}
