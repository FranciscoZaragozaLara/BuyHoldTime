'use client';
// Vista "Drawdowns" del popover del BHT. Se carga con next/dynamic (su código se descarga solo al pulsar el botón)
// y pide el cálculo al backend bajo demanda; los resultados quedan en memoria por (fecha, instrumento).
// 1) Caída máxima del instrumento en cada año posterior a la fecha. 2) El sistema BuyHoldTime desde esa fecha (las
// mismas escaleras de la gráfica y de la pestaña Tranches) contra Hold. 3) Desde la compra hasta hoy.
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { bhtBand, capeScoreColor } from './bhtBands';
import { TOKENS } from '@/lib/designTokens';
import { BUY_STYLE, NET_COLOR, SELL_COLOR } from '@/lib/valuationChart';

type Instrument = 'spx' | 'qqq' | 'tqqq';
type MaxDd = { pct: number; peakDate: string | null; troughDate: string | null };
type PricePoint = { date: string; price: number; bht: number | null };
type Result = {
  date: string; bht: number;
  base: { price: number | null; today: string; todayPrice: number | null };
  years: Array<{ year: number; from: string; to: string; partial: boolean; peakDate: string | null; peakPrice: number | null; troughDate: string | null; troughPrice: number | null; peakBht?: number | null; troughBht?: number | null; ddPct: number | null; vsBasePct: number | null }>;
  sinceBuy?: {
    maxDd: { pct: number; nominal: number; vsBasePct: number; peak: PricePoint; trough: PricePoint } | null;
    maxPeak: (PricePoint & { pct: number; nominal: number }) | null;
  };
  hold: { pct: number | null; maxDd: MaxDd | null };
  /** Sistema real desde la fecha (escaleras V1–V5, T0–T4 y red; las mismas de la gráfica y de Tranches). */
  system?: {
    route: 'voo' | 'qqq'; instrument?: string; from: string; today: string; basePrice?: number; baseBht?: number | null;
    system: { pct: number; maxDd: MaxDd; cashPct: number };
    hold: { pct: number; maxDd: MaxDd };
    trades: Array<{ date: string; kind: 'sell' | 'buy' | 'net'; id: string; price: number; bht?: number | null; vsBasePct: number; pctOfPortfolio: number; cashPctAfter: number }>;
  } | null;
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
    entry: 'Entrada', entryNote: 'compra inicial · 100% invertido',
    ddTitleCol: 'Caída del pico al valle', ddTitle: 'Caída máxima en cada año después de la fecha', ddNote: 'Desde el pico acumulado desde la compra hasta el valle de ese año. «vs compra» = cambio contra el precio de entrada; «Caída» = del pico al valle.',
    year: 'Año', peak: 'Pico', trough: 'Valle', dd: 'Caída', vsBase: 'vs compra', partial: 'en curso', nodata: 'sin datos', base: 'Compra',
    trTitle: 'Sistema BuyHoldTime desde esta fecha', trRules: 'Parte 100% invertido. Mismas escaleras que la gráfica y la pestaña Tranches: vende con V1–V5 y recompra con T0–T4 y la red de seguridad (R). Sin comisiones ni intereses del efectivo.', trTqqq: 'En TQQQ las escaleras deciden con QQQ: mismas fechas y mismas fracciones (cada venta vende la misma parte de lo invertido y cada compra usa la misma parte del efectivo), aplicadas al precio real de TQQQ.', sigQqq: 'señales de QQQ', noTqqq: 'TQQQ cotiza desde el 11-feb-2010: elige una fecha posterior para simular el sistema en TQQQ.', sysName: 'Sistema', holdName: 'Hold', pctPort: '% cartera', cashAfter: 'Efectivo después', cashToday: 'Efectivo hoy', route: 'ruta',
    op: 'Operación', sell: 'Venta', buy: 'Compra', level: 'Nivel', date: 'Fecha', bht: 'BHT', bhtTitle: 'BHT del día anterior → BHT del día de la operación', price: 'Precio', invested: 'Invertido',
    none: 'Sin operaciones desde esta fecha: sigue 100% invertido.',
    vsHold: 'Sistema vs Hold',
    hold: 'Hold completo', toToday: 'a hoy', maxDd: 'Caída máx.',
    loading: 'Calculando…', error: 'No se pudo calcular.', note: 'Simulación histórica sin comisiones ni impuestos. No es una recomendación de inversión.',
  },
  en: {
    sinceTitle: 'From the purchase until today', sinceDd: 'Maximum drawdown', sincePeak: 'Maximum peak', from: 'from the peak on', noDd: 'No drawdown: the price never fell below its high.', noPeak: 'No data after the purchase.',
    entry: 'Entry', entryNote: 'initial buy · 100% invested',
    ddTitleCol: 'Drop from peak to trough', ddTitle: 'Maximum drawdown in each year after the date', ddNote: 'From the running peak since the purchase to the trough of that year. “vs buy” = change against the entry price; “Drawdown” = peak to trough.',
    year: 'Year', peak: 'Peak', trough: 'Trough', dd: 'Drawdown', vsBase: 'vs buy', partial: 'in progress', nodata: 'no data', base: 'Buy',
    trTitle: 'BuyHoldTime system since this date', trRules: 'Starts 100% invested. Same ladders as the chart and the Tranches tab: sells with V1–V5 and buys back with T0–T4 and the safety net (R). No fees, cash earns nothing.', trTqqq: 'On TQQQ the ladders decide with QQQ: same dates and same fractions (each sale sells the same share of the invested part and each buy uses the same share of cash), applied to the real TQQQ price.', sigQqq: 'QQQ signals', noTqqq: 'TQQQ trades since 11-Feb-2010: pick a later date to simulate the system on TQQQ.', sysName: 'System', holdName: 'Hold', pctPort: '% portfolio', cashAfter: 'Cash after', cashToday: 'Cash today', route: 'route',
    op: 'Trade', sell: 'Sell', buy: 'Buy', level: 'Level', date: 'Date', bht: 'BHT', bhtTitle: 'BHT the day before → BHT on the trade day', price: 'Price', invested: 'Invested',
    none: 'No trades since this date: still 100% invested.',
    vsHold: 'System vs Hold',
    hold: 'Full hold', toToday: 'to today', maxDd: 'Max drawdown',
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
  const ddCell = (m: MaxDd | null) => m == null ? '—' : <><span className={`font-bold ${pctCls(m.pct)}`}>{pctTxt(m.pct)}</span>{m.troughDate && <span className="text-slate-500"> ({m.peakDate} → {m.troughDate})</span>}</>;

  // Color de cada operación igual que su marca en la gráfica.
  const tradeColor = (kind: string, id: string) => {
    if (kind === 'sell') return id.endsWith('·C') ? TOKENS.risk : SELL_COLOR[id.slice(0, 2) as keyof typeof SELL_COLOR] ?? TOKENS.elevated;
    if (kind === 'buy') return BUY_STYLE[id.slice(0, 2) as keyof typeof BUY_STYLE]?.color ?? TOKENS.favorable;
    return NET_COLOR[id.split('·')[1] ?? ''] ?? TOKENS.favorable;
  };
  const bhtCell = (b?: number | null) => <td className="text-right font-bold" style={b != null ? { color: capeScoreColor(b) } : undefined}>{b != null ? b.toFixed(1) : '—'}</td>;
  const routeName = (rt: string) => (rt === 'voo' ? 'VOO · S&P 500' : rt === 'tqqq' ? 'TQQQ' : 'QQQ');

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
                  <th className="text-right font-normal">{t.peak}</th><th className="text-right font-normal">{t.bht}</th><th className="text-right font-normal">{t.price}</th><th className="text-right font-normal">{t.vsBase}</th>
                  <th className="text-right font-normal">{t.trough}</th><th className="text-right font-normal">{t.bht}</th><th className="text-right font-normal">{t.price}</th><th className="text-right font-normal">{t.vsBase}</th>
                  <th className="text-right font-normal" title={t.ddTitleCol}>{t.dd}</th>
                </tr>
              </thead>
              <tbody>
                {r.base.price != null && (
                  <tr className="border-b border-slate-800/60 bg-slate-800/30">
                    <td className="py-[1px] font-semibold text-favorable-300">{t.entry}</td>
                    <td className="text-right text-slate-300">{r.date}</td>
                    <td className="text-right font-bold" style={{ color: capeScoreColor(r.bht) }}>{r.bht.toFixed(1)}</td>
                    <td className="text-right text-slate-100">{money(r.base.price)}</td>
                    <td className="text-right text-slate-400">{pctTxt(0)}</td>
                    <td colSpan={5} className="text-right text-slate-500">{t.entryNote}</td>
                  </tr>
                )}
                {r.years.map((y) => (
                  <tr key={y.year} className="border-b border-slate-800/60" title={`${y.from} → ${y.to}`}>
                    <td className="py-[1px] text-slate-400">{y.year}{y.partial && y.ddPct != null && <span className="text-slate-600"> · {t.partial}</span>}</td>
                    {y.ddPct == null ? <td colSpan={9} className="text-right text-slate-600">{t.nodata}</td> : (
                      <>
                        <td className="text-right text-slate-400">{y.peakDate}</td>
                        {bhtCell(y.peakBht)}
                        <td className="text-right text-slate-300">{money(y.peakPrice)}</td>
                        {(() => { const v = r.base.price && y.peakPrice != null ? (y.peakPrice / r.base.price - 1) * 100 : null; return <td className={`text-right ${pctCls(v)}`}>{pctTxt(v)}</td>; })()}
                        <td className="text-right text-slate-300">{y.troughDate}</td>
                        {bhtCell(y.troughBht)}
                        <td className="text-right text-slate-100">{money(y.troughPrice)}</td>
                        <td className={`text-right ${pctCls(y.vsBasePct)}`}>{pctTxt(y.vsBasePct)}</td>
                        <td className={`text-right font-bold ${y.ddPct < 0 ? 'text-risk-300' : 'text-slate-400'}`}>{pctTxt(y.ddPct)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!r.system && inst === 'tqqq' && <div className="text-[11px] text-slate-400">{t.noTqqq}</div>}
          {r.system && (() => {
            const sy = r.system;
            return (
              <div>
                <div className="text-[11px] font-semibold text-slate-100">{t.trTitle} · {sy.instrument === 'tqqq' ? <>TQQQ · {t.sigQqq}</> : <>{t.route} {routeName(sy.route)}</>}</div>
                <div className="text-[10px] text-slate-500 mb-1">{t.trRules}{sy.instrument === 'tqqq' && <> {t.trTqqq}</>}</div>
                {sy.trades.length === 0 && <div className="text-[11px] text-slate-400">{t.none}</div>}
                {(sy.trades.length > 0 || sy.basePrice != null) && (
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full font-mono text-[11px]">
                      <thead className="text-[9px] uppercase tracking-wide text-slate-500 sticky top-0 bg-slate-900">
                        <tr className="border-b border-slate-700/70">
                          <th className="text-left font-normal py-0.5">{t.op}</th><th className="text-right font-normal">{t.date}</th>
                          <th className="text-right font-normal">{t.bht}</th><th className="text-right font-normal">{t.price}</th><th className="text-right font-normal">{t.vsBase}</th>
                          <th className="text-right font-normal">{t.pctPort}</th><th className="text-right font-normal">{t.cashAfter}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sy.basePrice != null && (
                          <tr className="border-b border-slate-800/60 bg-slate-800/30">
                            <td className="py-[1px] font-semibold text-favorable-300">{t.entry}</td>
                            <td className="text-right text-slate-300">{sy.from}</td>
                            {bhtCell(sy.baseBht)}
                            <td className="text-right text-slate-100">{money(sy.basePrice)}</td>
                            <td className="text-right text-slate-400">{pctTxt(0)}</td>
                            <td className="text-right text-slate-300">100%</td>
                            <td className="text-right text-slate-400">0%</td>
                          </tr>
                        )}
                        {sy.trades.map((tr, k) => (
                          <tr key={k} className="border-b border-slate-800/60">
                            <td className="py-[1px] font-semibold"><span className={tr.kind === 'sell' ? 'text-elevated-300' : 'text-favorable-300'}>{tr.kind === 'sell' ? t.sell : t.buy}</span> <b style={{ color: tradeColor(tr.kind, tr.id) }}>{tr.id.split('·')[0]}{tr.id.endsWith('·C') ? '·C' : tr.id.endsWith('·r') ? '·r' : ''}</b></td>
                            <td className="text-right text-slate-300">{tr.date}</td>
                            {bhtCell(tr.bht)}
                            <td className="text-right text-slate-100">{money(tr.price)}</td>
                            <td className={`text-right ${pctCls(tr.vsBasePct)}`}>{pctTxt(tr.vsBasePct)}</td>
                            <td className="text-right text-slate-300">{tr.pctOfPortfolio.toFixed(0)}%</td>
                            <td className="text-right text-slate-400">{tr.cashPctAfter.toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <table className="w-full mt-1.5 font-mono text-[11px]">
                  <thead className="text-[9px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-700/70">
                      <th className="text-left font-normal py-0.5" />
                      <th className="text-right font-normal">{t.toToday} ({sy.today})</th>
                      <th className="text-right font-normal">{t.maxDd}</th>
                      <th className="text-right font-normal">{t.cashToday}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800/60">
                      <td className="py-[1px] text-slate-300">{t.holdName} {routeName(sy.instrument ?? sy.route)}</td>
                      <td className={`text-right font-bold ${pctCls(sy.hold.pct)}`}>{pctTxt(sy.hold.pct)}</td>
                      <td className="text-right">{ddCell(sy.hold.maxDd)}</td>
                      <td className="text-right text-slate-400">0%</td>
                    </tr>
                    <tr className="border-b border-slate-800/60">
                      <td className="py-[1px] text-slate-300">{t.sysName}</td>
                      <td className={`text-right font-bold ${pctCls(sy.system.pct)}`}>{pctTxt(sy.system.pct)}</td>
                      <td className="text-right">{ddCell(sy.system.maxDd)}</td>
                      <td className="text-right text-slate-400">{sy.system.cashPct.toFixed(0)}%</td>
                    </tr>
                    <tr>
                      <td className="py-[1px] text-slate-400">Δ {t.vsHold}</td>
                      <td className={`text-right font-bold ${pctCls(sy.system.pct - sy.hold.pct)}`}>{pctTxt(sy.system.pct - sy.hold.pct)}</td>
                      <td className="text-right"><span className={pctCls(sy.system.maxDd.pct - sy.hold.maxDd.pct)}>{pctTxt(sy.system.maxDd.pct - sy.hold.maxDd.pct)}</span></td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
          <div className="text-[10px] text-slate-500">{t.note}</div>
        </div>
      )}
    </div>
  );
}
