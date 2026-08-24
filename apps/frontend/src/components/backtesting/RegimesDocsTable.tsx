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
          <p className="text-sm text-slate-400 mt-1">Matriz de escaneo de bosque seco — combustible, chispa y crisis. <span className="text-amber-400">Solo consulta</span> — aún no implementado en backtesting. Click para ver regla matemática y ejemplo.</p>
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
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-amber-300">1. Bosque Seco por Múltiplos Altos — Riesgo de Duración y Tasas</div>
              <p className="text-slate-400 text-xs leading-relaxed">Detecta cuando las acciones están extremadamente caras y son vulnerables a cambios en el costo del dinero.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Sobrevaloración de ganancias futuras (crecimiento / tecnológicas)</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">La Chispa</span><span className="text-amber-300">Inflación y subidas de tasas de la Fed</span></div>
              </div>
              <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-800/50">
                <div className="text-xs text-amber-200 font-mono">CAPE &gt; SMA<sub>36M</sub>(CAPE) × 1.20</div>
                <div className="text-[11px] text-amber-300/70 mt-1">CAPE &gt;20% sobre media 36M → múltiplos estirados</div>
              </div>
              <p><span className="text-slate-400">Mecánica:</span> Sin quiebras: las empresas siguen ganando, pero tasas al alza comprimen violentamente P/E y CAPE.</p>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-amber-500 text-xs"><span className="text-slate-400">Ejemplo 2022:</span> Crédito sano, Nasdaq -35% por Fed subiendo tasas destruyendo valoraciones 2021.</p>
            </div>
          )}
          {open === 'Alta Deuda/PIB' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-red-300">2. Bosque Seco por Alta Deuda / PIB — Riesgo de Liquidación Forzosa</div>
              <p className="text-slate-400 text-xs leading-relaxed">Mide apalancamiento sistémico — cuánta deuda toman inversores para comprar acciones.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Dinero prestado (Margin Debt)</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">La Chispa</span><span className="text-red-300">Cualquier caída inicial → Margin Call</span></div>
              </div>
              <div className="bg-red-950/30 rounded-lg p-3 border border-red-800/50">
                <div className="text-xs text-red-200 font-mono">Z(Margin/GDP) = (Margin/GDP − SMA<sub>36M</sub>) / σ<sub>36M</sub> &gt; +2.0</div>
                <div className="text-[11px] text-red-300/70 mt-1">Margin/GDP = FINRA_DEBIT / GDP ×100 · &gt;2σ = hiper-apalancado</div>
              </div>
              <p><span className="text-slate-400">Mecánica:</span> Con +2.0 Z-Score, una caída 5-10% detona margin calls → venta forzosa mecánica, avalancha sin importar precio.</p>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-red-500 text-xs"><span className="text-slate-400">Ejemplo 1929 y 2000:</span> Burbuja Dotcom impulsada por margen extremo → desapalancamiento aniquiló mercado.</p>
            </div>
          )}
          {open === 'Complacencia OAS' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-violet-300">3. Complacencia en Préstamos HY OAS — Riesgo de Crédito / Quiebra</div>
              <p className="text-slate-400 text-xs leading-relaxed">No mide acciones, sino bonos basura. Mide ceguera al riesgo de impago.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Exceso de confianza · ignorancia de Default Risk</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">La Chispa</span><span className="text-violet-300">Liquidez/recesión que congela crédito</span></div>
              </div>
              <div className="bg-violet-950/30 rounded-lg p-3 border border-violet-800/50">
                <div className="text-xs text-violet-200 font-mono">HY OAS &lt; Percentil<sub>20</sub>(HY OAS<sub>36M</sub>)  OR  HY OAS &lt; 3.5%</div>
                <div className="text-[11px] text-violet-300/70 mt-1">BAMLH0A0HYM2 en percentil 20 → complacencia extrema</div>
              </div>
              <p><span className="text-slate-400">Mecánica:</span> Spread en “perfección absoluta” solo puede subir. Si el crédito se congela, empresas no refinancian → quiebras y colapso accionario.</p>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-violet-500 text-xs"><span className="text-slate-400">Ejemplo 2007:</span> OAS &lt;3.0% “sin riesgo” → 2008 saltó &gt;11% tras subprime.</p>
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
