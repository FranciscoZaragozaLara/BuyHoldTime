'use client';
import { useState } from 'react';

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

const rows: Row[] = [
  {
    regimen: 'Múltiplos Altos',
    mide: 'Precio relativo (CAPE)',
    gatillo: 'Subida de Tasas (Fed)',
    crisis: 'Crisis de Valoración — larga duración',
    indicador: 'CAPE / mean3Y',
    umbral: 'CAPE >30 o Ratio >1.25',
    icon: '📈',
    color: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500/30',
  },
  {
    regimen: 'Alta Deuda/PIB',
    mide: 'Apalancamiento sistémico',
    gatillo: 'Caída inicial (Margin Calls)',
    crisis: 'Crisis de Venta Forzosa — avalancha',
    indicador: 'FINRA_DEBIT / GDP',
    umbral: '>4.0% alerta · >5% estrés',
    icon: '🏦',
    color: 'from-red-500/20 to-rose-500/20',
    border: 'border-red-500/30',
  },
  {
    regimen: 'Complacencia OAS',
    mide: 'Ceguera al riesgo (bonos)',
    gatillo: 'Salto de Spreads (>+50 bps)',
    crisis: 'Crisis de Quiebras — falta de liquidez',
    indicador: 'BAMLH0A0HYM2',
    umbral: '>5% o Δ+0.50% rápido',
    icon: '😴',
    color: 'from-violet-500/20 to-purple-500/20',
    border: 'border-violet-500/30',
  },
];

export function RegimesDocsTable() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Documentación de Regímenes</h3>
          <p className="text-sm text-slate-400 mt-1">Qué mide cada régimen, qué lo detona y qué crisis provoca. <span className="text-amber-400">Solo consulta</span> — aún no implementado en backtesting.</p>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">v1 · 2026-08-24</span>
      </div>

      {/* Tabla estilo markdown pero con Tailwind */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 backdrop-blur">
              <tr className="text-slate-300">
                <th className="p-3 text-left font-semibold whitespace-nowrap">Régimen</th>
                <th className="p-3 text-left font-semibold">Qué Mide</th>
                <th className="p-3 text-left font-semibold">Qué lo Detona <span className="text-slate-500 font-normal">(El Gatillo)</span></th>
                <th className="p-3 text-left font-semibold">Tipo de Crisis Resultante</th>
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
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${r.color} border ${r.border} text-slate-100 font-semibold text-xs whitespace-nowrap`}>
                      <span>{r.icon}</span> {r.regimen}
                    </div>
                    {open === r.regimen && (
                      <div className="mt-2 text-xs text-slate-400 space-y-1">
                        <div><span className="text-slate-500">Indicador:</span> <span className="font-mono text-slate-300">{r.indicador}</span></div>
                        <div><span className="text-slate-500">Umbral:</span> <span className="font-mono text-amber-300">{r.umbral}</span></div>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-slate-300">{r.mide}</td>
                  <td className="p-3">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium">{r.gatillo}</span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-medium ${r.regimen==='Múltiplos Altos' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : r.regimen==='Alta Deuda/PIB' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-violet-500/10 text-violet-300 border-violet-500/20'}`}>{r.crisis}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-slate-800/50 border-t border-slate-800 text-xs text-slate-500 flex flex-wrap gap-3">
          <span>💡 Click en el régimen para ver indicador y umbral</span>
          <span className="ml-auto">CAPE = Shiller · OAS = BAMLH0A0HYM2 · Margin = FINRA_DEBIT/GDP · Fuente: <span className="font-mono">docs/regimes.md</span></span>
        </div>
      </div>

      {/* Detalle expandido estilo markdown */}
      {open && (
        <div className="mt-4 rounded-xl bg-slate-800/50 border border-slate-700 p-4">
          {open === 'Múltiplos Altos' && (
            <div className="text-sm text-slate-300 space-y-2">
              <div className="font-semibold text-amber-300">Múltiplos Altos — Precio relativo</div>
              <p><span className="text-slate-400">Qué mide:</span> Cuán caro está el mercado vs beneficios 10a. <span className="font-mono">Ratio = CAPE / mean3Y</span>.</p>
              <p><span className="text-slate-400">Gatillo:</span> Subida de tasas Fed/10Y encarece descuento y pincha múltiplos.</p>
              <p><span className="text-slate-400">Crisis:</span> Valoración — drawdown lento y profundo (ej. 2000, 2021→2022). Señal en <span className="font-mono">Evolución</span> cuando <span className="font-mono">Ratio&gt;1.25 + CAPE&gt;30</span>.</p>
            </div>
          )}
          {open === 'Alta Deuda/PIB' && (
            <div className="text-sm text-slate-300 space-y-2">
              <div className="font-semibold text-red-300">Alta Deuda/PIB — Apalancamiento sistémico</div>
              <p><span className="text-slate-400">Qué mide:</span> <span className="font-mono">Margin Debt / GDP</span> — apalancamiento del sistema.</p>
              <p><span className="text-slate-400">Gatillo:</span> Caída inicial → margin calls → desapalancamiento forzado.</p>
              <p><span className="text-slate-400">Crisis:</span> Venta forzosa / avalancha. Ej. 2008. Señal en <span className="font-mono">Evolución</span> con <span className="font-mono">Margin/GDP &gt;4%</span>.</p>
            </div>
          )}
          {open === 'Complacencia OAS' && (
            <div className="text-sm text-slate-300 space-y-2">
              <div className="font-semibold text-violet-300">Complacencia OAS — Ceguera al riesgo</div>
              <p><span className="text-slate-400">Qué mide:</span> Estrechez spread high-yield (<span className="font-mono">HY OAS</span>). Spread bajo = complacencia.</p>
              <p><span className="text-slate-400">Gatillo:</span> Salto <span className="font-mono">&gt;+50 bps</span> en días/semanas.</p>
              <p><span className="text-slate-400">Crisis:</span> Quiebras — falta de liquidez. Señal en <span className="font-mono">Evolución</span> cuando <span className="font-mono">HY OAS &gt;5%</span> tras `&lt;3%`.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        Ver fuente markdown en <span className="font-mono text-slate-400">docs/regimes.md</span> · <em>No implementado aún en backtesting — solo consulta.</em>
      </div>
    </div>
  );
}
