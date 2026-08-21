'use client';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function CalculatorPanel() {
  const t = useTranslations('Backtesting');
  const [amount, setAmount] = useState('10000');
  const [years, setYears] = useState('10');
  const [cagr, setCagr] = useState('10');
  const [monthly, setMonthly] = useState('0');

  const result = useMemo(() => {
    const P = parseFloat(amount) || 0;
    const n = parseFloat(years) || 0;
    const r = (parseFloat(cagr) || 0) / 100;
    const pmt = parseFloat(monthly) || 0;
    if (n <= 0) return { final: P, gain: 0, totalInvested: P, perf: 0, multiple: P > 0 ? 1 : 0 };
    const finalLump = P * Math.pow(1 + r, n);
    let finalAnnuity = 0;
    if (pmt > 0 && r > 0) {
      const monthlyRate = Math.pow(1 + r, 1 / 12) - 1;
      const months = n * 12;
      finalAnnuity = pmt * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    } else if (pmt > 0) {
      finalAnnuity = pmt * n * 12;
    }
    const final = finalLump + finalAnnuity;
    const totalInvested = P + pmt * n * 12;
    const perf = totalInvested > 0 ? (final / totalInvested - 1) * 100 : 0;
    const multiple = totalInvested > 0 ? final / totalInvested : 0;
    return { final, gain: final - totalInvested, totalInvested, perf, multiple };
  }, [amount, years, cagr, monthly]);

  const fmt = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const baseCagr = useMemo(() => parseFloat(cagr) || 0, [cagr]);
  const altRates = useMemo(() => {
    const b = baseCagr;
    // distancia uniforme, siempre >0: step adaptativo para que el menor (b-3*step) sea >=0.5%
    const rawStep = b / 4;
    let step = Math.min(5, Math.max(0.5, Math.round(rawStep * 2) / 2));
    if (b <= 0) step = 0.5;
    // si aún el menor quedara <=0, recalcula step al máximo que mantiene >0
    if (b - 3 * step <= 0) step = Math.max(0.5, Math.floor(((b - 0.5) / 3) * 2) / 2);
    if (step < 0.5) step = 0.5;
    return [b - 3 * step, b - 2 * step, b - step, b + step, b + 2 * step, b + 3 * step].map(v => Math.round(v * 10) / 10);
  }, [baseCagr]);

  const rows = useMemo(() => {
    const P = parseFloat(amount) || 0;
    const totalN = Math.max(0, Math.floor(parseFloat(years) || 0));
    const r = baseCagr / 100;
    const pmt = parseFloat(monthly) || 0;
    const monthlyRate = r > -0.99 ? Math.pow(1 + r, 1 / 12) - 1 : 0;
    const out: any[] = [];
    for (let y = 1; y <= totalN; y++) {
      const finalLump = P * Math.pow(1 + r, y);
      let finalAnnuity = 0;
      if (pmt > 0) {
        if (Math.abs(r) > 0.0001) finalAnnuity = pmt * ((Math.pow(1 + monthlyRate, y * 12) - 1) / monthlyRate);
        else finalAnnuity = pmt * y * 12;
      }
      const final = finalLump + finalAnnuity;
      const invested = P + pmt * y * 12;
      const gain = final - invested;
      const perf = invested > 0 ? (final / invested - 1) * 100 : 0;
      const multiple = invested > 0 ? final / invested : 0;
      const altFinals: Record<string, number> = {};
      altRates.forEach((ar, idx) => {
        const ra = ar / 100;
        const mRa = ra > -0.99 ? Math.pow(1 + ra, 1 / 12) - 1 : 0;
        const lumpA = P * Math.pow(1 + ra, y);
        let annA = 0;
        if (pmt > 0) {
          if (Math.abs(ra) > 0.0001) annA = pmt * ((Math.pow(1 + mRa, y * 12) - 1) / mRa);
          else annA = pmt * y * 12;
        }
        altFinals[`alt${idx}`] = lumpA + annA;
      });
      out.push({ y, invested, final, gain, perf, multiple, ...altFinals });
    }
    return out;
  }, [amount, years, baseCagr, monthly, altRates]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="font-semibold text-slate-100 text-lg">{t('calculator.title')}</h3>
        <p className="text-xs text-slate-500 mt-1">{t('calculator.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h4 className="text-sm font-semibold text-slate-200">{t('calculator.inputs')}</h4>

          <label className="block">
            <span className="text-xs text-slate-400">{t('calculator.initialAmount')}</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-teal-500" />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">{t('calculator.monthlyContribution')}</span>
            <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-teal-500" />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-slate-400">{t('calculator.years')}</span>
              <input type="number" value={years} onChange={e => setYears(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">{t('calculator.cagr')}</span>
              <input type="number" step="0.1" value={cagr} onChange={e => setCagr(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-teal-500" />
            </label>
          </div>

          <p className="text-[11px] text-slate-500">{t('calculator.hint')}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h4 className="text-sm font-semibold text-slate-200">{t('calculator.results')}</h4>

          <div className="grid grid-cols-1 gap-3">
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
              <div className="text-xs text-slate-500">{t('calculator.totalInvested')}</div>
              <div className="text-lg font-mono font-bold text-slate-100">{fmt(result.totalInvested)}</div>
            </div>
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4">
              <div className="text-xs text-teal-400">{t('calculator.finalValue')}</div>
              <div className="text-xl font-mono font-bold text-teal-300">{fmt(result.final)}</div>
            </div>
            <div className={`border rounded-lg p-4 ${result.gain >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="text-xs text-slate-400">{t('calculator.gain')}</div>
              <div className={`text-lg font-mono font-bold ${result.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{result.gain >= 0 ? '+' : ''}{fmt(result.gain)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`border rounded-lg p-4 ${result.perf >= 0 ? 'bg-sky-500/10 border-sky-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="text-xs text-slate-400">{t('calculator.performance')}</div>
                <div className={`text-lg font-mono font-bold ${result.perf >= 0 ? 'text-sky-400' : 'text-red-400'}`}>{result.perf >= 0 ? '+' : ''}{result.perf.toFixed(2)}%</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="text-xs text-amber-400">{t('calculator.multiple')}</div>
                <div className="text-lg font-mono font-bold text-amber-300">{result.multiple.toFixed(2)}x</div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-slate-800/40 rounded p-2">
            {t('calculator.formula')}: <code className="text-slate-300">VF = P·(1+r)^n + PMT·[((1+r_m)^12n -1)/r_m]</code>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="font-semibold text-slate-100 mb-3">{t('calculator.breakdownTitle')}</h4>
        <p className="text-xs text-slate-500 mb-3">{t('calculator.breakdownSubtitle')}</p>
        <div className="overflow-x-auto overflow-y-auto max-h-[420px] border border-slate-900 rounded-xl">
          <table className="w-full text-xs relative">
            <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10">
              <tr>
                <th className="p-2 text-left whitespace-nowrap">{t('calculator.colYear')}</th>
                <th className="p-2 text-right whitespace-nowrap">{t('calculator.colInvested')}</th>
                <th className="p-2 text-right text-teal-300 whitespace-nowrap">{t('calculator.colFinal')} {baseCagr.toFixed(1)}%</th>
                <th className="p-2 text-right text-emerald-300 whitespace-nowrap">{t('calculator.colGain')}</th>
                <th className="p-2 text-right text-sky-300 whitespace-nowrap">{t('calculator.colPerf')}</th>
                <th className="p-2 text-right text-amber-300 whitespace-nowrap">{t('calculator.colMultiple')}</th>
                {altRates.map((ar, idx) => {
                  const isLow = idx < 3;
                  const cls = isLow ? (idx===2?'text-orange-400': idx===1?'text-orange-300':'text-orange-200') : (idx===3?'text-green-400': idx===4?'text-green-500':'text-green-600');
                  return <th key={idx} className={`p-2 text-right whitespace-nowrap ${cls}`}>{ar.toFixed(1)}%</th>;
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="p-4 text-center text-slate-500">{t('calculator.noRows')}</td></tr>
              ) : rows.map(r => (
                <tr key={r.y} className="hover:bg-slate-900/40">
                  <td className="p-2 text-slate-200 font-bold">{r.y}</td>
                  <td className="p-2 text-right text-slate-300">{fmt(r.invested)}</td>
                  <td className="p-2 text-right text-teal-300 font-bold">{fmt(r.final)}</td>
                  <td className={`p-2 text-right font-semibold ${r.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(r.gain)}</td>
                  <td className={`p-2 text-right font-semibold ${r.perf >= 0 ? 'text-sky-400' : 'text-red-400'}`}>{fmtPct(r.perf)}</td>
                  <td className="p-2 text-right text-amber-300">{r.multiple.toFixed(2)}x</td>
                  {altRates.map((_, idx) => {
                    const v = r[`alt${idx}`];
                    const isLow = idx < 3;
                    const cls = isLow ? (idx===2?'text-orange-400': idx===1?'text-orange-300':'text-orange-200') : (idx===3?'text-green-400': idx===4?'text-green-500':'text-green-600');
                    return <td key={idx} className={`p-2 text-right ${cls}`}>{fmt(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="font-semibold text-slate-100 mb-3">{t('calculator.chartTitle')}</h4>
        <div className="w-full h-[320px]">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">{t('calculator.noRows')}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows.map(r => ({ year: r.y, Invested: r.invested, Final: r.final, Alt0: r.alt0, Alt1: r.alt1, Alt2: r.alt2, Alt3: r.alt3, Alt4: r.alt4, Alt5: r.alt5 }))} margin={{ top: 24, right: 72, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v:number)=> `${v}`} label={{ value: t('calculator.colYear'), position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v:number)=> `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} formatter={(v:any, name:any)=> [`$${Number(v).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0})}`, String(name)] as any} labelFormatter={(l:any)=> `${t('calculator.colYear')} ${l}`} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
                <Line type="monotone" dataKey="Invested" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name={`${t('calculator.colInvested')}`} />
                <Line type="monotone" dataKey="Alt0" stroke="#fed7aa" strokeWidth={1.5} dot={false} strokeDasharray="6 4" name={`${altRates[0].toFixed(1)}%`} />
                <Line type="monotone" dataKey="Alt1" stroke="#fdba74" strokeWidth={1.7} dot={false} strokeDasharray="6 4" name={`${altRates[1].toFixed(1)}%`} />
                <Line type="monotone" dataKey="Alt2" stroke="#fb923c" strokeWidth={1.9} dot={false} strokeDasharray="6 4" name={`${altRates[2].toFixed(1)}%`} />
                <Line type="monotone" dataKey="Final" stroke="#3b82f6" strokeWidth={3.5} dot={(props:any)=>{ const { cx, cy, index } = props; const isLast = index === rows.length - 1; if (!isLast) return <circle key={index} cx={cx} cy={cy} r={0} />; const bx = Math.max(4, cx - 100); const by = Math.max(4, Math.min(cy - 14, 280)); return <g key={index}><circle cx={cx} cy={cy} r={5} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} /><rect x={bx} y={by} width={92} height={22} rx={6} fill="#0f172a" stroke="#3b82f6" strokeOpacity={0.9} /><text x={bx+46} y={by+14} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={700} fill="#60a5fa">${(rows[rows.length-1]?.final ?? 0).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:0})}</text></g>; }} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#0f172a', strokeWidth: 2 }} name={`${baseCagr.toFixed(1)}% ★`} />
                <Line type="monotone" dataKey="Alt3" stroke="#4ade80" strokeWidth={2.2} dot={false} strokeDasharray="4 3" name={`${altRates[3].toFixed(1)}%`} />
                <Line type="monotone" dataKey="Alt4" stroke="#22c55e" strokeWidth={2.5} dot={false} strokeDasharray="4 3" name={`${altRates[4].toFixed(1)}%`} />
                <Line type="monotone" dataKey="Alt5" stroke="#16a34a" strokeWidth={2.8} dot={false} strokeDasharray="4 3" name={`${altRates[5].toFixed(1)}%`} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
