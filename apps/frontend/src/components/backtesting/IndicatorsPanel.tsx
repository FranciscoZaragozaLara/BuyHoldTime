'use client';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useMarketSyncStream } from './useMarketSyncStream';
import MarketSyncModal from './MarketSyncModal';
import { MarginGdpChart } from './MarginGdpChart';
import { CrisisEventsTable } from './CrisisEventsTable';
import { Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import { useQuery } from '@tanstack/react-query';
import { getLiveStaleTime, isMarketOpen } from '@/lib/queryClient';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

function useLiveTicker(ticker: string){
  return useQuery({
    queryKey: ['live', ticker],
    queryFn: async ()=>{
      const base = getApiBase();
      const r = await fetch(`${base}/api/backtesting/market-data/live?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      if(!r.ok) throw new Error(String(r.status));
      const j: any = await r.json();
      // Guarda anti-basura: el live FRED llegó a devolver {close:400,date:"<link href"}
      // y pintaba 400.00% en todas las cards. Payload inválido => error para que
      // react-query lo trate como sin-live y todo caiga a valores DB/tabla.
      const dateOk = typeof j?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.date) && !isNaN(new Date(j.date.slice(0, 10)).getTime());
      const closeOk = j?.close == null || (typeof j.close === 'number' && isFinite(j.close));
      if (!dateOk || !closeOk) throw new Error(`live ${ticker} payload inválido`);
      return j as {ticker:string; close:number|null; date:string; source:string};
    },
    staleTime: getLiveStaleTime(ticker),
    gcTime: 10*60*1000,
    refetchOnWindowFocus: false,
    refetchInterval: (q)=>{
      const t = (q.queryKey as string[])[1];
      if (['DFEDTARU','DGS2','DGS10','DGS30','MSACSR','VIXCLS','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL','SPX_ADV_VOL','SPX_DEC_VOL','CAPE'].includes(t)) return false as any;
      return isMarketOpen() ? 5*60*1000 : false as any;
    },
  });
}

// === Termómetro BuyHoldTime: puntaje CAPE 0-100 (100 = riesgo máximo) ===
// Bandas aprobadas: [lo, hi, puntajeLo, puntajeHi, etiqueta, display]
const CAPE_SEGS: [number, number, number, number, string, string][] = [
  [-Infinity, 25, 0, 8, 'Muy barato', '≤ 25'],
  [25, 29, 8, 25, 'Barato', '25–29'],
  [29, 31, 25, 35, 'Justo', '29–31'],
  [31, 35, 35, 50, 'Sobre justo', '31–35'],
  [35, 39, 50, 68, 'Caro', '35–39'],
  [39, 40, 68, 68, 'Caro', '35–39'],
  [40, 44, 68, 88, 'Elevado', '40–44'],
  [44, 45, 88, 88, 'Elevado', '40–44'],
  [45, 48, 88, 100, 'Extremo', '≥ 45'],
  [48, Infinity, 100, 100, 'Extremo', '≥ 45'],
];
function bandScore(segs: [number, number, number, number][], v: number): number {
  for (const [lo, hi, sLo, sHi] of segs) {
    if (v >= lo && v < hi) return sLo + (v - Math.max(lo, -1e9)) * ((sHi - sLo) / (Math.min(hi, 1e9) - Math.max(lo, -1e9) || 1));
  }
  return 100;
}
function capeRiskScore(cape: number): number {
  return bandScore(CAPE_SEGS.map(([lo, hi, sLo, sHi]) => [lo, hi, sLo, sHi] as [number, number, number, number]), cape);
}
// PE TTM: <18 muy barato · <20 barato · 24 justo · 26+ caro · 28+ muy caro · 30+ elevado · 32+ extremo
const PE_SEGS: [number, number, number, number][] = [
  [-Infinity, 18, 0, 8], [18, 20, 8, 18], [20, 24, 18, 35], [24, 26, 35, 50],
  [26, 28, 50, 60], [28, 30, 60, 72], [30, 32, 72, 84], [32, 36, 84, 100], [36, Infinity, 100, 100],
];
function peRiskScore(pe: number): number {
  return bandScore(PE_SEGS, pe);
}
// Forward PE: misma escala de puntos (Caro = 50–60 como base central)
const FWD_SEGS: [number, number, number, number][] = [
  [-Infinity, 13, 0, 8], [13, 15, 8, 18], [15, 17, 18, 35], [17, 19, 35, 50],
  [19, 21, 50, 60], [21, 23, 60, 72], [23, 25, 72, 84], [25, 29, 84, 100], [29, Infinity, 100, 100],
];
function fwdRiskScore(pe: number): number {
  return bandScore(FWD_SEGS, pe);
}
// CAPE Ratio: misma escala (Caro = 50–60 como base central)
const RATIO_SEGS: [number, number, number, number][] = [
  [-Infinity, 0.85, 0, 8], [0.85, 0.95, 8, 18], [0.95, 1.00, 18, 35], [1.00, 1.10, 35, 50],
  [1.10, 1.18, 50, 60], [1.18, 1.30, 60, 72], [1.30, 1.45, 72, 84], [1.45, 1.70, 84, 100], [1.70, Infinity, 100, 100],
];
function ratioRiskScore(r: number): number {
  return bandScore(RATIO_SEGS, r);
}
// CPI YoY: a más inflación, más riesgo (meta Fed 2%)
const CPI_SEGS: [number, number, number, number][] = [
  [-Infinity, 1.0, 0, 8], [1.0, 1.5, 8, 20], [1.5, 2.0, 20, 35], [2.0, 2.5, 35, 50],
  [2.5, 3.0, 50, 62], [3.0, 4.0, 62, 74], [4.0, 6.0, 74, 86], [6.0, 10.0, 86, 100], [10.0, Infinity, 100, 100],
];
function cpiRiskScore(v: number): number {
  return bandScore(CPI_SEGS, v);
}
// FED target (upper): a tasa más alta, más restrictivo = más riesgo
const FED_SEGS: [number, number, number, number][] = [
  [-Infinity, 0.5, 0, 8], [0.5, 1.5, 8, 20], [1.5, 2.5, 20, 35], [2.5, 3.5, 35, 50],
  [3.5, 4.5, 50, 62], [4.5, 5.5, 62, 74], [5.5, 7.0, 74, 86], [7.0, 12.0, 86, 100], [12.0, Infinity, 100, 100],
];
function fedRiskScore(v: number): number {
  return bandScore(FED_SEGS, v);
}
// Treasury 30Y: a yield más alto, mayor descuento = más riesgo para acciones
const Y30_SEGS: [number, number, number, number][] = [
  [-Infinity, 2.0, 0, 8], [2.0, 3.0, 8, 20], [3.0, 3.5, 20, 35], [3.5, 4.0, 35, 50],
  [4.0, 4.5, 50, 62], [4.5, 5.0, 62, 74], [5.0, 6.0, 74, 86], [6.0, 10.0, 86, 100], [10.0, Infinity, 100, 100],
];
function y30RiskScore(v: number): number {
  return bandScore(Y30_SEGS, v);
}
// Margen/PIB: a más apalancamiento, más riesgo de deleveraging
const MG_SEGS: [number, number, number, number][] = [
  [-Infinity, 1.5, 0, 8], [1.5, 2.0, 8, 20], [2.0, 2.5, 20, 35], [2.5, 3.0, 35, 50],
  [3.0, 3.5, 50, 62], [3.5, 4.5, 62, 74], [4.5, 6.0, 74, 86], [6.0, 9.0, 86, 100], [9.0, Infinity, 100, 100],
];
function mgRiskScore(v: number): number {
  return bandScore(MG_SEGS, v);
}
// VIX invertido: volatilidad alta = pánico = oportunidad = puntaje bajo
const VIX_SEGS: [number, number, number, number][] = [
  [-Infinity, 12, 85, 100], [12, 15, 70, 85], [15, 20, 50, 70], [20, 25, 30, 50], [25, 35, 10, 30], [35, Infinity, 0, 10],
];
function vixRiskScore(v: number): number {
  return bandScore(VIX_SEGS, v);
}
// Vivienda (MSACSR, meses de inventario): a más oferta sin vender, más riesgo
const MS_SEGS: [number, number, number, number][] = [
  [-Infinity, 3.5, 0, 8], [3.5, 4.5, 8, 20], [4.5, 5.5, 20, 35], [5.5, 6.5, 35, 50],
  [6.5, 7.5, 50, 62], [7.5, 9.0, 62, 74], [9.0, 11.0, 74, 88], [11.0, 13.0, 88, 100], [13.0, Infinity, 100, 100],
];
function msRiskScore(v: number): number {
  return bandScore(MS_SEGS, v);
}
// PIB real YoY invertido: más crecimiento = menos riesgo
const GDP_SEGS: [number, number, number, number][] = [
  [-Infinity, -1.0, 88, 100], [-1.0, 0, 75, 88], [0, 1.0, 60, 75], [1.0, 2.0, 45, 60],
  [2.0, 3.0, 25, 45], [3.0, 4.0, 10, 25], [4.0, Infinity, 0, 10],
];
function gdpRiskScore(v: number): number {
  return bandScore(GDP_SEGS, v);
}
const capeScoreColor = (s: number) => s >= 80 ? '#ef4444' : s >= 65 ? '#f97316' : s >= 50 ? '#eab308' : s >= 35 ? '#84cc36' : '#22c55e';
const capeBandLabel = (cape: number) => cape < 25 ? 'Muy barato' : cape < 29 ? 'Barato' : cape < 31 ? 'Justo' : cape < 35 ? 'Sobre justo' : cape < 40 ? 'Caro' : cape < 45 ? 'Elevado' : 'Extremo';
const peBandLabel = (pe: number) => pe < 18 ? 'Muy barato' : pe < 20 ? 'Barato' : pe < 24 ? 'Razonable' : pe < 26 ? 'Justo' : pe < 28 ? 'Caro' : pe < 30 ? 'Muy caro' : pe < 32 ? 'Elevado' : 'Extremo';
const fwdBandLabel = (pe: number) => pe < 13 ? 'Muy barato' : pe < 15 ? 'Barato' : pe < 17 ? 'Razonable' : pe < 19 ? 'Justo' : pe < 21 ? 'Caro' : pe < 23 ? 'Muy caro' : pe < 25 ? 'Elevado' : 'Extremo';
// Bandas para el popover del orbe: [lo, hi, display, puntos, nivel]
const CAPE_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 25, '≤ 25', '0–8', 'Muy barato'], [25, 29, '25–29', '8–25', 'Barato'], [29, 31, '29–31', '25–35', 'Justo'], [31, 35, '31–35', '35–50', 'Sobre justo'], [35, 40, '35–39', '50–68', 'Caro'], [40, 45, '40–44', '68–88', 'Elevado'], [45, Infinity, '≥ 45', '88–100', 'Extremo'],
];
const PE_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 18, '≤ 18', '0–8', 'Muy barato'], [18, 20, '18–20', '8–18', 'Barato'], [20, 24, '20–24', '18–35', 'Razonable'], [24, 26, '24–26', '35–50', 'Justo'], [26, 28, '26–28', '50–60', 'Caro'], [28, 30, '28–30', '60–72', 'Muy caro'], [30, 32, '30–32', '72–84', 'Elevado'], [32, Infinity, '≥ 32', '84–100', 'Extremo'],
];
const RATIO_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0.85, '≤ 0.85', '0–8', 'Muy barato'], [0.85, 0.95, '0.85–0.95', '8–18', 'Barato'], [0.95, 1.00, '0.95–1.00', '18–35', 'Justo'], [1.00, 1.10, '1.00–1.10', '35–50', 'Sobre justo'], [1.10, 1.18, '1.10–1.18', '50–60', 'Caro'], [1.18, 1.30, '1.18–1.30', '60–72', 'Muy caro'], [1.30, 1.45, '1.30–1.45', '72–84', 'Elevado'], [1.45, Infinity, '≥ 1.45', '84–100', 'Extremo'],
];
const ratioBandLabel = (r: number) => r < 0.85 ? 'Muy barato' : r < 0.95 ? 'Barato' : r < 1.00 ? 'Justo' : r < 1.10 ? 'Sobre justo' : r < 1.18 ? 'Caro' : r < 1.30 ? 'Muy caro' : r < 1.45 ? 'Elevado' : 'Extremo';
const CPI_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.0, '≤ 1.0', '0–8', 'Muy baja'], [1.0, 1.5, '1.0–1.5', '8–20', 'Baja'], [1.5, 2.0, '1.5–2.0', '20–35', 'Rumbo a meta'], [2.0, 2.5, '2.0–2.5', '35–50', 'En meta'], [2.5, 3.0, '2.5–3.0', '50–62', 'Elevada'], [3.0, 4.0, '3.0–4.0', '62–74', 'Alta'], [4.0, 6.0, '4.0–6.0', '74–86', 'Muy alta'], [6.0, Infinity, '≥ 6.0', '86–100', 'Extrema'],
];
const cpiBandLabel = (v: number) => v < 1.0 ? 'Muy baja' : v < 1.5 ? 'Baja' : v < 2.0 ? 'Rumbo a meta' : v < 2.5 ? 'En meta' : v < 3.0 ? 'Elevada' : v < 4.0 ? 'Alta' : v < 6.0 ? 'Muy alta' : 'Extrema';
const FED_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0.5, '≤ 0.5', '0–8', 'Estímulo total'], [0.5, 1.5, '0.5–1.5', '8–20', 'Baja'], [1.5, 2.5, '1.5–2.5', '20–35', 'Casi neutral'], [2.5, 3.5, '2.5–3.5', '35–50', 'Neutral'], [3.5, 4.5, '3.5–4.5', '50–62', 'Leve restricción'], [4.5, 5.5, '4.5–5.5', '62–74', 'Restrictiva'], [5.5, 7.0, '5.5–7.0', '74–86', 'Muy restrictiva'], [7.0, Infinity, '≥ 7.0', '86–100', 'Extrema'],
];
const fedBandLabel = (v: number) => v < 0.5 ? 'Estímulo total' : v < 1.5 ? 'Baja' : v < 2.5 ? 'Casi neutral' : v < 3.5 ? 'Neutral' : v < 4.5 ? 'Leve restricción' : v < 5.5 ? 'Restrictiva' : v < 7.0 ? 'Muy restrictiva' : 'Extrema';
const Y30_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 2.0, '≤ 2.0', '0–8', 'Suelo histórico'], [2.0, 3.0, '2.0–3.0', '8–20', 'Baja'], [3.0, 3.5, '3.0–3.5', '20–35', 'Moderada-baja'], [3.5, 4.0, '3.5–4.0', '35–50', 'Neutral'], [4.0, 4.5, '4.0–4.5', '50–62', 'Elevada'], [4.5, 5.0, '4.5–5.0', '62–74', 'Alta'], [5.0, 6.0, '5.0–6.0', '74–86', 'Muy alta'], [6.0, Infinity, '≥ 6.0', '86–100', 'Extrema'],
];
const y30BandLabel = (v: number) => v < 2.0 ? 'Suelo histórico' : v < 3.0 ? 'Baja' : v < 3.5 ? 'Moderada-baja' : v < 4.0 ? 'Neutral' : v < 4.5 ? 'Elevada' : v < 5.0 ? 'Alta' : v < 6.0 ? 'Muy alta' : 'Extrema';
const MG_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.5, '≤ 1.5', '0–8', 'Muy bajo'], [1.5, 2.0, '1.5–2.0', '8–20', 'Bajo'], [2.0, 2.5, '2.0–2.5', '20–35', 'Moderado'], [2.5, 3.0, '2.5–3.0', '35–50', 'Normal'], [3.0, 3.5, '3.0–3.5', '50–62', 'Elevado'], [3.5, 4.5, '3.5–4.5', '62–74', 'Alto'], [4.5, 6.0, '4.5–6.0', '74–86', 'Muy alto'], [6.0, Infinity, '≥ 6.0', '86–100', 'Extremo'],
];
const mgBandLabel = (v: number) => v < 1.5 ? 'Muy bajo' : v < 2.0 ? 'Bajo' : v < 2.5 ? 'Moderado' : v < 3.0 ? 'Normal' : v < 3.5 ? 'Elevado' : v < 4.5 ? 'Alto' : v < 6.0 ? 'Muy alto' : 'Extremo';
const GDP_BANDS: [number, number, string, string, string][] = [
  [4.0, Infinity, '≥ 4.0', '0–10', 'Muy fuerte'], [3.0, 4.0, '3.0–4.0', '10–25', 'Sólido'], [2.0, 3.0, '2.0–3.0', '25–45', 'Saludable'], [1.0, 2.0, '1.0–2.0', '45–60', 'Desacelera'], [0, 1.0, '0–1.0', '60–75', 'Estancado'], [-1.0, 0, '-1–0', '75–88', 'Contracción'], [-Infinity, -1.0, '< -1.0', '88–100', 'Recesión'],
];
const MS_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 3.5, '≤ 3.5', '0–8', 'Escasez'], [3.5, 4.5, '3.5–4.5', '8–20', 'Ajustado'], [4.5, 5.5, '4.5–5.5', '20–35', 'Equilibrado'], [5.5, 6.5, '5.5–6.5', '35–50', 'Ampliándose'], [6.5, 7.5, '6.5–7.5', '50–62', 'Exceso'], [7.5, 9.0, '7.5–9.0', '62–74', 'Sobreoferta'], [9.0, 11.0, '9.0–11', '74–88', 'Muy frío'], [11.0, Infinity, '≥ 11', '88–100', 'Congelado'],
];
const VIX_BANDS: [number, number, string, string, string][] = [
  [35, Infinity, '≥ 35', '0–10', 'Pánico'], [25, 35, '25–35', '10–30', 'Miedo'], [20, 25, '20–25', '30–50', 'Inquietud'], [15, 20, '15–20', '50–70', 'Normal'], [12, 15, '12–15', '70–85', 'Complacencia'], [-Infinity, 12, '< 12', '85–100', 'Euforia'],
];
// Fear & Greed entra directo (ya es 0-100 en la misma dirección)
const FG_BANDS: [number, number, string, string, string][] = [
  [0, 25, '0–25', '0–25', 'Miedo Extremo'], [25, 45, '25–45', '25–45', 'Miedo'], [45, 55, '45–55', '45–55', 'Neutral'], [55, 75, '55–75', '55–75', 'Codicia'], [75, Infinity, '76–100', '76–100', 'Codicia Extrema'],
];
const FWD_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 13, '≤ 13', '0–8', 'Muy barato'], [13, 15, '13–15', '8–18', 'Barato'], [15, 17, '15–17', '18–35', 'Razonable'], [17, 19, '17–19', '35–50', 'Justo'], [19, 21, '19–21', '50–60', 'Caro'], [21, 23, '21–23', '60–72', 'Muy caro'], [23, 25, '23–25', '72–84', 'Elevado'], [25, Infinity, '≥ 25', '84–100', 'Extremo'],
];
// Orbe de cristal genérico con puntaje; click/hover muestra valor actual + tabla de ponderación.
function ScoreOrb({ name, value, dec = 2, weight, score, bands, small = false }: { name: string; value: number; dec?: number; weight: number; score: number; bands: [number, number, string, string, string][]; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const c = capeScoreColor(score);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen(o => !o)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} title={`Riesgo ${name} ${score}/100`}
        className={`relative rounded-full cursor-pointer shrink-0 ${small ? 'w-7 h-7' : 'w-11 h-11'}`}
        style={{ background: `radial-gradient(circle at 30% 18%, rgba(255,255,255,.55), rgba(255,255,255,.08) 30%, transparent 48%), linear-gradient(145deg, ${c}dd, ${c}55)`, boxShadow: `0 0 14px ${c}77, inset 0 0 8px rgba(255,255,255,.3)`, border: `1px solid ${c}` }}>
        <span className={`absolute inset-0 flex items-center justify-center font-mono font-extrabold text-slate-950 ${small ? 'text-[10px]' : 'text-[13px]'}`} style={{ textShadow: '0 0 4px rgba(255,255,255,.95), 0 0 2px rgba(255,255,255,.9), 0 1px 1px rgba(255,255,255,.6)' }}>{score}</span>
      </button>
      {open && (
        <div className="absolute z-50 right-0 top-12 w-72 p-3 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl text-left normal-case" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <div className="text-xs font-semibold text-slate-100">Riesgo {name} <span className="font-mono" style={{ color: c }}>{score}/100</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{name} {value.toFixed(dec)} → <span className="text-sky-300 font-semibold">{score}/100</span> · peso {weight} ÷ peso total</div>
          <table className="w-full mt-2 text-[10px] font-mono">
            <thead><tr className="text-slate-500"><th className="text-left font-normal py-0.5">{name}</th><th className="text-right font-normal">Pts</th><th className="text-right font-normal">Nivel</th></tr></thead>
            <tbody>
              {bands.map(([lo, hi, disp, pts, lvl]) => {
                const on = value >= lo && value < hi;
                return <tr key={disp} className={on ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400'}><td className="py-0.5">{disp}</td><td className="text-right">{pts}</td><td className="text-right">{lvl}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}

export function IndicatorsPanel() {
  const [indicators, setIndicators] = useState<any[]>([]);
  const [cape, setCape] = useState<any[]>([]);
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);
  const [markets, setMarkets] = useState<Record<string, number | null>>({});
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  const [volHistory, setVolHistory] = useState<Record<string, Map<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const tSync = useTranslations('Backtesting.regimes');
  const marketSync = useMarketSyncStream(async () => { await loadAll(); });
  const syncing = marketSync.refreshing;
  const [visibleCount, setVisibleCount] = useState(15);
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [stockHover, setStockHover] = useState<null | {ticker:string; d:string; x:number; y:number; cape:number|null; ratio:number|null}>(null);
  const observerRef = useRef<HTMLTableRowElement | null>(null) as any;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // live tickers para fila actual (mercado + FRED); CAPE sigue desde DB/csv (mensual)
  const liveGspc = useLiveTicker('^GSPC');
  const liveIxic = useLiveTicker('^IXIC');
  const liveTqqq = useLiveTicker('TQQQ');
  const liveFed = useLiveTicker('DFEDTARU');
  const live2y = useLiveTicker('DGS2');
  const live10y = useLiveTicker('DGS10');
  const live30y = useLiveTicker('DGS30');
  const liveHyOas = useLiveTicker('BAMLH0A0HYM2');
  const liveHyEy = useLiveTicker('BAMLH0A0HYM2EY');
  const liveCpi = useLiveTicker('CPIAUCSL');
  const liveCore = useLiveTicker('CPILFESL');
  const liveGdp = useLiveTicker('GDP');
  const liveGdpc1 = useLiveTicker('GDPC1');
  const liveFinra = useLiveTicker('FINRA_DEBIT');
  const liveMsacsr = useLiveTicker('MSACSR');
  const liveVix = useLiveTicker('VIXCLS');
  const liveFg = useLiveTicker('FEAR_GREED');
  const liveNyAdv = useLiveTicker('NYSE_ADV_VOL');
  const liveNyDec = useLiveTicker('NYSE_DEC_VOL');
  const liveNqAdv = useLiveTicker('NSDQ_ADV_VOL');
  const liveNqDec = useLiveTicker('NSDQ_DEC_VOL');
  const liveSxAdv = useLiveTicker('SPX_ADV_VOL');
  const liveSxDec = useLiveTicker('SPX_DEC_VOL');
  const liveMap: Record<string, any> = { '^GSPC': liveGspc, '^IXIC': liveIxic, 'TQQQ': liveTqqq, 'CPIAUCSL': liveCpi, 'CPILFESL': liveCore, 'DFEDTARU': liveFed, 'DGS2': live2y, 'DGS10': live10y, 'DGS30': live30y, 'BAMLH0A0HYM2': liveHyOas, 'BAMLH0A0HYM2EY': liveHyEy, 'GDP': liveGdp, 'GDPC1': liveGdpc1, 'FINRA_DEBIT': liveFinra, 'MSACSR': liveMsacsr, 'VIXCLS': liveVix, 'FEAR_GREED': liveFg, 'NYSE_ADV_VOL': liveNyAdv, 'NYSE_DEC_VOL': liveNyDec, 'NSDQ_ADV_VOL': liveNqAdv, 'NSDQ_DEC_VOL': liveNqDec, 'SPX_ADV_VOL': liveSxAdv, 'SPX_DEC_VOL': liveSxDec };
  // Historial para gráfica: merge BD + live más reciente para siempre estar al día
  const chartHistory = (() => {
    const merged: Record<string, Map<string, number>> = {};
    for (const [k, mp] of Object.entries(marketHistory)) merged[k] = new Map(mp as Map<string, number>);
    for (const [tk, q] of Object.entries(liveMap as Record<string, any>)) {
      const d = (q as any)?.data?.date?.slice(0,10);
      const v = (q as any)?.data?.close;
      const src = (q as any)?.data?.source;
      if (d && v!=null && src!=='db-fallback') {
        if (!merged[tk]) merged[tk] = new Map();
        merged[tk].set(d, Number(v));
      }
    }
    return merged;
  })();
  // OBV SPY: acumulado de volumen diario con signo del cambio de cierre (1993→hoy)
  const obvMap = useMemo(() => {
    const mp = new Map<string, number>();
    const closes = marketHistory['SPY'];
    const vols = volHistory['SPY'];
    if (!closes || !vols) return mp;
    const dates = Array.from(closes.keys()).sort();
    let acc = 0; let prev: number | null = null;
    for (const d of dates) {
      const c = closes.get(d); const v = vols.get(d) ?? 0;
      if (c == null) continue;
      if (prev != null) { if (c > prev) acc += v; else if (c < prev) acc -= v; }
      prev = c;
      mp.set(d, acc);
    }
    return mp;
  }, [marketHistory, volHistory]);
  // Fuerza diaria = (OBV_hoy − OBV_ayer) / SMA20(Vol SPY) ; Tend-OBV = Z-Score 20d del OBV
  const { fuerzaMap, obvzMap } = useMemo(() => {
    const fz = new Map<string, number>(); const tz = new Map<string, number>();
    const closes = marketHistory['SPY'];
    const vols = volHistory['SPY'];
    if (closes && vols) {
      const dates = Array.from(closes.keys()).sort();
      let acc = 0; let prev: number | null = null;
      const seq: { d: string; obv: number; v: number }[] = [];
      for (const d of dates) {
        const c = closes.get(d); const v = vols.get(d) ?? 0;
        if (c == null) continue;
        if (prev != null) { if (c > prev) acc += v; else if (c < prev) acc -= v; }
        prev = c; seq.push({ d, obv: acc, v });
      }
      for (let i = 19; i < seq.length; i++) {
        let volSum = 0; let obvSum = 0;
        for (let j = i - 19; j <= i; j++) { volSum += seq[j].v; obvSum += seq[j].obv; }
        const smaVol = volSum / 20;
        if (smaVol > 0) fz.set(seq[i].d, (seq[i].obv - seq[i - 1].obv) / smaVol);
        const mean = obvSum / 20;
        let varSum = 0;
        for (let j = i - 19; j <= i; j++) varSum += (seq[j].obv - mean) ** 2;
        const sd = Math.sqrt(varSum / 20);
        if (sd > 0) tz.set(seq[i].d, (seq[i].obv - mean) / sd);
      }
    }
    return { fuerzaMap: fz, obvzMap: tz };
  }, [marketHistory, volHistory]);
  // Amplitud S&P 500: Net Advancing Volume y Up/Down Ratio (constituyentes actuales, 1993→hoy)
  function breadthVals(isoDate: string) {
    const a = getClosestPrice(marketHistory['SPX_ADV_VOL'], isoDate);
    const d = getClosestPrice(marketHistory['SPX_DEC_VOL'], isoDate);
    if (a == null || d == null || (a === 0 && d === 0)) return { net: null as number | null, ratio: null as number | null };
    return { net: a - d, ratio: d > 0 ? a / d : null as number | null };
  }
  // Guarda anti-crash: una fecha live basura (p.ej. date:"<link href" del endpoint live)
  // tumbaba TODA la tabla con "Invalid time value". Fecha inválida => sin dato.
  function isValidIsoDate(s: any): s is string {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s.slice(0, 10)).getTime());
  }
  function getClosestPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    if (!map || !isValidIsoDate(isoDate)) return null;
    for (let i = 0; i < lookback; i++) {
      const d = new Date(isoDate);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      const v = map.get(k);
      if (v != null) return v;
    }
    return null;
  }
  function getRecentPrice(map: Map<string, number> | undefined, isoDate: string, lookback = 7): number | null {
    const v = getClosestPrice(map, isoDate, lookback);
    if (v != null) return v;
    if (!map || map.size===0) return null;
    // forward-fill: último disponible <= isoDate (para mensuales/trimestrales con lag)
    let best: string | null = null;
    for (const k of map.keys()) {
      if (k <= isoDate && (best==null || k > best)) best = k;
    }
    return best ? map.get(best)! : null;
  }
  function getMarginGdpRatio(isoDate: string): number | null {
    const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], isoDate, 45);
    const gdp = getRecentPrice(marketHistory['GDP'], isoDate, 120);
    if (finra==null || gdp==null || gdp===0) return null;
    return (finra/1000)/gdp*100;
  }
  function getCpiYoY(map: Map<string, number> | undefined, isoDate: string): number | null {
    // Inflación mensual: no se mueve diario — usar mes más reciente <= isoDate
    if (!map || map.size===0 || !isValidIsoDate(isoDate)) return null;
    let curDate: string | null = null;
    for (let i=0;i<40;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); if(map.has(k)){ curDate=k; break; } }
    if(!curDate){ for(const k of map.keys()) if(k<=isoDate && (curDate==null || k>curDate)) curDate=k; }
    if(!curDate) return null;
    const cur = map.get(curDate)!;
    const cd = new Date(curDate); cd.setFullYear(cd.getFullYear()-1);
    const prevIso = cd.toISOString().slice(0,10);
    const prev = getRecentPrice(map, prevIso, 40);
    if (prev==null || prev===0) return null;
    return (cur/prev -1)*100;
  }
  function getChange(isoDate: string, view?: 'daily'|'monthly'|'yearly'): number | null {
    // cambio vs periodo anterior según tab: día / mes / año (view override para export Excel)
    const v = view ?? capeView;
    const todayIso = new Date().toISOString().slice(0, 10);
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (isoDate.slice(0,10) === todayIso && liveToday != null && liveSrc !== 'db-fallback') price = Number(liveToday);
    if (price == null) return null;
    const pd = new Date(isoDate.slice(0,10));
    let lookback = 7;
    if (v === 'monthly') { pd.setMonth(pd.getMonth() - 1); lookback = 45; }
    else if (v === 'yearly') { pd.setFullYear(pd.getFullYear() - 1); lookback = 400; }
    else { pd.setDate(pd.getDate() - 1); }
    const prev = getClosestPrice(marketHistory['^GSPC'], pd.toISOString().slice(0,10), lookback);
    if (prev == null || prev === 0) return null;
    return (price / prev - 1) * 100;
  }
  function changeLabel(): string {
    return capeView === 'monthly' ? 'Change Monthly' : capeView === 'yearly' ? 'Change Yearly' : 'Change Daily';
  }
  function changeTitle(d: string): string {
    return capeView === 'monthly' ? `SP500 ${d} vs mes anterior` : capeView === 'yearly' ? `SP500 ${d} vs año anterior` : `SP500 ${d} vs cierre anterior`;
  }
  function getPerf1Y(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null) return null;
    const d = new Date(isoDate);
    d.setMonth(d.getMonth() + 12);
    const targetIso = d.toISOString().slice(0, 10);
    // mes maduro: +12m ya existe -> retorno 1Y real
    if (new Date(targetIso) <= new Date()) {
      const price1y = getClosestPrice(marketHistory['^GSPC'], targetIso);
      if (price1y == null) return null;
      return (price1y / price - 1) * 100;
    }
    // mes no maduro: parcial anualizado d -> hoy (mismo patrón que getCAGR)
    const todayIso = new Date().toISOString().slice(0, 10);
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let todayPrice: number | null = null;
    if (liveToday != null && liveSrc !== 'db-fallback') todayPrice = Number(liveToday);
    else todayPrice = getClosestPrice(marketHistory['^GSPC'], todayIso);
    if (todayPrice == null || todayPrice <= 0 || price <= 0) return null;
    if (isoDate.slice(0,10) === todayIso) return 0;
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const years = (new Date(todayIso).getTime() - new Date(isoDate.slice(0,10)).getTime()) / msPerYear;
    if (years <= 0.08) return null; // < ~1 mes => parcial no significativo
    return (Math.pow(todayPrice / price, 1 / years) - 1) * 100;
  }
  function isPerf1YMature(isoDate: string): boolean {
    const d = new Date(isoDate);
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().slice(0, 10) <= new Date().toISOString().slice(0, 10);
  }
  function perf1YElapsedMonths(isoDate: string): string {
    const msPerMonth = 365.25 * 24 * 60 * 60 * 1000 / 12;
    const m = (new Date().getTime() - new Date(isoDate.slice(0,10)).getTime()) / msPerMonth;
    return m > 0 ? m.toFixed(0) : '0';
  }
  function getPerfTotal(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    // preferir live de hoy si existe, sino último cierre disponible (lookback 7d)
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let todayPrice: number | null = null;
    if (liveToday != null && liveSrc !== 'db-fallback') todayPrice = Number(liveToday);
    else todayPrice = getClosestPrice(marketHistory['^GSPC'], todayIso);
    if (todayPrice == null || todayPrice === 0) return null;
    // si es hoy mismo, performance 0
    if (isoDate.slice(0,10) === todayIso) return 0;
    return (todayPrice / price - 1) * 100;
  }
  function getCAGR(isoDate: string): number | null {
    const price = getClosestPrice(marketHistory['^GSPC'], isoDate);
    if (price == null || price <= 0) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const liveToday = liveGspc?.data?.close;
    const liveSrc = liveGspc?.data?.source;
    let todayPrice: number | null = null;
    if (liveToday != null && liveSrc !== 'db-fallback') todayPrice = Number(liveToday);
    else todayPrice = getClosestPrice(marketHistory['^GSPC'], todayIso);
    if (todayPrice == null || todayPrice <= 0) return null;
    if (isoDate.slice(0,10) === todayIso) return 0;
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const years = (new Date(todayIso).getTime() - new Date(isoDate.slice(0,10)).getTime()) / msPerYear;
    if (years <= 0.08) return null; // < ~1 mes => CAGR no significativo
    return (Math.pow(todayPrice / price, 1 / years) - 1) * 100;
  }
  // Helpers genéricos por ticker para tooltip SP500/Nasdaq/TQQQ
  function getTickerPrice1Y(ticker: string, isoDate: string): number | null {
    const d = new Date(isoDate); d.setMonth(d.getMonth()+12);
    const targetIso = d.toISOString().slice(0,10);
    if (new Date(targetIso) > new Date()) return null;
    return getClosestPrice(marketHistory[ticker], targetIso);
  }
  function getTickerPerf1Y(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    const price1y = getTickerPrice1Y(ticker, isoDate);
    if (price==null || price1y==null) return null;
    return (price1y/price -1)*100;
  }
  function getTickerPerfTotal(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    if (price==null) return null;
    const todayIso = new Date().toISOString().slice(0,10);
    if (isoDate.slice(0,10)===todayIso) return 0;
    const liveMapAny: any = liveMap;
    let todayPrice: number | null = null;
    // intentar live específico del ticker si existe
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') todayPrice = Number(liveGspc.data.close);
    else if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') todayPrice = Number(liveIxic.data.close);
    else if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') todayPrice = Number(liveTqqq.data.close);
    else todayPrice = getClosestPrice(marketHistory[ticker], todayIso);
    if (todayPrice==null || todayPrice===0) return null;
    return (todayPrice/price -1)*100;
  }
  function getTickerCAGR(ticker: string, isoDate: string): number | null {
    const price = getClosestPrice(marketHistory[ticker], isoDate);
    if (price==null || price<=0) return null;
    const todayIso = new Date().toISOString().slice(0,10);
    if (isoDate.slice(0,10)===todayIso) return 0;
    let todayPrice: number | null = null;
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') todayPrice = Number(liveGspc.data.close);
    else if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') todayPrice = Number(liveIxic.data.close);
    else if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') todayPrice = Number(liveTqqq.data.close);
    else todayPrice = getClosestPrice(marketHistory[ticker], todayIso);
    if (todayPrice==null || todayPrice<=0) return null;
    const years = (new Date(todayIso).getTime() - new Date(isoDate.slice(0,10)).getTime())/(365.25*24*60*60*1000);
    if (years<=0.08) return null;
    return (Math.pow(todayPrice/price, 1/years)-1)*100;
  }
  function getTodayPrice(ticker: string): number | null {
    const todayIso = new Date().toISOString().slice(0,10);
    if (ticker==='^GSPC' && liveGspc?.data?.close!=null && liveGspc.data.source!=='db-fallback') return Number(liveGspc.data.close);
    if (ticker==='^IXIC' && liveIxic?.data?.close!=null && liveIxic.data.source!=='db-fallback') return Number(liveIxic.data.close);
    if (ticker==='TQQQ' && liveTqqq?.data?.close!=null && liveTqqq.data.source!=='db-fallback') return Number(liveTqqq.data.close);
    return getClosestPrice(marketHistory[ticker], todayIso);
  }
  function toggleSort(col: string){
    setSortCol(prev => {
      if(prev===col){ setSortDir(d=> d==='asc'?'desc':'asc'); return prev; }
      setSortDir(col==='date' ? 'desc' : 'desc');
      return col;
    });
  }

  // Carga completa de vista (misma que usa el botón Sync tras refrescar, igual que regímenes)
  const loadAll = useCallback(async () => {
      try {
        const base = getApiBase();
        const [indRes, capeRes] = await Promise.all([
          fetch(`${base}/indicators`, { cache: 'no-store' }),
          fetch(`${base}/api/backtesting/shiller-daily?from=1990-01-01`, { cache: 'no-store' }),
        ]);
        if (indRes.ok) setIndicators(await indRes.json());
        if (capeRes.ok) {
          const j = await capeRes.json();
          // ya viene sin fines de semana desde backend/pipeline
          setCape(j);
        }
        const tickers = ['TQQQ', 'QQQ', 'SCHD', 'JEPQ', 'SQQQ', 'VOO', 'SPY', '^GSPC', '^IXIC', 'CPIAUCSL', 'CPILFESL', 'DFEDTARU', 'DGS2', 'DGS10', 'DGS30', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'GDP', 'GDPC1', 'FINRA_DEBIT', 'MSACSR', 'VIXCLS', 'FEAR_GREED', 'NYSE_ADV_VOL', 'NYSE_DEC_VOL', 'NSDQ_ADV_VOL', 'NSDQ_DEC_VOL', 'SPX_ADV_VOL', 'SPX_DEC_VOL', 'SPX_EPS', 'SPX_FWD_EPS'];
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const m: Record<string, number | null> = {};
        const hist: Record<string, Map<string, number>> = {};
        const volh: Record<string, Map<string, number>> = {};
        await Promise.all(
          tickers.map(async (t) => {
            try {
              // para tabla CAPE necesitamos histórico largo (1990) para SPX/Nasdaq/TQQQ
              const longFrom = '1990-01-01';
              const r = await fetch(`${base}/api/backtesting/market-data?ticker=${encodeURIComponent(t)}&from=${longFrom}&to=${to}`, { cache: 'no-store' });
              if (r.ok) {
                const j = await r.json();
                const mp = new Map<string, number>();
                const vm = new Map<string, number>();
                for (const row of j) { const k=(row.date||'').slice(0,10); mp.set(k, Number(row.close)); const vv=Number(row.volume); if (isFinite(vv) && vv>0) vm.set(k, vv); }
                hist[t] = mp;
                volh[t] = vm;
                const last = j[j.length - 1];
                m[t] = last ? Number(last.close) : null;
              } else { m[t]=null; hist[t]=new Map(); volh[t]=new Map(); }
            } catch { m[t]=null; hist[t]=new Map(); volh[t]=new Map(); }
          })
        );
        setMarkets(m);
        setMarketHistory(hist);
        setVolHistory(volh);
      } catch {}
      setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runSync = () => marketSync.start(getApiBase());

  useEffect(()=>{ setVisibleCount(capeView==='yearly' ? 40 : 15); setSortCol('date'); setSortDir('desc'); }, [capeView]);
  // scroll listener robusto + observer como fallback
  useEffect(()=>{
    const el = scrollContainerRef.current;
    if(!el) {
      // reintentar en siguiente tick si aún no montado
      const t = setTimeout(()=> {
        const el2 = scrollContainerRef.current;
        if(el2){
          const onScroll2 = ()=>{
            if(el2.scrollTop + el2.clientHeight >= el2.scrollHeight - 80){
              setVisibleCount(prev=> Math.min(prev+15, 10000));
            }
          };
          el2.addEventListener('scroll', onScroll2);
          (el2 as any)._scrollCleanup = ()=> el2.removeEventListener('scroll', onScroll2);
        }
      }, 300);
      return ()=> clearTimeout(t);
    }
    const onScroll = ()=>{
      if(el.scrollTop + el.clientHeight >= el.scrollHeight - 80){
        setVisibleCount(prev=> Math.min(prev+15, 10000));
      }
    };
    el.addEventListener('scroll', onScroll);
    (el as any)._hasScrollListener = true;
    return ()=> { el.removeEventListener('scroll', onScroll); (el as any)._hasScrollListener = false; };
  }, [capeView, cape.length, visibleCount]);
  useEffect(()=>{
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries)=>{
      if (entries[0].isIntersecting) setVisibleCount((prev:number)=> Math.min(prev+15, 10000));
    }, { threshold: 0.1 });
    if (observerRef.current) observer.observe(observerRef.current);
    return ()=> observer.disconnect();
  }, [visibleCount, capeView, cape.length, sortCol, sortDir]);

  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500">Cargando indicadores...</div>;

  const capeLast = cape[cape.length - 1];
  // PE TTM compartido (tarjeta + termómetro): precio live/último cierre ÷ EPS TTM.
  const thermoToday = new Date().toISOString().slice(0, 10);
  const thermoSpx = (liveGspc?.data?.close != null && liveGspc.data.source !== 'db-fallback') ? Number(liveGspc.data.close) : getClosestPrice(marketHistory['^GSPC'], thermoToday);
  const thermoEps = getRecentPrice(marketHistory['SPX_EPS'], thermoToday, 120);
  const thermoPe = thermoSpx != null && thermoEps != null && thermoEps !== 0 ? thermoSpx / thermoEps : null;
  const thermoFwdEps = getRecentPrice(marketHistory['SPX_FWD_EPS'], thermoToday, 130);
  const thermoFwd = thermoSpx != null && thermoFwdEps != null && thermoFwdEps !== 0 ? thermoSpx / thermoFwdEps : null;
  const thermoCpi = getCpiYoY(marketHistory['CPIAUCSL'], liveMap['CPIAUCSL']?.data?.date || thermoToday);
  const thermoCore = getCpiYoY(marketHistory['CPILFESL'], liveMap['CPILFESL']?.data?.date || thermoToday);
  const thermoFed = (liveMap['DFEDTARU']?.data?.close != null && liveMap['DFEDTARU'].data.source !== 'db-fallback') ? Number(liveMap['DFEDTARU'].data.close) : getClosestPrice(marketHistory['DFEDTARU'], thermoToday);
  const thermoMargin = getMarginGdpRatio(thermoToday);
  const thermoMs = (liveMap['MSACSR']?.data?.close != null && liveMap['MSACSR'].data.source !== 'db-fallback') ? Number(liveMap['MSACSR'].data.close) : getRecentPrice(marketHistory['MSACSR'], thermoToday, 60);
  const thermoGdpc1 = (() => {
    const g = liveMap['GDPC1'];
    const refDate = isValidIsoDate(g?.data?.date) ? String(g.data.date).slice(0, 10) : thermoToday;
    const curReal = (g?.data?.close != null && g.data.source !== 'db-fallback') ? Number(g.data.close) : getClosestPrice(marketHistory['GDPC1'], refDate, 120);
    if (curReal == null) return null;
    const d = new Date(refDate); d.setFullYear(d.getFullYear() - 1);
    let prev = getClosestPrice(marketHistory['GDPC1'], d.toISOString().slice(0, 10), 120);
    if (prev == null) { const qd = new Date(refDate); qd.setMonth(qd.getMonth() - 12); prev = getClosestPrice(marketHistory['GDPC1'], qd.toISOString().slice(0, 10), 120); }
    if (prev == null || prev === 0) return null;
    return (curReal / prev - 1) * 100;
  })();
  const thermoVix = (liveMap['VIXCLS']?.data?.close != null && liveMap['VIXCLS'].data.source !== 'db-fallback') ? Number(liveMap['VIXCLS'].data.close) : getClosestPrice(marketHistory['VIXCLS'], thermoToday);
  const thermoFg = (liveMap['FEAR_GREED']?.data?.close != null && liveMap['FEAR_GREED'].data.source !== 'db-fallback') ? Number(liveMap['FEAR_GREED'].data.close) : getClosestPrice(marketHistory['FEAR_GREED'], thermoToday);
  const thermoY30 = (liveMap['DGS30']?.data?.close != null && liveMap['DGS30'].data.source !== 'db-fallback') ? Number(liveMap['DGS30'].data.close) : getClosestPrice(marketHistory['DGS30'], thermoToday);
  const liveFreshMin = (iso?: string) => {
    if(!iso) return null;
    const mins = Math.round((Date.now() - new Date(iso).getTime())/60000);
    if (mins < 60) return `hace ${mins} min`;
    const h = Math.floor(mins/60); return `hace ${h}h`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h3 className="font-semibold text-slate-100">Indicadores diarios — actualización automática</h3>
          <button onClick={runSync} disabled={syncing} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold shadow border border-teal-500/30 transition">
            <span className={syncing ? 'animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full' : ''}>{syncing ? '' : '↻'}</span>
            {syncing ? tSync('refreshing') : tSync('refreshButton')}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Cron <code className="text-teal-400">L-V 22:05 America/New_York</code> → <code>daily_update.py</code> (yfinance <code>auto_adjust</code> + <code>verify_splits</code>) + <code>build_shiller_daily()</code>.
          Último CAPE: <span className="text-emerald-400 font-mono">{capeLast?.cape?.toFixed(2) ?? '—'}</span> ratio {capeLast?.capeRatio?.toFixed(3) ?? '—'} @ {capeLast?.date?.slice(0,10) ?? '—'}
          <span className="ml-2 text-[11px] text-slate-500">· Precios/Bonos live vía API con caché (mercado 5 min / FRED 1h), CAPE diario desde DB</span>

        </p>
      </div>
      {/* === Termómetro de Riesgo — Mercado General (estilo CNN Fear & Greed) === */}
      {(()=>{
        // Termómetro compuesto: promedio ponderado base 100 (no suma). Cada indicador aporta
        // puntaje 0-100 × peso; al agregar más, se normaliza entre el peso total acumulado.
        const capeScore = capeLast?.cape != null ? capeRiskScore(capeLast.cape) : null;
        const peScore = thermoPe != null ? peRiskScore(thermoPe) : null;
        const fwdScore = thermoFwd != null ? fwdRiskScore(thermoFwd) : null;
        const ratioScore = capeLast?.capeRatio != null ? ratioRiskScore(capeLast.capeRatio) : null;
        const cpiScore = thermoCpi != null ? cpiRiskScore(thermoCpi) : null;
        const coreScore = thermoCore != null ? cpiRiskScore(thermoCore) : null;
        const fedScore = thermoFed != null ? fedRiskScore(thermoFed) : null;
        const y30Score = thermoY30 != null ? y30RiskScore(thermoY30) : null;
        const mgScore = thermoMargin != null ? mgRiskScore(thermoMargin) : null;
        const vixScore = thermoVix != null ? vixRiskScore(thermoVix) : null;
        const fgScore = thermoFg != null ? Math.max(0, Math.min(100, thermoFg)) : null;
        const msScore = thermoMs != null ? msRiskScore(thermoMs) : null;
        const gdpScore = thermoGdpc1 != null ? gdpRiskScore(thermoGdpc1) : null;
        const parts = [...(capeScore != null && capeLast?.cape != null ? [{ key: 'CAPE', score: capeScore, weight: 20, value: capeLast.cape, dec: 2 }] : []), ...(peScore != null && thermoPe != null ? [{ key: 'PE', score: peScore, weight: 10, value: thermoPe, dec: 2 }] : []), ...(fwdScore != null && thermoFwd != null ? [{ key: 'FWD', score: fwdScore, weight: 10, value: thermoFwd, dec: 2 }] : []), ...(ratioScore != null && capeLast?.capeRatio != null ? [{ key: 'RATIO', score: ratioScore, weight: 5, value: capeLast.capeRatio, dec: 3 }] : []), ...(cpiScore != null && thermoCpi != null ? [{ key: 'CPI', score: cpiScore, weight: 10, value: thermoCpi, dec: 2 }] : []), ...(coreScore != null && thermoCore != null ? [{ key: 'CORE', score: coreScore, weight: 5, value: thermoCore, dec: 2 }] : []), ...(fedScore != null && thermoFed != null ? [{ key: 'FED', score: fedScore, weight: 15, value: thermoFed, dec: 2 }] : []), ...(y30Score != null && thermoY30 != null ? [{ key: '30Y', score: y30Score, weight: 10, value: thermoY30, dec: 2 }] : []), ...(mgScore != null && thermoMargin != null ? [{ key: 'MG', score: mgScore, weight: 10, value: thermoMargin, dec: 2 }] : []), ...(vixScore != null && thermoVix != null ? [{ key: 'VIX', score: vixScore, weight: 10, value: thermoVix, dec: 2 }] : []), ...(fgScore != null && thermoFg != null ? [{ key: 'FG', score: fgScore, weight: 10, value: thermoFg, dec: 0 }] : []), ...(msScore != null && thermoMs != null ? [{ key: 'MS', score: msScore, weight: 5, value: thermoMs, dec: 1 }] : []), ...(gdpScore != null && thermoGdpc1 != null ? [{ key: 'PIB', score: gdpScore, weight: 10, value: thermoGdpc1, dec: 2 }] : [])];
        const wTotal = parts.reduce((m, p) => m + p.weight, 0);
        const riskScore = wTotal > 0 ? Math.round(parts.reduce((m, p) => m + p.score * p.weight, 0) / wTotal * 10) / 10 : 0;
        const riskLabel = riskScore < 25 ? 'Miedo Extremo (Alta Oportunidad)' : riskScore < 45 ? 'Miedo (Oportunidad)' : riskScore <= 55 ? 'Neutral' : riskScore <= 75 ? 'Codicia (Riesgo)' : 'Codicia Extrema (Alto Riesgo)';
        const riskColor = riskScore < 25 ? 'text-emerald-400' : riskScore < 45 ? 'text-lime-400' : riskScore <= 55 ? 'text-yellow-300' : riskScore <= 75 ? 'text-orange-400' : 'text-red-400';
        const CX = 100, CY = 104, R = 80;
        const polar = (deg:number, r:number) => { const rad = (deg * Math.PI) / 180; return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)] as const; };
        const arc = (v0:number, v1:number) => { const a0 = 180 - v0 * 1.8, a1 = 180 - v1 * 1.8; const [x0,y0] = polar(a0, R); const [x1,y1] = polar(a1, R); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
        const segs = [[0,20,'#22c55e'],[20,40,'#84cc36'],[40,60,'#eab308'],[60,80,'#f97316'],[80,100,'#ef4444']] as const;
        const [nx,ny] = polar(180 - riskScore * 1.8, R - 24);
        return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-slate-100">Termómetro BuyHoldTime</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">en construcción</span>
          </div>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <svg viewBox="0 0 200 118" className="w-full max-w-[440px] flex-[1.2] shrink" role="img" aria-label={`Riesgo ${riskScore} de 100: ${riskLabel}`}>
              {segs.map(([v0,v1,c]) => <path key={v0} d={arc(v0 + 0.8, v1 - 0.8)} fill="none" stroke={c} strokeWidth="16" strokeLinecap="butt" opacity="0.85" />)}
              <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
              <circle cx={CX} cy={CY} r="6" fill="#e2e8f0" />
              <text x="14" y="116" fill="#64748b" fontSize="9" fontFamily="monospace">0</text>
              <text x="96" y="14" fill="#64748b" fontSize="9" fontFamily="monospace">50</text>
              <text x="180" y="116" fill="#64748b" fontSize="9" fontFamily="monospace">100</text>
            </svg>
            <div className="flex-1 w-full text-center lg:text-left">
              <div className="font-mono text-5xl font-bold text-slate-100">{riskScore}<span className="text-lg text-slate-500">/100</span></div>
              <div className={`text-base font-semibold mt-1 ${riskColor}`}>{riskLabel}</div>
            </div>
            <ul className="flex-[1.4] w-full space-y-1">
              {[
                ['Miedo Extremo (Alta Oportunidad)','0–24','#22c55e','A mayor miedo, mejor oportunidad: evalúa pisos y sobreventa con CAPE y RSI para entrar fuerte en QQQ, TQQQ, SOXX — incluso con margin.'],
                ['Miedo (Oportunidad)','25–44','#84cc36','Puedes usar margen y apalancados, sin margen extremo; confirma reversión a tendencia alcista para comprar QQQ, TQQQ y calidad undervalued.'],
                ['Neutral','45–55','#eab308','No compres ni incrementes apalancados o alto margen (TQQQ, SOXL). Estrategia base: Hold de tus posiciones y acumula liquidez y defensivas.'],
                ['Codicia (Riesgo)','56–75','#f97316','Reduce QQQ/TQQQ/SOXX y baja el margen; mantén al menos 10% en Cash/SGOV para oportunidades.'],
                ['Codicia Extrema (Alto Riesgo)','76–100','#ef4444','Cero margen y apalancados a menos del 20%; lleva 20–40% a defensivas (SGOV/IB01 o SCHD según tu perfil), acumula CASH para caídas y reduce acciones/ETFs caros de forma incremental según suba el CAPE Ratio.'],
              ].map(([label,range,c,tip]) => {
                const on = label === riskLabel;
                return <li key={label} className={`px-3 py-1.5 rounded-lg text-xs ${on ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:c}} />
                    <span className={`flex-1 ${on ? 'font-semibold' : ''}`}>{label}</span>
                    <span className="font-mono">{range}</span>
                  </div>
                  <p className={`mt-0.5 pl-5 text-[11px] leading-snug ${on ? 'text-slate-300' : 'text-slate-500'}`}>{tip}</p>
                </li>;
              })}
            </ul>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Riesgo del mercado general · 0 = riesgo mínimo · 100 = riesgo máximo. Ponderado base 100: {parts.length ? parts.map(p => `${p.key} ${p.score.toFixed(0)}×${p.weight}`).join(' + ') + ` ÷ ${wTotal}` : 'sin indicadores'} · ${parts.length} indicador${parts.length === 1 ? '' : 'es'} (más por agregar: crédito, volatilidad, amplitud).</p>
          <button type="button" onClick={() => setRiskDetailOpen(o => !o)} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:text-teal-300 hover:border-slate-600 transition">
            {riskDetailOpen ? '▾ Ocultar detalle' : '▸ Ver detalle del cálculo'}
          </button>
          {riskDetailOpen && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs font-mono">
                <thead><tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left font-normal px-3 py-1.5">Indicador</th><th className="text-right font-normal px-3 py-1.5">Valor</th><th className="text-right font-normal px-3 py-1.5">Puntaje</th><th className="text-right font-normal px-3 py-1.5">Peso</th><th className="text-right font-normal px-3 py-1.5">Aporte</th>
                </tr></thead>
                <tbody>
                  {parts.map(p => (
                    <tr key={p.key} className="border-b border-slate-800/60 text-slate-300">
                      <td className="px-3 py-1.5">{p.key}</td>
                      <td className="text-right px-3 py-1.5">{p.value.toFixed(p.dec)}</td>
                      <td className="text-right px-3 py-1.5" style={{ color: capeScoreColor(p.score) }}>{p.score.toFixed(0)}</td>
                      <td className="text-right px-3 py-1.5 text-slate-400">{p.weight}</td>
                      <td className="text-right px-3 py-1.5 text-sky-300">{(p.score * p.weight / (wTotal || 1)).toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="text-slate-100 font-semibold">
                    <td className="px-3 py-1.5" colSpan={4}>Puntaje final = Σ ÷ {wTotal}</td>
                    <td className="text-right px-3 py-1.5">{riskScore.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        );
      })()}
      <MarketSyncModal open={marketSync.open} logs={marketSync.logs} refreshing={marketSync.refreshing} error={marketSync.error} onClose={marketSync.close} />

      {/* === Cards agrupadas por categoría + tooltips === */}
      {(() => {
        const tooltipMap: Record<string, string> = {
          schiller_pe: 'CAPE = Precio / promedio 10a ganancias reales. >30 sobrevalorado (vender/reducir), 20-30 normal, <20 barato (comprar). Ratio = CAPE/mean3y.',
          pe_ratio: 'S&P 500 PE = Precio / EPS 12m. Alto = mercado caro vs beneficios. Complementa CAPE (corto plazo).',
          fwd_pe_ratio: 'Forward PE = Precio / EPS estimado 12m (operating, consenso S&P). >22 caro, 17-22 normal, <17 barato. Mira expectativas, no pasado. Debajo del promedio 10a (~19) = razonable.',
          inflation: 'CPI YoY = (CPI_t / CPI_{t-12} -1)*100. >3% presiona Fed a subir tasas. Dato mensual FRED CPIAUCSL.',
          core_inflation: 'Core CPI sin alimentos/energía. Más estable, la Fed lo mira para decidir tasas.',
          fed_rate: 'FED Target Upper (DFEDTARU). 0.25% 2008-2015 ZIRP, hoy ~3.75%. Sube para frenar inflación.',
          treasury_30y: 'Treasury 30Y = tasa libre de riesgo larga. Base para valorar acciones vs bonos.',
          vix: 'VIX = volatilidad implícita S&P 500. >30 pánico, <15 complacencia.',
          fear_greed: 'Fear & Greed 0-100. <25 miedo (oportunidad), >75 avaricia (riesgo).',
          '^GSPC': 'S&P 500 (^GSPC) = índice 500 grandes USA. Referencia del mercado.',
          '^IXIC': 'Nasdaq (^IXIC) = tecnológico. Más volátil que S&P.',
          'TQQQ': 'TQQQ = 3× QQQ diario. Decae con volatilidad, solo para tácticas cortas.',
          'QQQ': 'QQQ = Nasdaq-100. Base para señal Mallik.',
          'SPY': 'SPY = S&P 500 ETF. Buy&Hold benchmark.',
          'VOO': 'VOO = S&P 500 Vanguard. Alternativa SPY.',
          'SCHD': 'SCHD = Dividendos calidad. Inception 2011-10-20.',
          'JEPQ': 'JEPQ = Nasdaq con covered calls + yield. Inception 2022-05-03.',
          'SQQQ': 'SQQQ = -3× QQQ (inverso). Cobertura bajista.',
          'DFEDTARU': 'FED Target Upper. Ver fed_rate.',
          'DGS2': 'Treasury 2Y = tasa corta. 2Y > 10Y = curva invertida (anticipa recesión).',
          'DGS10': 'Treasury 10Y = risk-free. Base para HY 10Y+OAS.',
          'DGS30': 'Treasury 30Y = larga. Ver treasury_30y.',
          'CPIAUCSL': 'CPI YoY = inflación total. Ver inflation.',
          'CPILFESL': 'Core CPI YoY. Ver core_inflation.',
          'BAMLH0A0HYM2': 'HY OAS = prima riesgo high-yield sobre Treasuries. >5% estrés (2008/2020). Proxy BAA10Y*1.91 pre-2023.',
          'BAMLH0A0HYM2EY': 'HY Effective Yield = tasa total HY (cupón+precio). Lo que pagan empresas HY.',
          'GDP': 'GDP = PIB nominal trimestral USA (FRED GDP, $ billones SAAR). >4% nominal fuerte, <2% débil. Se muestra con YoY nominal y real.',
          'GDPC1': 'GDPC1 = PIB real (ajustado inflación, billones 2017$). >2% expansión, <0% recesión. FRED GDPC1, YoY real = crecimiento volumen.',
          'FINRA_DEBIT': 'FINRA Debit = saldos deudores en cuentas de margen (FINRA, millones $). Alto = apalancamiento elevado, riesgo de margin calls. Dato mensual, Excel FINRA. 1997→hoy.',
          'MARGIN_GDP': 'Apalancamiento/PIB = FINRA Debit / PIB nominal. >6% extremo (euforia apalancada, riesgo de crash), 4-6% elevado, 2-4% normal, <2% bajo. Anticipa deleveraging.',
          'MSACSR': 'Meses de inventario de casas nuevas USA (FRED MSACSR, mensual). >6m = exceso de oferta (mercado frío, caen precios), 4-6m equilibrado, <4m escasez (mercado caliente). Anticipa freno en construcción y consumo.',
          'VIXCLS': 'VIX = volatilidad implícita S&P 500 a 30 días (FRED VIXCLS, diario). >30 pánico (oportunidad), 15-20 normal, <15 complacencia.',
          'FEAR_GREED': 'CNN Fear & Greed 0-100 (diario, ~1Y historia). <25 miedo extremo (oportunidad), 25-45 miedo, 45-55 neutral, 55-75 codicia, >75 codicia extrema (riesgo).',
          'NYSE_ADV_VOL': 'Volumen de acciones NYSE que subieron (WSJ, acciones/día). Base del Net Advancing Volume.',
          'NYSE_DEC_VOL': 'Volumen de acciones NYSE que bajaron (WSJ, acciones/día).',
          'NSDQ_ADV_VOL': 'Volumen de acciones Nasdaq que subieron (WSJ, acciones/día).',
          'NSDQ_DEC_VOL': 'Volumen de acciones Nasdaq que bajaron (WSJ, acciones/día).',
          'SPX_ADV_VOL': 'Volumen de constituyentes S&P 500 que subieron (acciones/día, 1993→hoy). Base del Net Advancing Volume.',
          'SPX_DEC_VOL': 'Volumen de constituyentes S&P 500 que bajaron (acciones/día, 1993→hoy).',
        };
        const catOrder = [
          { key: 'valoracion', label: 'Valoración', icon: '📊', keys: ['schiller_pe','pe_ratio','fwd_pe_ratio'] },
          { key: 'inflacion', label: 'Inflación y Política Monetaria', icon: '🏛️', keys: ['inflation','core_inflation','fed_rate'] },
          { key: 'sentimiento', label: 'Sentimiento', icon: '😱', keys: ['VIXCLS','FEAR_GREED'] },
          { key: 'apalancamiento', label: 'Apalancamiento', icon: '💳', keys: ['FINRA_DEBIT','MARGIN_GDP'] },
          { key: 'tasas', label: 'Curva y Crédito', icon: '📈', keys: ['treasury_30y','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'] },
          { key: 'crecimiento', label: 'Crecimiento', icon: '🏭', keys: ['GDP'] },
          { key: 'vivienda', label: 'Vivienda', icon: '🏠', keys: ['MSACSR'] },
          { key: 'volumen', label: 'Volumen y amplitud', icon: '⚖️', keys: ['SPX_ADV_VOL','SPX_DEC_VOL','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL'] },
          { key: 'mercado', label: 'Mercado al contado', icon: '💹', keys: ['^GSPC','^IXIC','TQQQ','QQQ','SPY','VOO','SCHD','JEPQ','SQQQ'] },
        ];
        const indByKey = new Map(indicators.map((i:any)=>[i.key, i]));
        const mktTickers = Object.keys(markets);
        const renderTooltip = (text:string) => (
          <div className="group relative inline-flex ml-1">
            <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center cursor-help border border-slate-600">?</span>
            <div className="hidden group-hover:block absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 shadow-xl leading-relaxed whitespace-normal">{text}</div>
          </div>
        );
        const IndicatorCard = ({ind}:{ind:any}) => {
          const isSchiller = ind.key === 'schiller_pe';
          // Priorizar live FRED para que card y tabla coincidan (5.25% stale → 3.75% live)
          const liveTickerForInd: Record<string,string> = { fed_rate:'DFEDTARU', treasury_30y:'DGS30', inflation:'CPIAUCSL', core_inflation:'CPILFESL' };
          const liveKey = liveTickerForInd[ind.key];
          const liveVal = liveKey ? liveMap[liveKey]?.data?.close : null;
          const liveSrc = liveKey ? liveMap[liveKey]?.data?.source : null;
          const useLive = liveVal!=null && liveSrc!=='db-fallback';
          const isInflation = ind.key==='inflation' || ind.key==='core_inflation';
          const inflationYoY = isInflation ? getCpiYoY(marketHistory[liveKey!], liveMap[liveKey!]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const displayValue = isSchiller && capeLast?.cape != null ? capeLast.cape : (isInflation && inflationYoY!=null ? inflationYoY : (useLive ? liveVal : ind.currentValue));
          const displayStatus = isSchiller && capeLast?.cape != null ? (capeLast.cape >= 30 ? 'High' : capeLast.cape >= 20 ? 'Normal' : 'Low') : ind.status;
          const tip = tooltipMap[ind.key] || ind.description || '';
          // Grupo banda+orbe estándar: una sola config por tarjeta con puntaje.
          const sg = isSchiller && capeLast?.cape != null
            ? { label: capeBandLabel(capeLast.cape), score: Math.round(capeRiskScore(capeLast.cape)), name: 'CAPE', value: capeLast.cape, dec: 2, weight: 20, bands: CAPE_BANDS }
            : ind.key === 'pe_ratio' && thermoPe != null
            ? { label: peBandLabel(thermoPe), score: Math.round(peRiskScore(thermoPe)), name: 'PE TTM', value: thermoPe, dec: 2, weight: 10, bands: PE_BANDS }
            : ind.key === 'fwd_pe_ratio' && thermoFwd != null
            ? { label: fwdBandLabel(thermoFwd), score: Math.round(fwdRiskScore(thermoFwd)), name: 'Fwd PE', value: thermoFwd, dec: 2, weight: 10, bands: FWD_BANDS }
            : ind.key === 'inflation' && thermoCpi != null
            ? { label: cpiBandLabel(thermoCpi), score: Math.round(cpiRiskScore(thermoCpi)), name: 'CPI', value: thermoCpi, dec: 2, weight: 10, bands: CPI_BANDS }
            : ind.key === 'core_inflation' && thermoCore != null
            ? { label: cpiBandLabel(thermoCore), score: Math.round(cpiRiskScore(thermoCore)), name: 'Core', value: thermoCore, dec: 2, weight: 5, bands: CPI_BANDS }
            : ind.key === 'fed_rate' && thermoFed != null
            ? { label: fedBandLabel(thermoFed), score: Math.round(fedRiskScore(thermoFed)), name: 'FED', value: thermoFed, dec: 2, weight: 15, bands: FED_BANDS }
            : ind.key === 'treasury_30y' && thermoY30 != null
            ? { label: y30BandLabel(thermoY30), score: Math.round(y30RiskScore(thermoY30)), name: '30Y', value: thermoY30, dec: 2, weight: 10, bands: Y30_BANDS }
            : null;
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
              <div className="text-xs text-slate-500 flex items-center">{ind.key} {isSchiller && <span className="text-teal-400 ml-1">(diario)</span>} {tip && renderTooltip(tip + (isSchiller && capeLast?.cape!=null ? ` Sincronizado: ${capeLast.cape.toFixed(2)} @ ${(capeLast.date||'').slice(0,10)}` : ''))}</div>
              <div className="font-semibold text-slate-100 truncate">{ind.name}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xl font-mono text-emerald-400">{displayValue != null ? Number(displayValue).toFixed(2) : '—'}{ind.unit}{isInflation && inflationYoY!=null ? <span className="text-[10px] text-slate-500 ml-1">YoY</span> : null}</span>
                {sg ? (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/50 py-0.5 pl-2.5 pr-1">
                    {(()=>{ const c = capeScoreColor(sg.score); return <span className="text-xs font-semibold" style={{ color: c }}>{sg.label}</span>; })()}
                    <ScoreOrb name={sg.name} value={sg.value} dec={sg.dec} weight={sg.weight} score={sg.score} bands={sg.bands} small />
                  </span>
                )
                : <span className={`text-xs px-2 py-0.5 rounded-full border ${displayStatus==='High'?'bg-orange-500/20 text-orange-400 border-orange-500/30':displayStatus==='Greed'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-slate-800 text-slate-400 border-slate-700'}`}>{displayStatus}</span>}
              </div>
              {isInflation && liveVal!=null && <div className="text-[10px] font-mono text-slate-500">Índice {Number(liveVal).toFixed(2)}</div>}
              <div className="text-xs text-slate-500 mt-2 line-clamp-2">{ind.description}</div>
            </div>
          );
        };
        const MarketCard = ({t,v}:{t:string,v:number|null}) => {
          const isMarginGdp = t==='MARGIN_GDP';
          if (isMarginGdp) {
            const finraVal = liveFinra?.data?.close ?? getRecentPrice(marketHistory['FINRA_DEBIT'], new Date().toISOString().slice(0,10), 45);
            const gdpVal = liveGdp?.data?.close ?? getRecentPrice(marketHistory['GDP'], new Date().toISOString().slice(0,10), 120);
            const ratio = finraVal!=null && gdpVal!=null && gdpVal!==0 ? (finraVal/1000)/gdpVal*100 : null;
            const tip = tooltipMap[t] || '';
            const fresh = liveFreshMin(liveFinra?.data?.date || liveGdp?.data?.date);
            const level = ratio==null ? null : ratio>6?'Extremo': ratio>4?'Elevado': ratio>2?'Normal':'Bajo';
            const levelColor = ratio==null?'text-slate-400': ratio>6?'text-red-400': ratio>4?'text-orange-400': ratio>2?'text-yellow-400':'text-emerald-400';
            return (
              <div className="border rounded-lg px-3 py-2 bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">MARGIN_GDP {tip && renderTooltip(tip)} <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold">Ratio</span></div>
                <div className="font-mono text-slate-100 text-lg flex items-center gap-2">{ratio!=null? `${ratio.toFixed(2)}%`:'—'}{ratio!=null && <span className="ml-auto"><ScoreOrb name="Margen/PIB" value={ratio} weight={10} score={Math.round(mgRiskScore(ratio))} bands={MG_BANDS} small /></span>}</div>
                {ratio!=null && <div className={`text-[11px] font-mono font-semibold ${levelColor}`}>{level} · FINRA ${(finraVal!/1000).toFixed(0)}B / GDP ${(gdpVal!/1000).toFixed(1)}T</div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · FINRA/GDP</div>}
              </div>
            );
          }
          const q:any = liveMap[t];
          const live = q?.data?.close;
          const src = q?.data?.source;
          const fresh = liveFreshMin(q?.data?.date);
          const showLive = live!=null && src!=='db-fallback';
          const tip = tooltipMap[t] || '';
          const isCpi = t==='CPIAUCSL' || t==='CPILFESL';
          const isYield = ['DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'].includes(t);
          const isGDP = t==='GDP';
          const isFinra = t==='FINRA_DEBIT';
          const isMsacsr = t==='MSACSR';
          const isVix = t==='VIXCLS';
          const isFg = t==='FEAR_GREED';
          const isBreadth = t==='NYSE_ADV_VOL'||t==='NYSE_DEC_VOL'||t==='NSDQ_ADV_VOL'||t==='NSDQ_DEC_VOL'||t==='SPX_ADV_VOL'||t==='SPX_DEC_VOL';
          const fmt = (n:number) => isGDP ? `$${(n/1000).toFixed(1)}T` : isFinra ? `$${(n/1000).toFixed(0)}B` : isMsacsr ? `${n.toFixed(1)} m` : isVix ? n.toFixed(2) : isFg ? n.toFixed(0) : isBreadth ? `${(n/1e9).toFixed(2)}B` : isYield ? `${n.toFixed(2)}%` : `$${n.toFixed(2)}`;
          // CPI cards: YoY mensual fijo (no diario) — live usa mes más reciente
          const cpiYoYForCard = isCpi ? getCpiYoY(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const gdpYoY = (()=>{ if(t!=='GDP') return null; const cur = showLive ? Number(live) : (v!=null? Number(v): null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDP'], iso, 95) ?? getClosestPrice(marketHistory['GDP'], refDate, 95);
            let p = prev; if(p==null){ const qd = new Date(refDate); qd.setMonth(qd.getMonth()-12); p = getClosestPrice(marketHistory['GDP'], qd.toISOString().slice(0,10), 95); } if(p==null || p===0) return null; return (cur/p -1)*100; })();
          const gdpc1YoY = (()=>{ if(t!=='GDP') return null; const fwdRaw = liveGdpc1?.data?.date; const fwdDate = isValidIsoDate(fwdRaw) ? String(fwdRaw).slice(0,10) : new Date().toISOString().slice(0,10); const curReal = liveGdpc1?.data?.close ?? getClosestPrice(marketHistory['GDPC1'], fwdDate, 95); if(curReal==null) return null; const refRaw = isValidIsoDate(liveGdpc1?.data?.date) ? liveGdpc1?.data?.date : q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDPC1'], iso, 95); let p=prev; if(p==null){ const qd=new Date(refDate); qd.setMonth(qd.getMonth()-12); p=getClosestPrice(marketHistory['GDPC1'], qd.toISOString().slice(0,10),95);} if(p==null||p===0) return null; return (curReal/p -1)*100; })();
          // Para CPI mostrar YoY con índice como subtítulo
          if (isCpi) {
            const idxVal = showLive ? Number(live) : (v!=null ? Number(v) : null);
            return (
              <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
                <div className="font-mono text-slate-100">{cpiYoYForCard!=null ? `${cpiYoYForCard.toFixed(2)}%` : '—'} <span className="text-[10px] text-slate-500">YoY</span></div>
                {idxVal!=null && <div className="text-[10px] font-mono text-slate-500">Índice {idxVal.toFixed(2)}</div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
              </div>
            );
          }
          return (
            <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
              <div className="font-mono text-slate-100 flex items-center gap-2">{showLive ? fmt(Number(live)) : (v!=null ? fmt(Number(v)) : '—')}{(()=>{ const vv = showLive ? Number(live) : (v!=null ? Number(v) : null); if (vv == null) return null;
                if (isVix) return <span className="ml-auto"><ScoreOrb name="VIX" value={vv} weight={10} score={Math.round(vixRiskScore(vv))} bands={VIX_BANDS} small /></span>;
                if (isFg) { const s = Math.max(0, Math.min(100, Math.round(vv))); return <span className="ml-auto"><ScoreOrb name="F&G" value={vv} weight={10} score={s} bands={FG_BANDS} small /></span>; }
                if (isMsacsr) return <span className="ml-auto"><ScoreOrb name="MSACSR" value={vv} dec={1} weight={5} score={Math.round(msRiskScore(vv))} bands={MS_BANDS} small /></span>;
                if (isGDP && gdpc1YoY != null) return <span className="ml-auto"><ScoreOrb name="PIB real" value={gdpc1YoY} weight={10} score={Math.round(gdpRiskScore(gdpc1YoY))} bands={GDP_BANDS} small /></span>;
                return null; })()}</div>
              {isGDP && (gdpYoY!=null || gdpc1YoY!=null) && <div className="flex gap-2 text-[11px] font-mono font-semibold"><span className={gdpYoY!=null && gdpYoY>=0?'text-emerald-400':'text-red-400'}>{gdpYoY!=null? `${gdpYoY>=0?'▲':'▼'} ${Math.abs(gdpYoY).toFixed(2)}% Nom`:'— Nom'}</span><span className="text-slate-600">·</span><span className={gdpc1YoY!=null && gdpc1YoY>=0?'text-sky-400':'text-orange-400'}>{gdpc1YoY!=null? `${gdpc1YoY>=0?'▲':'▼'} ${Math.abs(gdpc1YoY).toFixed(2)}% Real`:'— Real'}</span></div>}
              {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
            </div>
          );
        };
        return (
          <div className="space-y-5">
            {catOrder.map(cat => {
              const inds = cat.keys.map(k=>indByKey.get(k)).filter(Boolean);
              const mkts = cat.keys.filter(k=> k==='MARGIN_GDP' || mktTickers.includes(k)).map(k=> [k, markets[k] ?? (k==='MARGIN_GDP'? getMarginGdpRatio(new Date().toISOString().slice(0,10)): null)] as const);
              if (inds.length===0 && mkts.length===0) return null;
              return (
                <div key={cat.key} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2"><span>{cat.icon}</span> {cat.label} <span className="text-xs font-normal text-slate-500">— {inds.length + mkts.length} activos</span></h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {inds.map((ind:any)=><IndicatorCard key={ind.key} ind={ind} />)}
                    {cat.key==='valoracion' && capeLast?.capeRatio != null && (()=>{
                      const ratio = capeLast.capeRatio;
                      const s = Math.round(ratioRiskScore(ratio));
                      const c = capeScoreColor(s);
                      return (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
                        <div className="text-xs text-slate-500 flex items-center">cape_ratio {renderTooltip('CAPE Ratio = CAPE / media 3a (SMA). >1.18 caro vs su historia reciente, ~1.00 justo, <0.90 barato. Es el que dispara F0 en Múltiplos Altos.')}</div>
                        <div className="font-semibold text-slate-100 truncate">CAPE Ratio</div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xl font-mono" style={{ color: c }}>{ratio.toFixed(3)}X</span>
                          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/50 py-0.5 pl-2.5 pr-1">
                            <span className="text-xs font-semibold" style={{ color: c }}>{ratioBandLabel(ratio)}</span>
                            <ScoreOrb name="Ratio" value={ratio} dec={3} weight={5} score={s} bands={RATIO_BANDS} small />
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 line-clamp-2">Valuación relativa a su media de 3 años. {`Sincronizado: ${ratio.toFixed(3)} @ ${(capeLast.date||'').slice(0,10)}`}</div>
                      </div>
                      );
                    })()}
                  </div>
                  {mkts.length>0 && (
                    <>
                      {inds.length>0 && <div className="h-px bg-slate-800 my-3" />}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {mkts.map(([t,v])=> <MarketCard key={t} t={t as string} v={v as number|null} />)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-slate-500">Mercado live Yahoo (5 min) + FRED (1h). CAPE diario desde DB. Hover “?” para interpretación.</p>
          </div>
        );
      })()}
      <MarginGdpChart marketHistory={chartHistory} cape={cape} volHistory={volHistory} />
      <CrisisEventsTable />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">CAPE Shiller — SP500 / Nasdaq / TQQQ</h3>
          <div className="flex items-center gap-2">
          <button onClick={()=>{
            const buildSheet = (view: 'daily'|'monthly'|'yearly')=>{
              const headers = ['Fecha','SP500', view==='monthly' ? 'Change Monthly' : view==='yearly' ? 'Change Yearly' : 'Change Daily','Perf 1Y','Perf Total','CAGR','Nasdaq','TQQQ','SPX EPS','PE TTM','Fwd PE','CAPE','mean3y','RatioCape','FED Target','2Y','10Y','30Y','HY OAS','HY EY','HY 10Y+OAS','CPI','Core CPI','GDP','FINRA Debit','Margin/GDP','MSACSR','VIX','F&G','Vol SPY','OBV','Fuerza','Tend-OBV','NetAdv','Up/Down','CAPE SMA 3Y','CAPE SMA 5Y','CAPE SMA 10Y','CAPE EMA 3Y','CAPE EMA 5Y','CAPE EMA 10Y'];
              let rowsView: any[] = cape;
              if(view==='monthly'){
                const byMonth = new Map<string, any>();
                for(const r of cape) byMonth.set((r.date||'').slice(0,7), r);
                rowsView = Array.from(byMonth.values());
              } else if(view==='yearly'){
                const byYear = new Map<string, any>();
                for(const r of cape) byYear.set((r.date||'').slice(0,4), r);
                rowsView = Array.from(byYear.values());
              }
              const sortedView: any[] = [...rowsView].sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
              if(sortCol!=='date'){
                const getVal = (r:any)=>{
                  const d=(r.date||'').slice(0,10);
                  if(sortCol==='spx') return getClosestPrice(marketHistory['^GSPC'], d) ?? -1e9;
                  if(sortCol==='change') return getChange(d) ?? -1e9;
                  if(sortCol==='perf1y') return getPerf1Y(d) ?? -1e9;
                  if(sortCol==='perfTotal') return getPerfTotal(d) ?? -1e9;
                  if(sortCol==='cagr') return getCAGR(d) ?? -1e9;
                  if(sortCol==='ndx') return getClosestPrice(marketHistory['^IXIC'], d) ?? -1e9;
                  if(sortCol==='tqqq') return getClosestPrice(marketHistory['TQQQ'], d) ?? -1e9;
                  if(sortCol==='cpi') return getCpiYoY(marketHistory['CPIAUCSL'], d) ?? -1e9;
                  if(sortCol==='core') return getCpiYoY(marketHistory['CPILFESL'], d) ?? -1e9;
                  if(sortCol==='gdp') return getRecentPrice(marketHistory['GDP'], d, 120) ?? -1e9;
                  if(sortCol==='finra') return getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45) ?? -1e9;
                  if(sortCol==='marginGdp') return getMarginGdpRatio(d) ?? -1e9;
                  if(sortCol==='msacsr') return getRecentPrice(marketHistory['MSACSR'], d, 35) ?? -1e9;
                  if(sortCol==='vix') return getClosestPrice(marketHistory['VIXCLS'], d) ?? -1e9;
                  if(sortCol==='fg') return getClosestPrice(marketHistory['FEAR_GREED'], d) ?? -1e9;
                  if(sortCol==='volspy') return getClosestPrice(volHistory['SPY'], d) ?? -1e9;
                  if(sortCol==='obv') return getClosestPrice(obvMap, d) ?? -1e9;
                  if(sortCol==='fuerza') return getClosestPrice(fuerzaMap, d) ?? -1e9;
                  if(sortCol==='obvt') return getClosestPrice(obvzMap, d) ?? -1e9;
                  if(sortCol==='netadv') return breadthVals(d).net ?? -1e9;
                  if(sortCol==='updown') return breadthVals(d).ratio ?? -1e9;
                  if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -1e9;
                  if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -1e9;
                  if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -1e9;
                  if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -1e9;
                  if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -1e9;
                  if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -1e9;
                  if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -1e9; }
                  if(sortCol==='spxeps') return getRecentPrice(marketHistory['SPX_EPS'], d, 120) ?? -1e9;
                  if(sortCol==='spxpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_EPS'], d, 120); return (p!=null&&e!=null&&e!==0)? p/e : -1e9; }
                  if(sortCol==='spxfwdpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130); return (p!=null&&e!=null&&e!==0)? p/e : -1e9; }
                  if(sortCol==='cape') return r.cape ?? -1e9;
                  if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -1e9);
                  if(sortCol==='ratio') return r.capeRatio ?? -1e9;
                  if(sortCol==='sma3y') return (r.mean3y ?? -1e9);
                  if(sortCol==='sma5y') return (r.mean5y ?? -1e9);
                  if(sortCol==='sma10y') return (r.mean10y ?? -1e9);
                  if(sortCol==='ema3y') return (r.mean3y_ema ?? (r as any).mean3yEma ?? -1e9);
                  if(sortCol==='ema5y') return (r.mean5y_ema ?? (r as any).mean5yEma ?? -1e9);
                  if(sortCol==='ema10y') return (r.mean10y_ema ?? (r as any).mean10yEma ?? -1e9);
                  if(sortCol==='sma3') return r.capeSma3 ?? -1e9;
                  if(sortCol==='sma5') return r.capeSma5 ?? -1e9;
                  if(sortCol==='sma10') return r.capeSma10 ?? -1e9;
                  if(sortCol==='ema3') return r.capeEma3 ?? -1e9;
                  if(sortCol==='ema5') return r.capeEma5 ?? -1e9;
                  if(sortCol==='ema10') return r.capeEma10 ?? -1e9;
                  return 0;
                };
                sortedView.sort((a:any,b:any)=>{
                  const av=getVal(a), bv=getVal(b);
                  if(av===bv) return b.date.localeCompare(a.date);
                  return sortDir==='desc' ? (bv as number)-(av as number) : (av as number)-(bv as number);
                });
              }
              const rowsData = sortedView.map((r:any)=>{
                const d=(r.date||'').slice(0,10);
                const label = view==='yearly' ? d.slice(0,4) : view==='monthly' ? d.slice(0,7) : d;
                const hyOas = getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
                const hyEy = getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d);
                const dgs10 = getClosestPrice(marketHistory['DGS10'], d);
                const hy10y = (dgs10!=null && hyOas!=null) ? dgs10 + hyOas : '';
                const cpi = getCpiYoY(marketHistory['CPIAUCSL'], d);
                const core = getCpiYoY(marketHistory['CPILFESL'], d);
                const perf1y = getPerf1Y(d);
                const varDia = getChange(d, view);
                const perfTot = getPerfTotal(d);
                const cagr = getCAGR(d);
                const gdp = getRecentPrice(marketHistory['GDP'], d, 120);
                const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45);
                const marginGdp = getMarginGdpRatio(d);
                const msacsrXls = getRecentPrice(marketHistory['MSACSR'], d, 35);
                const vixXls = getClosestPrice(marketHistory['VIXCLS'], d);
                const fgXls = getClosestPrice(marketHistory['FEAR_GREED'], d);
                const volXls = getClosestPrice(volHistory['SPY'], d);
                const obvXls = getClosestPrice(obvMap, d);
                const fuerzaXls = getClosestPrice(fuerzaMap, d);
                const obvtXls = getClosestPrice(obvzMap, d);
                const spxEpsXls = getRecentPrice(marketHistory['SPX_EPS'], d, 120);
                const spxXls = getClosestPrice(marketHistory['^GSPC'], d);
                const spxFwdEpsXls = getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130);
                const peTtmXls = (spxXls!=null && spxEpsXls!=null && spxEpsXls!==0) ? spxXls/spxEpsXls : null;
                const fwdPeXls = (spxXls!=null && spxFwdEpsXls!=null && spxFwdEpsXls!==0) ? spxXls/spxFwdEpsXls : null;
                const brXls = breadthVals(d);
                return [label, getClosestPrice(marketHistory['^GSPC'], d) ?? '', varDia != null ? Number(varDia.toFixed(2)) : '', perf1y != null ? Number(perf1y.toFixed(2)) : '', perfTot != null ? Number(perfTot.toFixed(2)) : '', cagr != null ? Number(cagr.toFixed(2)) : '', getClosestPrice(marketHistory['^IXIC'], d) ?? '', getClosestPrice(marketHistory['TQQQ'], d) ?? '', spxEpsXls != null ? Number(spxEpsXls.toFixed(2)) : '', peTtmXls != null ? Number(peTtmXls.toFixed(2)) : '', fwdPeXls != null ? Number(fwdPeXls.toFixed(2)) : '', r.cape ?? '', (r.mean3y ?? r.mean) ?? '', r.capeRatio ?? '', getClosestPrice(marketHistory['DFEDTARU'], d) ?? '', getClosestPrice(marketHistory['DGS2'], d) ?? '', getClosestPrice(marketHistory['DGS10'], d) ?? '', getClosestPrice(marketHistory['DGS30'], d) ?? '', hyOas ?? '', hyEy ?? '', hy10y, cpi ?? '', core ?? '', gdp ?? '', finra ?? '', marginGdp != null ? Number(marginGdp.toFixed(2)) : '', msacsrXls ?? '', vixXls ?? '', fgXls ?? '', volXls ?? '', obvXls ?? '', fuerzaXls != null ? Number(fuerzaXls.toFixed(3)) : '', obvtXls != null ? Number(obvtXls.toFixed(3)) : '', brXls.net ?? '', brXls.ratio ?? '', (r.mean3y ?? -1e9) !== -1e9 ? (r.mean3y ?? r.mean) : '', r.mean5y ?? '', r.mean10y ?? '', (r.mean3y_ema ?? (r as any).mean3yEma) ?? '', (r.mean5y_ema ?? (r as any).mean5yEma) ?? '', (r.mean10y_ema ?? (r as any).mean10yEma) ?? ''];
              });
              return { name: `CAPE ${view}`, headers, rows: rowsData };
            };
            const sheets = [buildSheet('daily'), buildSheet('monthly'), buildSheet('yearly')];
            exportToExcel(`CAPE-Shiller-Completo-${new Date().toISOString().slice(0,10)}.xlsx`, sheets);
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition">
            <Download size={14} /> Excel (3 pestañas)
          </button>
          <div className="flex gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg">
            {(['daily','monthly','yearly'] as const).map(v=>(
              <button key={v} onClick={()=>setCapeView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-teal-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v==='daily'?'Daily':v==='monthly'?'Monthly':'Yearly'}</button>
            ))}
          </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">CAPE diario (reconstruido) — 6 suavizados diarios. Ratio = CAPE / mean3y SMA. Vista {capeView} (default daily). Click en headers para ordenar. Perf 1Y con ~ = parcial anualizado (mes no maduro, menos de 12m transcurridos).</p>
        <div ref={scrollContainerRef} onScroll={(e)=>{
            const el = e.currentTarget as HTMLDivElement;
            if(el.scrollTop + el.clientHeight >= el.scrollHeight - 80){
              setVisibleCount(prev=> Math.min(prev+15, 10000));
            }
          }} className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">
          <table className="w-full text-xs relative">
            <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
              <tr>
                {[
                  {k:'date', label:'Fecha', cls:'text-left w-[92px] min-w-[92px] max-w-[92px] sticky left-0 bg-slate-900 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]'},
                  {k:'spx', label:'SP500', cls:'text-right text-sky-300'},
                  {k:'change', label:changeLabel(), cls:'text-right text-cyan-300'},
                  {k:'perf1y', label:'Perf 1Y', cls:'text-right text-lime-300'},
                  {k:'perfTotal', label:'Perf Total', cls:'text-right text-teal-300'},
                  {k:'cagr', label:'CAGR', cls:'text-right text-amber-300'},
                  {k:'ndx', label:'Nasdaq', cls:'text-right text-sky-300'},
                  {k:'tqqq', label:'TQQQ', cls:'text-right text-sky-300'},
                  {k:'spxeps', label:'SPX EPS', cls:'text-right text-teal-300'},
                  {k:'spxpe', label:'PE TTM', cls:'text-right text-teal-300'},
                  {k:'spxfwdpe', label:'Fwd PE', cls:'text-right text-teal-300'},
                  {k:'cape', label:'CAPE', cls:'text-right'},
                  {k:'mean3y', label:'mean3y', cls:'text-right text-amber-300'},
                  {k:'ratio', label:'RatioCape', cls:'text-right'},
                  {k:'fed', label:'FED Target', cls:'text-right text-violet-300'},
                  {k:'dgs2', label:'2Y', cls:'text-right text-cyan-300'},
                  {k:'dgs10', label:'10Y', cls:'text-right text-cyan-300'},
                  {k:'dgs30', label:'30Y', cls:'text-right text-cyan-300'},
                  {k:'hyOas', label:'HY OAS', cls:'text-right text-orange-300'},
                  {k:'hyEy', label:'HY EY', cls:'text-right text-orange-300'},
                  {k:'hy10y', label:'HY 10Y+OAS', cls:'text-right text-orange-300'},
                  {k:'cpi', label:'CPI', cls:'text-right text-emerald-300'},
                  {k:'core', label:'Core CPI', cls:'text-right text-emerald-300'},
                  {k:'gdp', label:'GDP', cls:'text-right text-indigo-300'},
                  {k:'finra', label:'FINRA Debit', cls:'text-right text-rose-300'},
                  {k:'marginGdp', label:'Margin/GDP', cls:'text-right text-rose-300'},
                  {k:'msacsr', label:'MSACSR', cls:'text-right text-amber-300'},
                  {k:'vix', label:'VIX', cls:'text-right text-red-300'},
                  {k:'fg', label:'F&G', cls:'text-right text-emerald-300'},
                  {k:'volspy', label:'Vol SPY', cls:'text-right text-sky-300'},
                  {k:'obv', label:'OBV', cls:'text-right text-fuchsia-300'},
                  {k:'fuerza', label:'Fuerza', cls:'text-right text-rose-300'},
                  {k:'obvt', label:'Tend-OBV', cls:'text-right text-purple-300'},
                  {k:'netadv', label:'NetAdv', cls:'text-right text-lime-300'},
                  {k:'updown', label:'Up/Down', cls:'text-right text-blue-300'},
                  {k:'sma3y', label:'CAPE SMA 3Y', cls:'text-right'},
                  {k:'sma5y', label:'CAPE SMA 5Y', cls:'text-right'},
                  {k:'sma10y', label:'CAPE SMA 10Y', cls:'text-right'},
                  {k:'ema3y', label:'CAPE EMA 3Y', cls:'text-right'},
                  {k:'ema5y', label:'CAPE EMA 5Y', cls:'text-right'},
                  {k:'ema10y', label:'CAPE EMA 10Y', cls:'text-right'},
                ].map(col=>(
                  <th key={col.k} onClick={()=>toggleSort(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-teal-300 ${sortCol===col.k?'text-teal-300':''}`}>
                    {col.label} <span className="text-[10px]">{sortCol===col.k ? (sortDir==='asc'?'▲':'▼') : '↕'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {(()=>{
                let rows = cape;
                if (capeView==='monthly') {
                  const byMonth = new Map<string, any>();
                  for (const r of cape) byMonth.set((r.date||'').slice(0,7), r);
                  rows = Array.from(byMonth.values());
                } else if (capeView==='yearly') {
                  const byYear = new Map<string, any>();
                  for (const r of cape) byYear.set((r.date||'').slice(0,4), r);
                  rows = Array.from(byYear.values());
                }
                // determinar fecha más reciente en vista para resaltar como "Actual"
                const maxDate = rows.length ? rows.reduce((m:any, r:any)=> r.date>m?r.date:m, rows[0].date) : null;
                let sorted: any[] = [...rows];
                if(sortCol==='date'){
                  sorted.sort((a:any,b:any)=> sortDir==='desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
                } else {
                  const getVal = (r:any)=>{
                    const d=(r.date||'').slice(0,10);
                    if(sortCol==='spx') return getClosestPrice(marketHistory['^GSPC'], d) ?? -Infinity;
                    if(sortCol==='change') return getChange(d) ?? -Infinity;
                    if(sortCol==='perf1y') return getPerf1Y(d) ?? -Infinity;
                    if(sortCol==='perfTotal') return getPerfTotal(d) ?? -Infinity;
                    if(sortCol==='cagr') return getCAGR(d) ?? -Infinity;
                    if(sortCol==='ndx') return getClosestPrice(marketHistory['^IXIC'], d) ?? -Infinity;
                    if(sortCol==='tqqq') return getClosestPrice(marketHistory['TQQQ'], d) ?? -Infinity;
                    if(sortCol==='cpi') return getCpiYoY(marketHistory['CPIAUCSL'], d) ?? -Infinity;
                    if(sortCol==='core') return getCpiYoY(marketHistory['CPILFESL'], d) ?? -Infinity;
                    if(sortCol==='gdp') return getRecentPrice(marketHistory['GDP'], d, 120) ?? -Infinity;
                    if(sortCol==='finra') return getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45) ?? -Infinity;
                    if(sortCol==='marginGdp') return getMarginGdpRatio(d) ?? -Infinity;
                    if(sortCol==='msacsr') return getRecentPrice(marketHistory['MSACSR'], d, 35) ?? -Infinity;
                    if(sortCol==='vix') return getClosestPrice(marketHistory['VIXCLS'], d) ?? -Infinity;
                    if(sortCol==='fg') return getClosestPrice(marketHistory['FEAR_GREED'], d) ?? -Infinity;
                    if(sortCol==='volspy') return getClosestPrice(volHistory['SPY'], d) ?? -Infinity;
                    if(sortCol==='obv') return getClosestPrice(obvMap, d) ?? -Infinity;
                    if(sortCol==='fuerza') return getClosestPrice(fuerzaMap, d) ?? -Infinity;
                    if(sortCol==='obvt') return getClosestPrice(obvzMap, d) ?? -Infinity;
                    if(sortCol==='netadv') return breadthVals(d).net ?? -Infinity;
                    if(sortCol==='updown') return breadthVals(d).ratio ?? -Infinity;
                    if(sortCol==='fed') return getClosestPrice(marketHistory['DFEDTARU'], d) ?? -Infinity;
                    if(sortCol==='dgs2') return getClosestPrice(marketHistory['DGS2'], d) ?? -Infinity;
                    if(sortCol==='dgs10') return getClosestPrice(marketHistory['DGS10'], d) ?? -Infinity;
                    if(sortCol==='dgs30') return getClosestPrice(marketHistory['DGS30'], d) ?? -Infinity;
                    if(sortCol==='hyOas') return getClosestPrice(marketHistory['BAMLH0A0HYM2'], d) ?? -Infinity;
                    if(sortCol==='hyEy') return getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d) ?? -Infinity;
                    if(sortCol==='hy10y') { const o=getClosestPrice(marketHistory['BAMLH0A0HYM2'], d); const t=getClosestPrice(marketHistory['DGS10'], d); return (o!=null&&t!=null)? o+t : -Infinity; }
                    if(sortCol==='spxeps') return getRecentPrice(marketHistory['SPX_EPS'], d, 120) ?? -Infinity;
                    if(sortCol==='spxpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_EPS'], d, 120); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='spxfwdpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='cape') return r.cape ?? -Infinity;
                    if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -Infinity);
                    if(sortCol==='ratio') return r.capeRatio ?? -Infinity;
                    if(sortCol==='sma3y') return (r.mean3y ?? -Infinity);
                    if(sortCol==='sma5y') return (r.mean5y ?? -Infinity);
                    if(sortCol==='sma10y') return (r.mean10y ?? -Infinity);
                    if(sortCol==='ema3y') return (r.mean3y_ema ?? (r as any).mean3yEma ?? -Infinity);
                    if(sortCol==='ema5y') return (r.mean5y_ema ?? (r as any).mean5yEma ?? -Infinity);
                    if(sortCol==='ema10y') return (r.mean10y_ema ?? (r as any).mean10yEma ?? -Infinity);
                    if(sortCol==='sma3') return r.capeSma3 ?? -Infinity;
                    if(sortCol==='sma5') return r.capeSma5 ?? -Infinity;
                    if(sortCol==='sma10') return r.capeSma10 ?? -Infinity;
                    if(sortCol==='ema3') return r.capeEma3 ?? -Infinity;
                    if(sortCol==='ema5') return r.capeEma5 ?? -Infinity;
                    if(sortCol==='ema10') return r.capeEma10 ?? -Infinity;
                    return 0;
                  };
                  sorted.sort((a:any,b:any)=>{
                    const av=getVal(a), bv=getVal(b);
                    if(av===bv) return b.date.localeCompare(a.date);
                    return sortDir==='desc' ? (bv as number)-(av as number) : (av as number)-(bv as number);
                  });
                }
                const paginated = sorted.slice(0, visibleCount);
                const isLastPage = paginated.length >= sorted.length;
                return paginated.map((r:any, idx:number)=>{
                const ratio = r.capeRatio;
                const ratioColor = ratio==null ? 'text-slate-400' : ratio < 0.9 ? 'text-emerald-400' : ratio < 1.05 ? 'text-green-400' : ratio < 1.18 ? 'text-yellow-400' : ratio < 1.35 ? 'text-orange-400' : 'text-red-400';
                const ratioBg = ratio==null ? '' : ratio < 0.9 ? 'bg-emerald-500/10' : ratio < 1.05 ? 'bg-green-500/10' : ratio < 1.18 ? 'bg-yellow-500/10' : ratio < 1.35 ? 'bg-orange-500/10' : 'bg-red-500/10';
                const d = (r.date||'').slice(0,10);
                const spx = getClosestPrice(marketHistory['^GSPC'], d);
                const ndx = getClosestPrice(marketHistory['^IXIC'], d);
                const tqqq = getClosestPrice(marketHistory['TQQQ'], d);
                const cpi = getCpiYoY(marketHistory['CPIAUCSL'], d);
                const core = getCpiYoY(marketHistory['CPILFESL'], d);
                const gdpVal = getRecentPrice(marketHistory['GDP'], d, 120);
                const fed = getClosestPrice(marketHistory['DFEDTARU'], d);
                const dgs2 = getClosestPrice(marketHistory['DGS2'], d);
                const dgs10 = getClosestPrice(marketHistory['DGS10'], d);
                const dgs30 = getClosestPrice(marketHistory['DGS30'], d);
                const hyOas = getClosestPrice(marketHistory['BAMLH0A0HYM2'], d);
                const hyEy = getClosestPrice(marketHistory['BAMLH0A0HYM2EY'], d);
                const hy10y = (dgs10!=null && hyOas!=null) ? dgs10 + hyOas : null;
                const msacsr = getRecentPrice(marketHistory['MSACSR'], d, 35);
                const vix = getClosestPrice(marketHistory['VIXCLS'], d);
                const fg = getClosestPrice(marketHistory['FEAR_GREED'], d);
                const isLast = idx === paginated.length - 1 && !isLastPage;
                const isCurrent = sortCol==='date' && sortDir==='desc' && r.date===maxDate;
                // si es fila actual y tenemos live, sobre-escribir precios con live (solo cuando date==maxDate y esa fecha es hoy±1d)
                const useLive = isCurrent;
                const spxLive = useLive ? liveGspc.data?.close : null;
                const ndxLive = useLive ? liveIxic.data?.close : null;
                const tqqqLive = useLive ? liveTqqq.data?.close : null;
                const cpiLive = useLive ? liveCpi.data?.close : null;
                const coreLive = useLive ? liveCore.data?.close : null;
                const gdpLive = useLive ? liveGdp.data?.close : null;
                const fedLive = useLive ? liveFed.data?.close : null;
                const y2Live = useLive ? live2y.data?.close : null;
                const y10Live = useLive ? live10y.data?.close : null;
                const y30Live = useLive ? live30y.data?.close : null;
                const msacsrLive = useLive ? liveMsacsr.data?.close : null;
                const vixLive = useLive ? liveVix.data?.close : null;
                const fgLive = useLive ? liveFg.data?.close : null;
                const spxDisp = (spxLive!=null && liveGspc.data?.source!=='db-fallback') ? spxLive : spx;
                const ndxDisp = (ndxLive!=null && liveIxic.data?.source!=='db-fallback') ? ndxLive : ndx;
                const tqqqDisp = (tqqqLive!=null && liveTqqq.data?.source!=='db-fallback') ? tqqqLive : tqqq;
                const cpiDisp = (cpiLive!=null) ? (getCpiYoY(marketHistory['CPIAUCSL'], liveCpi.data?.date || d) ?? cpi) : cpi;
                const coreDisp = (coreLive!=null) ? (getCpiYoY(marketHistory['CPILFESL'], liveCore.data?.date || d) ?? core) : core;
                const gdpDisp = (gdpLive!=null) ? gdpLive : gdpVal;
                const fedDisp = (fedLive!=null) ? fedLive : fed;
                const dgs2Disp = (y2Live!=null) ? y2Live : dgs2;
                const dgs10Disp = (y10Live!=null) ? y10Live : dgs10;
                const dgs30Disp = (y30Live!=null) ? y30Live : dgs30;
                const msacsrDisp = (msacsrLive!=null) ? msacsrLive : msacsr;
                const vixDisp = (vixLive!=null && liveVix.data?.source!=='db-fallback') ? vixLive : vix;
                const fgDisp = (fgLive!=null && liveFg.data?.source!=='db-fallback') ? fgLive : fg;
                const volSpy = getClosestPrice(volHistory['SPY'], d);
                const obv = getClosestPrice(obvMap, d);
                const fuerza = getClosestPrice(fuerzaMap, d);
                const obvt = getClosestPrice(obvzMap, d);
                const spxEps = getRecentPrice(marketHistory['SPX_EPS'], d, 120);
                const spxFwdEps = getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130);
                const br = breadthVals(d);
                const fmtVol = (v:number|null) => v==null ? '—' : v>=1e9 ? `${(v/1e9).toFixed(2)}B` : `${(v/1e6).toFixed(1)}M`;
                const hyOasLive = useLive ? liveHyOas.data?.close : null;
                const hyEyLive = useLive ? liveHyEy.data?.close : null;
                const hyOasDisp = (hyOasLive!=null) ? hyOasLive : hyOas;
                const hyEyDisp = (hyEyLive!=null) ? hyEyLive : hyEy;
                const hy10yDisp = (hyOasDisp!=null && dgs10Disp!=null) ? dgs10Disp + hyOasDisp : hy10y;
                return (
                <tr key={r.date} ref={isLast ? observerRef : null} className={`${isCurrent ? 'bg-teal-500/[0.08] border-l-2 border-l-teal-500 ring-1 ring-teal-500/15' : 'hover:bg-slate-900/40'} transition-colors`}>
                  <td className={`p-1.5 px-2 font-mono whitespace-nowrap w-[92px] min-w-[92px] max-w-[92px] align-top sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.25)] ${isCurrent ? 'bg-slate-900' : 'bg-slate-950 group-hover:bg-slate-900'}`}><div className="flex flex-col items-start leading-none gap-0.5"><span className={`${isCurrent ? 'text-teal-300 font-bold' : 'text-slate-200'} text-xs`}>{capeView==='yearly' ? d.slice(0,4) : capeView==='monthly' ? d.slice(0,7) : d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500 text-white font-bold leading-none">Actual</span>}</div></td>
                  {(()=>{ if(spxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^GSPC', d, x: e.clientX, y: e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^GSPC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(spxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ const p=getChange(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>1?'text-emerald-400 bg-emerald-500/10':p>0.25?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-0.5?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={changeTitle(d)}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getPerf1Y(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const mature=isPerf1YMature(d); const cls = !mature ? 'text-sky-300 bg-sky-500/10 italic' : p>15?'text-emerald-400 bg-emerald-500/10':p>5?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-5?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const tip = mature ? `SP500 ${d} → +12m` : `SP500 ${d} → hoy: parcial anualizado (${perf1YElapsedMonths(d)}m transcurridos, no maduro)`; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={tip}>{arrow} {!mature?'~ ':''}{p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getPerfTotal(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>100?'text-emerald-300 bg-emerald-500/15':p>50?'text-emerald-400 bg-emerald-500/10':p>15?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-10?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const todayS = new Date().toISOString().slice(0,10); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`SP500 ${d} → hoy ${todayS}`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getCAGR(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>15?'text-emerald-400 bg-emerald-500/10':p>10?'text-green-400 bg-green-500/10':p>5?'text-yellow-400 bg-yellow-500/10':p>0?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const years = ((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`CAGR ${d} → hoy (${years}a): (Phoy/Pd)^(1/años)-1`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ if(ndxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^IXIC', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^IXIC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(ndxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ if(tqqqDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'TQQQ', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='TQQQ' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(tqqqDisp).toFixed(2)}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`S&P 500 EPS TTM ${d} — multpl mensual`}>{spxEps!=null?`$${spxEps.toFixed(2)}`:'—'}</td>
                  {(()=>{ const pe=(spxDisp!=null&&spxEps!=null&&spxEps!==0)? spxDisp/spxEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`PE TTM ${d} — precio SPX / EPS TTM`}>{pe.toFixed(2)}</td>; })()}
                  {(()=>{ const pe=(spxDisp!=null&&spxFwdEps!=null&&spxFwdEps!==0)? spxDisp/spxFwdEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`Forward PE ${d} — precio SPX / EPS estimado 12m (operating)`}>{pe.toFixed(2)}</td>; })()}
                  <td className="p-2 text-right font-mono text-emerald-400 whitespace-nowrap">{r.cape?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-amber-300 whitespace-nowrap">{(r.mean3y ?? r.mean)?.toFixed(2) ?? '—'}</td>
                  <td className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${ratioColor} ${ratioBg} rounded`}>{ratio!=null ? `${ratio.toFixed(3)}X` : '—'}</td>
                  <td className="p-2 text-right font-mono text-violet-300 whitespace-nowrap">{fedDisp!=null?`${Number(fedDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs2Disp!=null?`${Number(dgs2Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs10Disp!=null?`${Number(dgs10Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs30Disp!=null?`${Number(dgs30Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2 OAS">{hyOasDisp!=null?`${Number(hyOasDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2EY Effective Yield">{hyEyDisp!=null?`${Number(hyEyDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="DGS10 + OAS">{hy10yDisp!=null?`${Number(hy10yDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-emerald-300 whitespace-nowrap">{cpiDisp!=null?`${Number(cpiDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-emerald-300 whitespace-nowrap">{coreDisp!=null?`${Number(coreDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-indigo-300 whitespace-nowrap">{gdpDisp!=null?`$${(Number(gdpDisp)/1000).toFixed(1)}T`:'—'}</td>
                  <td className="p-2 text-right font-mono text-rose-300 whitespace-nowrap">{(()=>{ const v=getRecentPrice(marketHistory['FINRA_DEBIT'], d, 45); return v!=null? `$${(v/1000).toFixed(0)}B`:'—'; })()}</td>
                  {(()=>{ const v=getMarginGdpRatio(d); if(v==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=v>6?'text-red-400 bg-red-500/10 border-red-500/20':v>4?'text-orange-400 bg-orange-500/10 border-orange-500/20':v>2?'text-yellow-400 bg-yellow-500/10 border-yellow-500/20':'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold border rounded ${cls}`}>{v.toFixed(2)}%</td>; })()}
                  {(()=>{ if(msacsrDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=msacsrDisp>6?'text-red-400 bg-red-500/10':msacsrDisp>=4?'text-yellow-400 bg-yellow-500/10':'text-emerald-400 bg-emerald-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`MSACSR ${d} — meses de inventario casas nuevas`}>{Number(msacsrDisp).toFixed(1)} m</td>; })()}
                  {(()=>{ if(vixDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=vixDisp>30?'text-red-400 bg-red-500/10':vixDisp>20?'text-yellow-400 bg-yellow-500/10':vixDisp>=12?'text-slate-200':'text-emerald-400 bg-emerald-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`VIX ${d} — volatilidad implícita S&P 500`}>{Number(vixDisp).toFixed(2)}</td>; })()}
                  {(()=>{ if(fgDisp==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=fgDisp>=55?'text-emerald-400 bg-emerald-500/10':fgDisp>=45?'text-slate-200':fgDisp>=25?'text-yellow-400 bg-yellow-500/10':'text-red-400 bg-red-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Fear & Greed ${d} — 0 miedo extremo / 100 codicia extrema`}>{Number(fgDisp).toFixed(0)}</td>; })()}
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap" title={`Volumen SPY ${d} (acciones)`}>{fmtVol(volSpy)}</td>
                  <td className="p-2 text-right font-mono text-fuchsia-300 whitespace-nowrap" title={`OBV SPY ${d} — acumulado con signo del cierre`}>{obv!=null?fmtVol(obv):'—'}</td>
                  {(()=>{ if(fuerza==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=fuerza>=1?'text-emerald-400 bg-emerald-500/10':fuerza>=0.5?'text-green-400 bg-green-500/10':fuerza>0?'text-slate-200':fuerza>-0.5?'text-slate-200':fuerza>-1?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Fuerza diaria ${d} — (OBV hoy−OBV ayer)/SMA20(Vol): >+1 bullish extremo, <−1 bearish extremo`}>{fuerza>=0?'+':''}{fuerza.toFixed(2)}</td>; })()}
                  {(()=>{ if(obvt==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=obvt>=2?'text-emerald-400 bg-emerald-500/10':obvt>=0?'text-green-400 bg-green-500/10':obvt>-2?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Tend-OBV ${d} — Z-Score 20d del OBV: >0 acumulación, <0 distribución`}>{obvt>=0?'+':''}{obvt.toFixed(2)}σ</td>; })()}
                  {(()=>{ if(br.net==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=br.net>=0?'text-emerald-400 bg-emerald-500/10':'text-red-400 bg-red-500/10'; const s=br.net>=0?'+':'−'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Net Advancing Volume ${d} — constituyentes S&P 500`}>{s}{fmtVol(Math.abs(br.net))}</td>; })()}
                  {(()=>{ if(br.ratio==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=br.ratio>=1?'text-emerald-400 bg-emerald-500/10':'text-red-400 bg-red-500/10'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`Up/Down Volume Ratio ${d} — vol subida / vol bajada`}>{br.ratio.toFixed(2)}x</td>; })()}
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean3y ?? (r as any).mean ?? (r as any).mean3y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean5y ?? (r as any).mean5y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-300 whitespace-nowrap">{(r.mean10y ?? (r as any).mean10y)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean3y_ema ?? (r as any).mean3yEma ?? (r as any).mean3y_ema)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean5y_ema ?? (r as any).mean5yEma ?? (r as any).mean5y_ema)?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap">{(r.mean10y_ema ?? (r as any).mean10yEma ?? (r as any).mean10y_ema)?.toFixed(2) ?? '—'}</td>
                </tr>
              )})})()}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Scroll para cargar más · {cape.length} días (1990→hoy, sin fines de semana) · SP500/Nasdaq/TQQQ cierre diario · SMA/EMA 3/5/10 sobre CAPE diario · Ratio semaforizado</p>
      </div>
      {stockHover && (()=>{ const {ticker, d, x, y, cape:chCape, ratio:chRatio}=stockHover; const price=getClosestPrice(marketHistory[ticker], d); const p1y=getTickerPrice1Y(ticker,d); const perf1y=getTickerPerf1Y(ticker,d); const todayP=getTodayPrice(ticker); const perfTot=getTickerPerfTotal(ticker,d); const cagr=getTickerCAGR(ticker,d); const years=((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); const label=ticker==='^GSPC'?'SP500':ticker==='^IXIC'?'Nasdaq':ticker; const left = Math.min(Math.max(8, x+12), (typeof window!=='undefined'? window.innerWidth-332: 1000)); const top = Math.min(Math.max(8, y+12), (typeof window!=='undefined'? window.innerHeight-260: 800)); const nextD = (()=>{ const nd=new Date(d); nd.setMonth(nd.getMonth()+12); return nd.toISOString().slice(0,10); })(); return <div className="fixed z-[9999] w-[320px] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-relaxed text-slate-200 text-left" style={{left, top}} onMouseLeave={()=>setStockHover(null)}><div className="font-bold text-sky-300 mb-1.5 flex justify-between"><span>{label} · {d}</span><span className="text-slate-400 font-mono">CAPE {chCape?.toFixed(2) ?? '—'} · {chRatio!=null? chRatio.toFixed(2)+'×':'—'}</span></div><div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]"><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Precio entonces</div><div className="text-slate-100 font-bold">{price!=null? '$'+Number(price).toFixed(2):'—'}</div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Hoy {new Date().toISOString().slice(0,10)}</div><div className="text-slate-100 font-bold">{todayP!=null? '$'+Number(todayP).toFixed(2):'—'} <span className={perfTot!=null && perfTot>0?'text-emerald-400':'text-red-400'}>{perfTot!=null? (perfTot>0?'▲ ':'▼ ')+perfTot.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">+1 año {nextD}</div><div className="text-slate-100 font-bold">{p1y!=null? '$'+Number(p1y).toFixed(2):'—'} <span className={perf1y!=null && perf1y>0?'text-emerald-400':'text-red-400'}>{perf1y!=null? (perf1y>0?'▲ ':'▼ ')+perf1y.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">CAGR ({years}a)</div><div className="text-amber-300 font-bold">{cagr!=null? (cagr>0?'▲ ':'▼ ')+cagr.toFixed(2)+'%':'—'}</div></div></div><div className="text-[10px] text-slate-500 mt-1.5">{ticker==='TQQQ'?'TQQQ 3× Nasdaq · inception 2010-02-11':'S&P 500 / Nasdaq · valor nominal + performance 1Y y total'} · CAPE ratio = CAPE/mean3y</div></div>; })()}
    </div>
  );
}
