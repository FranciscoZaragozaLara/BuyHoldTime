'use client';
// Vista "Drawdowns" del popover del BHT. Se carga con next/dynamic (su código se descarga solo al pulsar el botón)
// y pide el cálculo al backend bajo demanda; los resultados quedan en memoria por (fecha, instrumento).
// 1) Caída máxima del instrumento en cada año posterior a la fecha. 2) Tramos de compra/venta con el BHT
// contra Hold completo.
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { bhtBand, capeScoreColor } from './bhtBands';
import { TOKENS } from '@/lib/designTokens';

type Instrument = 'spx' | 'qqq' | 'tqqq';
type MaxDd = { pct: number; peakDate: string | null; troughDate: string | null };
type PricePoint = { date: string; price: number; bht: number | null };
type Result = {
  date: string; bht: number;
  base: { price: number | null; today: string; todayPrice: number | null };
  years: Array<{ year: number; from: string; to: string; partial: boolean; peakDate: string | null; peakPrice: number | null; troughDate: string | null; troughPrice: number | null; ddPct: number | null; vsBasePct: number | null }>;
  sinceBuy?: {
    maxDd: { pct: number; nominal: number; vsBasePct: number; peak: PricePoint; trough: PricePoint } | null;
    maxPeak: (PricePoint & { pct: number; nominal: number }) | null;
  };
  trades: Array<{ type: 'sell' | 'buy'; level: number; date: string; price: number; bhtPrev: number | null; bhtHit: number; vsBasePct: number; invested: number; reason?: 'ladder' | 'trend' }>;
  hold: { pct: number | null; maxDd: MaxDd | null };
  tranches: { pct: number | null; maxDd: MaxDd | null; invested: number; cashPct: number | null };
  tranchesTrend?: { pct: number | null; maxDd: MaxDd | null; invested: number; cashPct: number | null; trades: Result['trades']; pending: number } | null;
};

const cache = new Map<string, Promise<Result | null>>();
function fetchDrawdowns(date: string, inst: Instrument) {
  const key = `${date}:${inst}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`${getApiBase()}/api/backtesting/bht-drawdowns?date=${date}&instrument=${inst}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j && !j.error ? (j as Result) : null))
      .catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key)!;
}

const INST: Record<Instrument, string> = { spx: 'S&P 500', qqq: 'QQQ (Nasdaq-100)', tqqq: 'TQQQ' };
const money = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Redondea antes del signo: un residuo como -1e-14 se muestra 0.0% y no -0.0%.
const pctTxt = (v: number | null, d = 1) => {
  if (v == null) return '—';
  const r = Number(v.toFixed(d)) || 0;
  return `${r > 0 ? '+' : ''}${r.toFixed(d)}%`;
};
const pctCls = (v: number | null) => (v == null ? 'text-slate-500' : v >= 0 ? 'text-favorable-300' : 'text-risk-300');

const T = {
  es: {
    sinceTitle: 'Desde la compra hasta hoy', sinceDd: 'Caída máxima', sincePeak: 'Pico máximo', from: 'desde el pico del', noDd: 'Sin caídas: el precio no bajó de su máximo.', noPeak: 'Sin datos posteriores a la compra.',
    ddTitle: 'Caída máxima en cada año después de la fecha', ddNote: 'Desde el pico acumulado desde la compra hasta el valle de ese año.',
    year: 'Año', peak: 'Pico', trough: 'Valle', dd: 'Caída', vsBase: 'vs compra', partial: 'en curso', nodata: 'sin datos', base: 'Compra',
    trTitle: 'Tramos con el BHT (4 × 25%)', trRules: 'Parte 100% invertido. Vende un tramo en 72 → 77 → 82 → 87+ y recompra con ese efectivo en BHT < 60 → 55 → 50 → 45. Al menos 15 días entre ventas y entre compras; la escalera de venta vuelve a 72 si el BHT baja de 62 y la de compra vuelve a 60 si sube de 68. El efectivo no rinde.',
    op: 'Operación', sell: 'Venta', buy: 'Compra', level: 'Nivel', date: 'Fecha', bht: 'BHT', bhtTitle: 'BHT del día anterior → BHT del día de la operación', price: 'Precio', invested: 'Invertido',
    none: 'Sin operaciones desde esta fecha: los 4 tramos siguen invertidos.',
    tranchesTrend: 'Tramos BHT + tendencia', vsHold: 'Tramos vs Hold', trendVsTr: 'tendencia vs Tramos', pendingBuys: 'compra(s) pendiente(s)',
    ttRules: 'Tramos + tendencia: misma escalera, pero si el S&P 500 está abajo de su SMA 200 la compra espera a que la recupere; y con BHT ≥ 50, perder la SMA 200 vende un tramo extra. En compras mensuales 1994–2023 redujo la caída máxima promedio ~7–11 puntos en S&P 500 y QQQ con ~0.5 pt menos de CAGR.',
    ttShow: 'Ver operaciones de Tramos + tendencia', ttHide: 'Ocultar operaciones con tendencia', trendSellTitle: 'Perdió la SMA 200 con BHT ≥ 50: vende un tramo', trendBuyTitle: 'Recuperó la SMA 200: se ejecuta una compra que estaba pendiente',
    hold: 'Hold completo', tranches: 'Tramos BHT', toToday: 'a hoy', maxDd: 'Caída máx.', position: 'Posición hoy', cash: 'efectivo',
    loading: 'Calculando…', error: 'No se pudo calcular.', note: 'Simulación histórica sin comisiones ni impuestos. No es una recomendación de inversión.',
  },
  en: {
    sinceTitle: 'From the purchase until today', sinceDd: 'Maximum drawdown', sincePeak: 'Maximum peak', from: 'from the peak on', noDd: 'No drawdown: the price never fell below its high.', noPeak: 'No data after the purchase.',
    ddTitle: 'Maximum drawdown in each year after the date', ddNote: 'From the running peak since the purchase to the trough of that year.',
    year: 'Year', peak: 'Peak', trough: 'Trough', dd: 'Drawdown', vsBase: 'vs buy', partial: 'in progress', nodata: 'no data', base: 'Buy',
    trTitle: 'BHT tranches (4 × 25%)', trRules: 'Starts 100% invested. Sells one tranche at 72 → 77 → 82 → 87+ and buys back with that cash at BHT < 60 → 55 → 50 → 45. At least 15 days between sales and between buys; the sell ladder restarts at 72 if BHT drops below 62 and the buy ladder restarts at 60 if it rises above 68. Cash earns nothing.',
    op: 'Trade', sell: 'Sell', buy: 'Buy', level: 'Level', date: 'Date', bht: 'BHT', bhtTitle: 'BHT the day before → BHT on the trade day', price: 'Price', invested: 'Invested',
    none: 'No trades since this date: all 4 tranches are still invested.',
    tranchesTrend: 'BHT tranches + trend', vsHold: 'Tranches vs Hold', trendVsTr: 'trend vs Tranches', pendingBuys: 'pending buy(s)',
    ttRules: 'Tranches + trend: same ladder, but if the S&P 500 is below its 200-day SMA the buy waits until it is regained; and with BHT ≥ 50, losing the 200-day SMA sells one extra tranche. In monthly buys 1994–2023 it cut the average max drawdown ~7–11 points on the S&P 500 and QQQ for ~0.5 pt less CAGR.',
    ttShow: 'Show Tranches + trend trades', ttHide: 'Hide trend trades', trendSellTitle: 'Lost the 200-day SMA with BHT ≥ 50: sells one tranche', trendBuyTitle: 'Regained the 200-day SMA: a pending buy is executed',
    hold: 'Full hold', tranches: 'BHT tranches', toToday: 'to today', maxDd: 'Max drawdown', position: 'Position today', cash: 'cash',
    loading: 'Computing…', error: 'Could not compute.', note: 'Historical simulation without fees or taxes. Not investment advice.',
  },
};

export default function BhtDrawdownsView({ date, locale }: { date: string; locale: string }) {
  const t = T[locale === 'es' ? 'es' : 'en'];
  const [inst, setInst] = useState<Instrument>('spx');
  const [state, setState] = useState<{ key: string; data: Result | null } | null>(null);
  const key = `${date}:${inst}`;
  useEffect(() => {
    let alive = true;
    fetchDrawdowns(date, inst).then((data) => { if (alive) setState({ key, data }); });
    return () => { alive = false; };
  }, [date, inst, key]);
  // Mientras carga otro instrumento se muestra el resultado anterior atenuado (el popup no se encoge).
  const fresh = state?.key === key;
  const r = fresh ? state!.data : state?.data ?? undefined;
  const [showTT, setShowTT] = useState(false);
  const ddCell = (m: MaxDd | null) => m == null ? '—' : <><span className={`font-bold ${pctCls(m.pct)}`}>{pctTxt(m.pct)}</span>{m.troughDate && <span className="text-slate-500"> ({m.peakDate} → {m.troughDate})</span>}</>;

  // Tabla de operaciones (tramos con y sin tendencia). Las de la SMA 200 se marcan SMA200↓ (venta) / SMA200↑ (compra pendiente).
  const renderTrades = (list: Result['trades']) => list.length === 0 ? <div className="text-[11px] text-slate-400">{t.none}</div> : (
            
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full font-mono text-[11px]">
                  <thead className="text-[9px] uppercase tracking-wide text-slate-500 sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-700/70">
                      <th className="text-left font-normal py-0.5">{t.op}</th><th className="text-right font-normal">{t.level}</th>
                      <th className="text-right font-normal">{t.date}</th><th className="text-right font-normal" title={t.bhtTitle}>{t.bht}</th>
                      <th className="text-right font-normal">{t.price}</th><th className="text-right font-normal">{t.vsBase}</th><th className="text-right font-normal">{t.invested}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((tr, k) => (
                      <tr key={k} className="border-b border-slate-800/60">
                        <td className={`py-[1px] font-semibold ${tr.type === 'sell' ? 'text-elevated-300' : 'text-favorable-300'}`}>{tr.type === 'sell' ? t.sell : t.buy}</td>
                        <td className="text-right font-bold" style={{ color: tr.reason === 'trend' ? (tr.type === 'sell' ? TOKENS.risk : TOKENS.favorable) : bhtBand(tr.type === 'sell' ? tr.level : tr.level - 0.01).color }} title={tr.reason === 'trend' ? (tr.type === 'sell' ? t.trendSellTitle : t.trendBuyTitle) : undefined}>{tr.reason === 'trend' ? (tr.type === 'sell' ? 'SMA200↓' : 'SMA200↑') : tr.type === 'sell' ? (tr.level === 87 ? '≥87' : `≥${tr.level}`) : `<${tr.level}`}</td>
                        <td className="text-right text-slate-300">{tr.date}</td>
                        <td className="text-right text-slate-400" title={t.bhtTitle}>{tr.bhtPrev != null ? tr.bhtPrev.toFixed(1) : '—'}→<span style={{ color: capeScoreColor(tr.bhtHit) }}>{tr.bhtHit.toFixed(1)}</span></td>
                        <td className="text-right text-slate-100">{money(tr.price)}</td>
                        <td className={`text-right ${pctCls(tr.vsBasePct)}`}>{pctTxt(tr.vsBasePct)}</td>
                        <td className="text-right text-slate-400">{tr.invested}/4</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
  );

  return (
    <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
          {(Object.keys(INST) as Instrument[]).map((k) => (
            <button key={k} type="button" onClick={() => setInst(k)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${inst === k ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{INST[k]}</button>
          ))}
        </div>
        {r && <span className="font-mono text-[11px] text-slate-400">{t.base} {money(r.base.price)} ({r.date}) · BHT <span className="font-bold" style={{ color: capeScoreColor(r.bht) }}>{r.bht.toFixed(1)}</span></span>}
      </div>

      {r === undefined ? <div className="font-mono text-slate-500">{t.loading}</div> : r === null ? <div className="font-mono text-risk-300">{t.error}</div> : (
        <div className={`space-y-2 transition-opacity ${fresh ? '' : 'opacity-50'}`}>
          {r.sinceBuy && (
            <div>
              <div className="text-[11px] font-semibold text-slate-100 mb-1">{t.sinceTitle} · {INST[inst]}</div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="rounded-lg border border-risk-500/30 bg-risk-500/5 p-2">
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">{t.sinceDd}</div>
                  {r.sinceBuy.maxDd ? (
                    <>
                      <div className="mt-0.5"><span className="text-base font-bold text-risk-300">{pctTxt(r.sinceBuy.maxDd.pct)}</span> <span className="text-risk-300">({money(r.sinceBuy.maxDd.nominal)})</span></div>
                      <div className="text-slate-300">{r.sinceBuy.maxDd.trough.date} · {money(r.sinceBuy.maxDd.trough.price)}{r.sinceBuy.maxDd.trough.bht != null && <> · BHT <span className="font-bold" style={{ color: capeScoreColor(r.sinceBuy.maxDd.trough.bht) }}>{r.sinceBuy.maxDd.trough.bht.toFixed(1)}</span></>}</div>
                      <div className="text-slate-500">{t.from} {r.sinceBuy.maxDd.peak.date} ({money(r.sinceBuy.maxDd.peak.price)}{r.sinceBuy.maxDd.peak.bht != null ? `, BHT ${r.sinceBuy.maxDd.peak.bht.toFixed(1)}` : ''}) · {t.vsBase} <span className={pctCls(r.sinceBuy.maxDd.vsBasePct)}>{pctTxt(r.sinceBuy.maxDd.vsBasePct)}</span></div>
                    </>
                  ) : <div className="mt-0.5 text-slate-400">{t.noDd}</div>}
                </div>
                <div className="rounded-lg border border-favorable-500/30 bg-favorable-500/5 p-2">
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">{t.sincePeak}</div>
                  {r.sinceBuy.maxPeak ? (
                    <>
                      <div className="mt-0.5"><span className={`text-base font-bold ${pctCls(r.sinceBuy.maxPeak.pct)}`}>{pctTxt(r.sinceBuy.maxPeak.pct)}</span> <span className={pctCls(r.sinceBuy.maxPeak.nominal)}>({r.sinceBuy.maxPeak.nominal > 0 ? '+' : ''}{money(r.sinceBuy.maxPeak.nominal)})</span></div>
                      <div className="text-slate-300">{r.sinceBuy.maxPeak.date} · {money(r.sinceBuy.maxPeak.price)}{r.sinceBuy.maxPeak.bht != null && <> · BHT <span className="font-bold" style={{ color: capeScoreColor(r.sinceBuy.maxPeak.bht) }}>{r.sinceBuy.maxPeak.bht.toFixed(1)}</span></>}</div>
                      <div className="text-slate-500">{t.base} {money(r.base.price)} ({r.date})</div>
                    </>
                  ) : <div className="mt-0.5 text-slate-400">{t.noPeak}</div>}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-slate-100">{t.ddTitle} · {INST[inst]}</div>
            <div className="text-[10px] text-slate-500 mb-1">{t.ddNote}</div>
            <table className="w-full font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5">{t.year}</th>
                  <th className="text-right font-normal">{t.peak}</th><th className="text-right font-normal">{t.price}</th>
                  <th className="text-right font-normal">{t.trough}</th><th className="text-right font-normal">{t.price}</th>
                  <th className="text-right font-normal">{t.dd}</th><th className="text-right font-normal">{t.vsBase}</th>
                </tr>
              </thead>
              <tbody>
                {r.years.map((y) => (
                  <tr key={y.year} className="border-b border-slate-800/60" title={`${y.from} → ${y.to}`}>
                    <td className="py-[1px] text-slate-400">{y.year}{y.partial && y.ddPct != null && <span className="text-slate-600"> · {t.partial}</span>}</td>
                    {y.ddPct == null ? <td colSpan={6} className="text-right text-slate-600">{t.nodata}</td> : (
                      <>
                        <td className="text-right text-slate-400">{y.peakDate}</td>
                        <td className="text-right text-slate-300">{money(y.peakPrice)}</td>
                        <td className="text-right text-slate-300">{y.troughDate}</td>
                        <td className="text-right text-slate-100">{money(y.troughPrice)}</td>
                        <td className={`text-right font-bold ${y.ddPct < 0 ? 'text-risk-300' : 'text-slate-400'}`}>{pctTxt(y.ddPct)}</td>
                        <td className={`text-right ${pctCls(y.vsBasePct)}`}>{pctTxt(y.vsBasePct)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-100">{t.trTitle} · {INST[inst]}</div>
            <div className="text-[10px] text-slate-500 mb-1">{t.trRules}</div>
            {renderTrades(r.trades)}
            <table className="w-full mt-1.5 font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-700/70">
                  <th className="text-left font-normal py-0.5" />
                  <th className="text-right font-normal">{t.toToday} ({money(r.base.todayPrice)}, {r.base.today})</th>
                  <th className="text-right font-normal">{t.maxDd}</th>
                  <th className="text-right font-normal">{t.position}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="py-[1px] text-slate-300">{t.hold}</td>
                  <td className={`text-right font-bold ${pctCls(r.hold.pct)}`}>{pctTxt(r.hold.pct)}</td>
                  <td className="text-right">{ddCell(r.hold.maxDd)}</td>
                  <td className="text-right text-slate-400">4/4</td>
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td className="py-[1px] text-slate-300">{t.tranches}</td>
                  <td className={`text-right font-bold ${pctCls(r.tranches.pct)}`}>{pctTxt(r.tranches.pct)}</td>
                  <td className="text-right">{ddCell(r.tranches.maxDd)}</td>
                  <td className="text-right text-slate-400">{r.tranches.invested}/4{r.tranches.cashPct ? ` · ${r.tranches.cashPct.toFixed(0)}% ${t.cash}` : ''}</td>
                </tr>
                {r.tranchesTrend && (
                  <tr className="border-b border-slate-800/60">
                    <td className="py-[1px] text-slate-300" title={t.ttRules}>{t.tranchesTrend}</td>
                    <td className={`text-right font-bold ${pctCls(r.tranchesTrend.pct)}`}>{pctTxt(r.tranchesTrend.pct)}</td>
                    <td className="text-right">{ddCell(r.tranchesTrend.maxDd)}</td>
                    <td className="text-right text-slate-400">{r.tranchesTrend.invested}/4{r.tranchesTrend.cashPct ? ` · ${r.tranchesTrend.cashPct.toFixed(0)}% ${t.cash}` : ''}{r.tranchesTrend.pending ? ` · ${r.tranchesTrend.pending} ${t.pendingBuys}` : ''}</td>
                  </tr>
                )}
                {r.tranches.pct != null && r.hold.pct != null && (
                  <tr>
                    <td className="py-[1px] text-slate-400">Δ {t.vsHold}</td>
                    <td className={`text-right font-bold ${pctCls(r.tranches.pct - r.hold.pct)}`}>{pctTxt(r.tranches.pct - r.hold.pct)}</td>
                    <td className="text-right">{r.tranches.maxDd && r.hold.maxDd ? <span className={pctCls(r.tranches.maxDd.pct - r.hold.maxDd.pct)}>{pctTxt(r.tranches.maxDd.pct - r.hold.maxDd.pct)}</span> : '—'}</td>
                    <td />
                  </tr>
                )}
                {r.tranchesTrend?.pct != null && r.tranches.pct != null && (
                  <tr>
                    <td className="py-[1px] text-slate-400">Δ {t.trendVsTr}</td>
                    <td className={`text-right font-bold ${pctCls(r.tranchesTrend.pct - r.tranches.pct)}`}>{pctTxt(r.tranchesTrend.pct - r.tranches.pct)}</td>
                    <td className="text-right">{r.tranchesTrend.maxDd && r.tranches.maxDd ? <span className={pctCls(r.tranchesTrend.maxDd.pct - r.tranches.maxDd.pct)}>{pctTxt(r.tranchesTrend.maxDd.pct - r.tranches.maxDd.pct)}</span> : '—'}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
            {r.tranchesTrend && (
              <div className="mt-1.5">
                <div className="text-[10px] text-slate-500">{t.ttRules}</div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowTT((v) => !v); }} className="text-[11px] text-accent-400 hover:text-accent-300">{showTT ? t.ttHide : t.ttShow} ({r.tranchesTrend.trades.length})</button>
                {showTT && <div className="mt-1">{renderTrades(r.tranchesTrend.trades)}</div>}
              </div>
            )}
          </div>
          <div className="text-[10px] text-slate-500">{t.note}</div>
        </div>
      )}
    </div>
  );
}
