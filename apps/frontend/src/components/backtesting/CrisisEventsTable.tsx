'use client';
import React, { useEffect, useState } from 'react';
import { CRISIS_EVENTS } from '@/lib/crisisEvents';
import { BhtDetailPopover, bhtLeaveGuard, capeScoreColor, useBhtDetail } from './IndicatorsPanel';

const fmt$ = (v: number) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (v: number) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

// Tabla de grandes crisis (SP500 >-20% desde 1990) con pico/suelo de nuestra BD.
// BHT Index de pico y suelo con el hover de detalle compartido (partes + forwards).
export function CrisisEventsTable() {
  const [bhtVals, setBhtVals] = useState<Record<string, number | null>>({});
  const [fwdCache, setFwdCache] = useState<Record<string, any>>({});
  const bhtDet = useBhtDetail();

  useEffect(() => {
    const dates = Array.from(new Set(CRISIS_EVENTS.flatMap((e) => [e.peakDate, e.bottomDate])));
    Promise.all(dates.map(async (d) => {
      try {
        const from = new Date(d); from.setDate(from.getDate() - 7);
        const r = await fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' });
        if (!r.ok) return [d, null] as const;
        const rows = await r.json();
        const row = rows.length ? rows[rows.length - 1] : null;
        return [d, row?.bhtValue ?? null] as const;
      } catch { return [d, null] as const; }
    })).then((pairs) => setBhtVals(Object.fromEntries(pairs)));
  }, []);

  const loadFwd = (d: string) => {
    if (fwdCache[d] !== undefined) return;
    setFwdCache((m) => ({ ...m, [d]: null }));
    const from = new Date(d); from.setDate(from.getDate() - 7);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setFwdCache((m) => ({ ...m, [d]: rows.length ? rows[rows.length - 1] : null })))
      .catch(() => {});
  };

  const onEnter = (d: string) => (e: React.MouseEvent) => {
    bhtDet.setHover({ d, x: e.clientX, y: e.clientY });
    bhtDet.load(d);
    loadFwd(d);
  };
  const onMove = (d: string) => (e: React.MouseEvent) => {
    bhtDet.setHover((s) => (s && s.d === d ? { ...s, x: e.clientX, y: e.clientY } : s));
  };

  const bhtBadge = (d: string) => {
    const v = bhtVals[d];
    if (v == null) return <div className="font-mono text-[11px] text-slate-600">BHT —</div>;
    return (
      <div
        className="font-mono text-[11px] font-semibold cursor-help"
        style={{ color: capeScoreColor(v) }}
        onMouseEnter={onEnter(d)}
        onMouseMove={onMove(d)}
        onMouseLeave={(e) => bhtLeaveGuard(e, bhtDet)}
      >
        <span className="border-b border-dotted border-slate-400/40">BHT {Number(v).toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 mt-4">
      <h3 className="font-semibold text-slate-100 mb-1">💥 Grandes crisis 1990→hoy <span className="text-xs font-normal text-slate-500">— SP500 cayó más de 20% · pico/suelo de nuestra serie ^GSPC</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs mt-2">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-2 text-left" rowSpan={2}>Evento</th>
              <th className="p-2 text-center text-sky-300 font-semibold" colSpan={5}>SP500</th>
              <th className="p-2 text-center text-violet-300 font-semibold" colSpan={5}>Nasdaq</th>
              <th className="p-2 text-left" rowSpan={2}>Qué pasó</th>
            </tr>
            <tr>
              <th className="p-2 text-right">Pico SP</th>
              <th className="p-2 text-right">SP500 pico</th>
              <th className="p-2 text-right">Suelo SP</th>
              <th className="p-2 text-right">SP500 suelo</th>
              <th className="p-2 text-right">Caída SP</th>
              <th className="p-2 text-right">Pico NDX</th>
              <th className="p-2 text-right">Nasdaq pico</th>
              <th className="p-2 text-right">Suelo NDX</th>
              <th className="p-2 text-right">Nasdaq suelo</th>
              <th className="p-2 text-right">Caída NDX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {CRISIS_EVENTS.map(e => {
              const ndxDrop = e.peakNdx ? (e.bottomNdx / e.peakNdx - 1) * 100 : null;
              return (
              <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-2 font-sans font-semibold whitespace-nowrap"><span className="text-lg mr-1.5">{e.icon}</span><span style={{ color: e.color }}>{e.name}</span></td>
                <td className="p-2 text-right text-slate-300 whitespace-nowrap">{e.peakDate}{bhtBadge(e.peakDate)}</td>
                <td className="p-2 text-right text-sky-300 whitespace-nowrap">{fmt$(e.peakSpx)}</td>
                <td className="p-2 text-right text-slate-300 whitespace-nowrap">{e.bottomDate}{bhtBadge(e.bottomDate)}</td>
                <td className="p-2 text-right text-sky-300 whitespace-nowrap">{fmt$(e.bottomSpx)}</td>
                <td className="p-2 text-right font-bold text-red-400 whitespace-nowrap">{e.dropPct.toFixed(1)}%</td>
                <td className="p-2 text-right text-slate-300 whitespace-nowrap border-l border-slate-800/60">{e.peakDate}</td>
                <td className="p-2 text-right text-violet-300 whitespace-nowrap">{fmt0(e.peakNdx)}</td>
                <td className="p-2 text-right text-slate-300 whitespace-nowrap">{e.bottomDate}</td>
                <td className="p-2 text-right text-violet-300 whitespace-nowrap">{fmt0(e.bottomNdx)}</td>
                <td className="p-2 text-right font-bold text-red-400 whitespace-nowrap">{ndxDrop != null ? `${ndxDrop.toFixed(1)}%` : '—'}</td>
                <td className="p-2 font-sans text-slate-400 text-[11px] leading-snug min-w-[220px]">{e.text}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bhtDet.hover && (
        <BhtDetailPopover
          hover={bhtDet.hover}
          detail={bhtDet.cache[bhtDet.hover.d]}
          forward={fwdCache[bhtDet.hover.d]}
          onLeave={() => bhtDet.scheduleClear()} onHold={() => bhtDet.cancelClear()}
        />
      )}
    </div>
  );
}
