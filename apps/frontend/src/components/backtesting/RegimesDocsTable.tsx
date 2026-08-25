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
    regimen: 'Complacencia OAS',
    mide: 'Ceguera al riesgo (bonos) — complementario',
    gatillo: 'Salto de Spreads (>+50 bps) + (CAPE alto o Z>2.0)',
    crisis: 'Crisis de Quiebras — falta de liquidez',
    indicador: 'BAMLH0A0HYM2 AND (CAPE> SMA36M×1.20 OR Z>2.0)',
    umbral: 'HY < P20_36M o <3.5%  +  (1 ó 2 activo)',
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
              <div className="font-semibold text-amber-300">1. Bosque Seco por Múltiplos Altos — 4 Fases + Sanación — Riesgo de Duración y Tasas</div>
              <p className="text-slate-400 text-xs leading-relaxed">Detecta sobrevaloración + inflación amenazando liquidez. <b className="text-amber-300">Scaling In/Out por tranches</b> calibrado contra choques de inflación y tasas.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Sobrevaloración + Core CPI acelerado</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">La Chispa</span><span className="text-amber-300">Fed y Bono 10Y comprimen múltiplos</span></div>
              </div>
              <div className="space-y-2">
                <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-800/50">
                  <div className="text-[11px] font-semibold text-amber-200">F0 — Condición Estructural (Bosque Seco)</div>
                  <div className="text-xs text-amber-200 font-mono mt-1">CAPE &gt; SMA<sub>36M</sub>×1.18 AND Core CPI YoY ≥4.0 &amp; &gt; SMA<sub>12M</sub>×1.20</div>
                  <div className="text-[11px] text-amber-300/70 mt-1">+20% sobre media 3a y +15% sobre media 12M Core CPI (CPILFESL) → alerta, detiene compras</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-orange-300">Fase Defensiva — Scaling Out</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-orange-950/20 rounded p-2 border border-orange-800/30">
                      <div className="text-[11px] font-semibold text-orange-200">Gatillo 1 — Alerta Temprana (30%)</div>
                      <div className="text-[11px] font-mono text-orange-100 mt-1">Δ FED &gt;0 OR 10Y &gt; SMA<sub>200</sub>×1.10</div>
                      <div className="text-[10px] text-slate-400 mt-1">1ª subida Fed o 10Y +10% → vende 30% a SGOV · 70/30</div>
                    </div>
                    <div className="bg-red-950/30 rounded p-2 border border-red-800/30">
                      <div className="text-[11px] font-semibold text-red-200">Gatillo 2 — Venta Total (70%)</div>
                      <div className="text-[11px] font-mono text-red-100 mt-1">Δ FED ≥+0.50% en 1 junta AND Core CPI &gt; SMA<sub>36M</sub>×1.30</div>
                      <div className="text-[10px] text-slate-400 mt-1">Jumbo Hike + inflación +30% 3a → vende 70% restante · 0/100</div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-sky-300">Fase Ofensiva — Scaling In</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-sky-950/20 rounded p-2 border border-sky-800/30">
                      <div className="text-[11px] font-semibold text-sky-200">Gatillo 3 — Compra Asalto (35%)</div>
                      <div className="text-[11px] font-mono text-sky-100 mt-1">Core CPI 3M caídas vs pico OR Δ FED=0 ×2M</div>
                      <div className="text-[10px] text-slate-400 mt-1">Desaceleración 3M o Pausa 2M → compra 35% a activo subyacente (SPY/QQQ/TQQQ) · 35/65</div>
                    </div>
                    <div className="bg-emerald-950/20 rounded p-2 border border-emerald-800/30">
                      <div className="text-[11px] font-semibold text-emerald-200">Gatillo 4 — Compra Total (65%)</div>
                      <div className="text-[11px] font-mono text-emerald-100 mt-1">(Core CPI &lt; SMA<sub>12M</sub>×1.05 OR Δ FED&lt;0) AND Precio &gt; SMA<sub>50</sub></div>
                      <div className="text-[10px] text-slate-400 mt-1">Doble Llave Macro+Técnica → inyecta 65% final · 100% riesgo</div>
                    </div>
                  </div>
                </div>
                <div className="bg-purple-950/30 rounded-lg p-3 border border-purple-700/50">
                  <div className="text-[11px] font-semibold text-purple-300">Sanación — Falsa Alarma</div>
                  <div className="text-[11px] font-mono text-purple-200 mt-1">Core CPI &lt; SMA<sub>12M</sub>×1.05 AND Precio &gt; SMA<sub>50</sub></div>
                  <div className="text-[10px] text-slate-400 mt-1">Tras G1 (70/30) sin G2 y precio recupera → recompra 30% → 100%</div>
                </div>
              </div>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-amber-500 text-xs"><span className="text-slate-400">Ejemplo 2022:</span> Nasdaq -35% — habría hecho Scaling Out en G1 (10Y&gt;SMA200×1.10) y reingreso en G3/G4 tras pausa Fed y CPI&lt;SMA12M×1.05+SMA50.</p>
            </div>
          )}
          {open === 'Alta Deuda/PIB' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-red-300">2. Bosque Seco por Alta Deuda / PIB — 4 Fases — Riesgo de Liquidación Forzosa</div>
              <p className="text-slate-400 text-xs leading-relaxed">Mide apalancamiento sistémico. Estado <b className="text-red-300">armado con memoria</b>: persiste aunque Z baje, hasta sanación o Z&lt;0.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Dinero prestado (Margin Debt)</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">Estado</span><span className="text-red-300">Armado si Z&gt;2.0 en 6M — detiene compras</span></div>
              </div>
              <div className="space-y-2">
                <div className="bg-red-950/30 rounded-lg p-3 border border-red-800/50">
                  <div className="text-[11px] font-semibold text-red-200">Fase 1 — El Armado (Peligro Sistémico)</div>
                  <div className="text-xs text-red-200 font-mono mt-1">Z(Margin/GDP) &gt; +2.0 en cualquier momento de últimos 6 meses</div>
                  <div className="text-[11px] text-red-300/70 mt-1">Z=(Margin/GDP−SMA36M)/σ36M · Margin/GDP=FINRA_DEBIT/GDP×100 · <b>con memoria</b>: no se desarma aunque Z baje</div>
                </div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                  <div className="text-[11px] font-semibold text-amber-300">Fase 2 — Scaling Out — Venta Defensiva</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-amber-950/20 rounded p-2 border border-amber-800/30">
                      <div className="text-[11px] font-semibold text-amber-200">Gatillo 1 — Alerta Temprana (30%)</div>
                      <div className="text-[11px] font-mono text-amber-100 mt-1">ROC₃M(Margin/GDP) &lt; 0  AND  Cierre &lt; SMA₅₀d</div>
                      <div className="text-[10px] text-slate-400 mt-1">Deuda trimestral deja de crecer + ruptura SMA50 → vende 30% · 70/30</div>
                    </div>
                    <div className="bg-red-950/30 rounded p-2 border border-red-800/30">
                      <div className="text-[11px] font-semibold text-red-200">Gatillo 2 — Pánico Margin Call (70%)</div>
                      <div className="text-[11px] font-mono text-red-100 mt-1">ROC₃M &lt; −1×σ₂₄M(ROC₃M)</div>
                      <div className="text-[10px] text-slate-400 mt-1">Caída supera volatilidad 2años → vende 70% restante · 0/100</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-emerald-950/20 rounded-lg p-3 border border-emerald-800/30">
                    <div className="text-[11px] font-semibold text-emerald-200">Fase 3 — Sanación (Falsa Alarma)</div>
                    <div className="text-[11px] font-mono text-emerald-100 mt-1">Cierre &gt; SMA₅₀  AND  ROC₃M &gt; 0</div>
                    <div className="text-[10px] text-slate-400 mt-1">Tras G1 sin G2 y precio recupera → recompra 30% → 100% exposición</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <div className="text-[11px] font-semibold text-slate-200">Fase 4 — Desarme Total</div>
                    <div className="text-[11px] font-mono text-slate-100 mt-1">Z(Margin/GDP) &lt; 0</div>
                    <div className="text-[10px] text-slate-400 mt-1">Deuda bajo promedio 3a → purga completa → régimen desactivo</div>
                  </div>
                </div>
              </div>
              <p className="bg-slate-800 rounded p-2 border-l-2 border-red-500 text-xs"><span className="text-slate-400">Ejemplo 1929 y 2000:</span> Margen extremo + desapalancamiento aniquiló mercado. Nuevo modelo escalona salida por ROC y SMA50.</p>
            </div>
          )}
          {open === 'Complacencia OAS' && (
            <div className="text-sm text-slate-300 space-y-3">
              <div className="font-semibold text-violet-300">3. Complacencia en Préstamos HY OAS — Riesgo de Crédito / Quiebra <span className="text-amber-300 text-xs">· Complementario</span></div>
              <p className="text-amber-200/80 text-xs leading-relaxed bg-amber-950/20 border border-amber-800/30 rounded-lg p-2">⚠️ <b>Complementario:</b> No entra por régimen solo. Requiere bosque seco por <b>1. Múltiplos Altos</b> o <b>2. Alta Deuda/PIB</b>. Solo con altas valoraciones o alto apalancamiento cuenta.</p>
              <p className="text-slate-400 text-xs leading-relaxed">No mide acciones, sino bonos basura. Mide ceguera al riesgo de impago.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">El Combustible</span><span className="text-slate-200">Exceso de confianza · ignorancia de Default Risk</span></div>
                <div className="bg-slate-900 rounded-lg p-3 border border-slate-700"><span className="text-slate-500 block">La Chispa</span><span className="text-violet-300">Liquidez/recesión que congela crédito</span></div>
              </div>
              <div className="bg-violet-950/30 rounded-lg p-3 border border-violet-800/50">
                <div className="text-xs text-violet-200 font-mono">(HY OAS &lt; P<sub>20,36M</sub> OR &lt;3.5%) <span className="text-amber-300">AND</span> (CAPE &gt; SMA<sub>36M</sub>×1.20 OR Z&gt;2.0)</div>
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
