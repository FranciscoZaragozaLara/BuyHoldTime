'use client';
import { getApiBase } from '@/lib/apiBase';
import { useCallback, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { levelLabel } from '@/lib/levelLabels';
import { bhtHistoryRows, monthLabel, orbHistoryRows, shortDate, ORB_PART_KEY, PART_ORB_NAME, type MonthlyParts, type OrbHistoryRow } from '@/lib/orbHistory';
import { useMarketSyncStream } from './useMarketSyncStream';
import MarketSyncModal from './MarketSyncModal';
import { MarginGdpChart } from './MarginGdpChart';
import { BhtTimeline } from './BhtTimeline';
import { BhtStats } from './BhtStats';
import { CrisisEventsTable } from './CrisisEventsTable';
import { BHT_BANDS, BHT_CUTS, bhtBand, bhtBandColor } from './bhtBands';
import { Download } from 'lucide-react';
import { buildCapeTableRows } from '@/lib/capeTableRows';
import { exportToExcel } from '@/lib/exportExcel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLiveStaleTime, isMarketOpen } from '@/lib/queryClient';
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import { useIsAdmin } from '@/context/AuthContext';


// Termómetro de hoy (BHT en vivo + bonus HY/LIQ/Oil) calculado en el backend con la misma
// computeThermoDay que guarda el histórico y con los datos en vivo que él consulta.
// La clave empieza con 'live' para que el botón Sync la invalide junto con los tickers.
type ThermoLive = {
  date: string; value: number | null;
  parts: { key: string; score: number; weight: number; value: number }[];
  hy: { bonus: number; label: string; hy: number | null; z: number | null; d1: number | null };
  liq: { bonus: number; label: string; yoy: number | null; m0d3: number | null; drop: number | null };
  oil: { bonus: number; label: string; ratio: number | null; price: number | null };
};
function useThermoLive(){
  return useQuery({
    queryKey: ['live', 'thermo'],
    queryFn: async (): Promise<ThermoLive> => {
      const r = await fetch(`${getApiBase()}/api/backtesting/thermo-live`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j: any = await r.json();
      if (!j || !Array.isArray(j.parts) || typeof j.hy?.bonus !== 'number') throw new Error('thermo-live payload inválido');
      return j as ThermoLive;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
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
      if (['DFEDTARU','DGS2','DGS10','DGS30','MSACSR','VIXCLS','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','M2SL','BOGMBASE','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL','SPX_ADV_VOL','SPX_DEC_VOL','CAPE'].includes(t)) return false as any;
      return isMarketOpen() ? 5*60*1000 : false as any;
    },
  });
}

// === Termómetro BuyHoldTime: puntaje CAPE 0-100 (100 = riesgo máximo) ===
// Bandas aprobadas: [lo, hi, puntajeLo, puntajeHi, etiqueta, display]
const CAPE_SEGS: [number, number, number, number, string, string][] = [
  [-Infinity, 29, 0, 25, 'Barato', '≤ 29'],
  [29, 35, 25, 50, 'Justo', '29–35'],
  [35, 40, 50, 70, 'Caro', '35–40'],
  [40, 43, 70, 100, 'Elevado', '40–43'],
  [43, Infinity, 100, 100, 'Extremo', '≥ 43'],
];
function bandScore(segs: [number, number, number, number][], v: number): number {
  for (const [lo, hi, sLo, sHi] of segs) {
    if (v >= lo && v < hi) return sLo + (v - Math.max(lo, -1e9)) * ((sHi - sLo) / (Math.min(hi, 1e9) - Math.max(lo, -1e9) || 1));
  }
  return 100;
}
export function capeRiskScore(cape: number): number {
  return bandScore(CAPE_SEGS.map(([lo, hi, sLo, sHi]) => [lo, hi, sLo, sHi] as [number, number, number, number]), cape);
}
// Forward PE: misma escala de puntos (Caro = 50–60 como base central)
const FWD_SEGS: [number, number, number, number][] = [
  [-Infinity, 15, 0, 25], [15, 19, 25, 50], [19, 22, 50, 80],
  [22, 24, 80, 100], [24, Infinity, 100, 100],
];
function fwdRiskScore(pe: number): number {
  return bandScore(FWD_SEGS, pe);
}
// CAPE Ratio 5 bandas: 1.00→50, 1.05→60, 1.10→70, 1.15→80, 1.20→90, 1.30+→100
const RATIO_SEGS: [number, number, number, number][] = [
  [-Infinity, 0.90, 0, 20], [0.90, 1.00, 20, 50], [1.00, 1.20, 50, 90],
  [1.20, 1.30, 90, 100], [1.30, Infinity, 100, 100],
];
function ratioRiskScore(r: number): number {
  return bandScore(RATIO_SEGS, r);
}
// CPI momentum: nivel del YoY (40%) + delta vs media 6M de YoY (60%).
// Un 3.5 acelerando desde 2 pesa más que un 7 cayendo desde 9.
const CPI_LVL_SEGS: [number, number, number, number][] = [
  [-Infinity, 1.0, 0, 10], [1.0, 1.5, 10, 25], [1.5, 2.0, 25, 40],
  [2.0, 2.5, 40, 55], [2.5, 3.0, 55, 70], [3.0, 4.0, 70, 85], [4.0, Infinity, 85, 100],
];
const CPI_TRD_SEGS: [number, number, number, number][] = [
  [-Infinity, -1.5, 0, 10], [-1.5, -0.5, 10, 30], [-0.5, 0.0, 30, 50],
  [0.0, 0.5, 50, 70], [0.5, 1.5, 70, 90], [1.5, Infinity, 90, 100],
];
function cpiMScore(yoy: number, ma: number): number {
  return 0.4 * bandScore(CPI_LVL_SEGS, yoy) + 0.6 * bandScore(CPI_TRD_SEGS, yoy - ma);
}
// Y2M (2Y Momentum): nivel del Treasury 2Y (40%) + delta vs MA6M (60%).
// El 2Y descuenta la política Fed meses antes del anuncio (sin su rezago).
const Y2M_LVL_SEGS: [number, number, number, number][] = [
  [-Infinity, 1.5, 0, 15], [1.5, 2.5, 15, 30], [2.5, 3.5, 30, 50],
  [3.5, 4.5, 50, 70], [4.5, 5.5, 70, 88], [5.5, Infinity, 88, 100],
];
const Y2M_TRD_SEGS: [number, number, number, number][] = [
  [-Infinity, -1.0, 0, 10], [-1.0, -0.4, 10, 30], [-0.4, 0.0, 30, 50],
  [0.0, 0.4, 50, 70], [0.4, 1.0, 70, 90], [1.0, Infinity, 90, 100],
];
// Y30M (30Y Momentum): mismo esquema que Y2M — nivel (40%) + delta vs MA6M (60%).
// Si los bonos se aceleran al alza, frenan economía y liquidez.
const Y30M_LVL_SEGS: [number, number, number, number][] = [
  [-Infinity, 2.0, 0, 15], [2.0, 3.0, 15, 30], [3.0, 3.5, 30, 50],
  [3.5, 4.0, 50, 70], [4.0, 5.0, 70, 88], [5.0, Infinity, 88, 100],
];
function y30mRiskScore(y: number, ma: number): number {
  return 0.4 * bandScore(Y30M_LVL_SEGS, y) + 0.6 * bandScore(Y2M_TRD_SEGS, y - ma);
}
// HY OAS (spread high-yield): a spread más amplio, más estrés crediticio = más riesgo
const HY_SEGS: [number, number, number, number][] = [
  [-Infinity, 3.0, 0, 12], [3.0, 3.5, 12, 25], [3.5, 4.0, 25, 38], [4.0, 5.0, 38, 55],
  [5.0, 6.5, 55, 68], [6.5, 8.0, 68, 80], [8.0, 11.0, 80, 90], [11.0, Infinity, 90, 100],
];
function hyRiskScore(v: number): number {
  return bandScore(HY_SEGS, v);
}
// Margen/PIB: a más apalancamiento, más riesgo de deleveraging
const MG_SEGS: [number, number, number, number][] = [
  [-Infinity, 2.0, 0, 20], [2.0, 3.0, 20, 50], [3.0, 4.0, 50, 70],
  [4.0, 4.5, 70, 85], [4.5, 5.0, 85, 100], [5.0, Infinity, 100, 100],
];
// MG momentum: nivel del ratio (40%) + desvío vs MA24M (60%).
const MG_TRD_SEGS: [number, number, number, number][] = [
  [-Infinity, -0.9, 0, 10], [-0.9, -0.5, 10, 30], [-0.5, -0.15, 30, 50],
  [-0.15, 0.15, 50, 50], [0.15, 0.5, 50, 70], [0.5, 0.9, 70, 90], [0.9, Infinity, 90, 100],
];

// VIX invertido y sensible: complacencia <20 puntúa alto, pánico ≥30 cae a 0 rápido
const VIX_SEGS: [number, number, number, number][] = [
  [-Infinity, 12, 90, 100], [12, 15, 78, 90], [15, 20, 60, 78], [20, 25, 35, 60], [25, 30, 10, 35], [30, Infinity, 0, 10],
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
// PIB real YoY procíclico (sobrecalentamiento): crecimiento muy fuerte = riesgo
// tardío de ciclo; recesión = score bajo (oportunidad, no frena la recompra).
const GDP_SEGS: [number, number, number, number][] = [
  [-Infinity, 0, 0, 10], [0, 1.0, 10, 25], [1.0, 2.0, 25, 45], [2.0, 3.0, 45, 70],
  [3.0, 4.0, 70, 90], [4.0, Infinity, 90, 100],
];
function gdpRiskScore(v: number): number {
  // Sin techo (espejo backend): el suelo da score bajo por construcción.
  return bandScore(GDP_SEGS, v);
}
// Color de semaforización (bandas unificadas en ./bhtBands).
export const capeScoreColor = bhtBandColor;
// Etiqueta visible del indicador (la clave interna RATIO se muestra como CAPE Ratio)
const partName = (k: string) => k === 'RATIO' ? 'CAPE Ratio' : k;
// Descripción breve por indicador para las tablas de detalle (hover + termómetro).
const partDesc: Record<string, string> = {
  CAPE: 'Valuación 10a', PE: 'Precio/Beneficio', FWD: 'PE estimado', RATIO: 'vs media 3a',
  CPI: 'Inflación', CORE: 'Inflación núcleo', Y2M: '2Y Momentum', '30Y': 'Momentum 30Y',
  HY: 'Crédito HY', MG: 'Apalancamiento', VIX: 'Volatilidad', FG: 'Sentimiento',
  MS: 'Vivienda', PIB: 'Crecimiento',
};
const partLabel = (k: string, loc = 'es') => partDesc[k] ? `${partName(k)} - (${levelLabel(partDesc[k], loc)})` : partName(k);
const capeBandLabel = (cape: number) => cape < 29 ? 'Barato' : cape < 35 ? 'Justo' : cape < 40 ? 'Caro' : cape < 43 ? 'Elevado' : 'Extremo';
const fwdBandLabel = (pe: number) => pe < 15 ? 'Barato' : pe < 19 ? 'Justo' : pe < 22 ? 'Caro' : pe < 24 ? 'Elevado' : 'Extremo';
// Bandas para el popover del orbe: [lo, hi, display, puntos, nivel]
const CAPE_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 29, '≤ 29', '0–25', 'Barato'], [29, 35, '29–35', '25–50', 'Justo'], [35, 40, '35–40', '50–70', 'Caro'], [40, 43, '40–43', '70–100', 'Elevado'], [43, Infinity, '≥ 43', '100', 'Extremo'],
];
const RATIO_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0.90, '≤ 0.90', '0–20', 'Barato'], [0.90, 1.00, '0.90–1.00', '20–50', 'Justo'], [1.00, 1.20, '1.00–1.20', '50–90', 'Caro'], [1.20, 1.30, '1.20–1.30', '90–100', 'Elevado'], [1.30, Infinity, '≥ 1.30', '100', 'Extremo'],
];
const ratioBandLabel = (r: number) => r < 0.90 ? 'Barato' : r < 1.00 ? 'Justo' : r < 1.20 ? 'Caro' : r < 1.30 ? 'Elevado' : 'Extremo';
const CPI_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.0, '≤ 1.0', '0–10', 'Muy baja'], [1.0, 1.5, '1.0–1.5', '10–25', 'Baja'], [1.5, 2.0, '1.5–2.0', '25–40', 'Rumbo a meta'], [2.0, 2.5, '2.0–2.5', '40–55', 'En meta'], [2.5, 3.0, '2.5–3.0', '55–70', 'Elevada'], [3.0, 4.0, '3.0–4.0', '70–85', 'Alta'], [4.0, Infinity, '≥ 4.0', '85–100', 'Extrema'],
];
// Etiqueta por puntaje combinado (nivel+tendencia de inflación).
const cpiBandLabel = (s: number) => s < 20 ? 'Controlada' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Presión' : 'Descontrol';
const Y2M_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.5, '≤ 1.5', '0–15', 'Muy bajo'], [1.5, 2.5, '1.5–2.5', '15–30', 'Bajo'], [2.5, 3.5, '2.5–3.5', '30–50', 'Moderado'], [3.5, 4.5, '3.5–4.5', '50–70', 'Neutral-alto'], [4.5, 5.5, '4.5–5.5', '70–88', 'Alto'], [5.5, Infinity, '≥ 5.5', '88–100', 'Extremo'],
];
// Etiqueta por puntaje combinado (nivel+tendencia), no solo por nivel.
const y2mBandLabel = (s: number) => s < 20 ? 'Easing descontado' : s < 40 ? 'Alivio en camino' : s < 60 ? 'Neutral' : s < 80 ? 'Endurecimiento' : 'Restricción acelerada';
const Y30_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 2.0, '≤ 2.0', '0–15', 'Suelo'], [2.0, 3.0, '2.0–3.0', '15–30', 'Baja'], [3.0, 3.5, '3.0–3.5', '30–50', 'Moderada'], [3.5, 4.0, '3.5–4.0', '50–70', 'Neutral-alta'], [4.0, 5.0, '4.0–5.0', '70–88', 'Alta'], [5.0, Infinity, '≥ 5.0', '88–100', 'Extrema'],
];
// Etiqueta por puntaje combinado (economía/liquidez), no solo por nivel.
const y30mBandLabel = (s: number) => s < 20 ? 'Liquidez holgada' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Restricción' : 'Freno severo';
const HY_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 3.0, '≤ 3.0', '0–12', 'Comprimido'], [3.0, 3.5, '3.0–3.5', '12–25', 'Ajustado'], [3.5, 4.0, '3.5–4.0', '25–38', 'Normal'], [4.0, 5.0, '4.0–5.0', '38–55', 'Elevándose'], [5.0, 6.5, '5.0–6.5', '55–68', 'Estrés'], [6.5, 8.0, '6.5–8.0', '68–80', 'Alto estrés'], [8.0, 11.0, '8.0–11', '80–90', 'Severo'], [11.0, Infinity, '≥ 11', '90–100', 'Extremo'],
];
const hyBandLabel = (v: number) => v < 3.0 ? 'Comprimido' : v < 3.5 ? 'Ajustado' : v < 4.0 ? 'Normal' : v < 5.0 ? 'Elevándose' : v < 6.5 ? 'Estrés' : v < 8.0 ? 'Alto estrés' : v < 11.0 ? 'Severo' : 'Extremo';
const MG_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 2.0, '≤ 2.0', '0–20', 'Bajo'], [2.0, 3.0, '2.0–3.0', '20–50', 'Normal'], [3.0, 4.0, '3.0–4.0', '50–70', 'Elevado'], [4.0, 4.5, '4.0–4.5', '70–85', 'Alto'], [4.5, 5.0, '4.5–5.0', '85–100', 'Muy alto'], [5.0, Infinity, '≥ 5.0', '100', 'Extremo'],
];
const mgBandLabel = (s: number) => s < 20 ? 'Desapalancamiento' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Tensión' : 'Euforia';
const GDP_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0, '< 0', '0–10', 'Recesión'], [0, 1.0, '0–1.0', '10–25', 'Estancado'], [1.0, 2.0, '1.0–2.0', '25–45', 'Desacelera'], [2.0, 3.0, '2.0–3.0', '45–70', 'Saludable'], [3.0, 4.0, '3.0–4.0', '70–90', 'Sólido'], [4.0, Infinity, '≥ 4.0', '90–100', 'Sobrecalentado'],
];
const MS_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 3.5, '≤ 3.5', '0–8', 'Escasez'], [3.5, 4.5, '3.5–4.5', '8–20', 'Ajustado'], [4.5, 5.5, '4.5–5.5', '20–35', 'Equilibrado'], [5.5, 6.5, '5.5–6.5', '35–50', 'Ampliándose'], [6.5, 7.5, '6.5–7.5', '50–62', 'Exceso'], [7.5, 9.0, '7.5–9.0', '62–74', 'Sobreoferta'], [9.0, 11.0, '9.0–11', '74–88', 'Muy frío'], [11.0, Infinity, '≥ 11', '88–100', 'Congelado'],
];
const VIX_BANDS: [number, number, string, string, string][] = [
  [30, Infinity, '≥ 30', '0–10', 'Pánico'], [25, 30, '25–30', '10–35', 'Miedo'], [20, 25, '20–25', '35–60', 'Inquietud'], [15, 20, '15–20', '60–78', 'Tensión'], [12, 15, '12–15', '78–90', 'Complacencia'], [-Infinity, 12, '< 12', '90–100', 'Euforia'],
];
// WTI ratio vs SMA36M (bandas validadas 2003-2026, espejo del bonus oil del semáforo)
const OIL_SEGS: [number, number, number, number][] = [
  [-Infinity, 0.70, 0, 15], [0.70, 0.90, 15, 35], [0.90, 1.20, 35, 65], [1.20, 1.45, 65, 85], [1.45, Infinity, 85, 100],
];
function oilRiskScore(ratio: number): number { return bandScore(OIL_SEGS, ratio); }
const OIL_BANDS: [number, number, string, string, string][] = [
  [1.45, Infinity, '≥ 1.45', '85–100', 'Shock'], [1.20, 1.45, '1.20–1.45', '65–85', 'Caro'], [0.90, 1.20, '0.90–1.20', '35–65', 'Neutral'], [0.70, 0.90, '0.70–0.90', '15–35', 'Barato'], [-Infinity, 0.70, '< 0.70', '0–15', 'Alivio'],
];
// Fear & Greed entra directo (ya es 0-100 en la misma dirección)
// Fear & Greed estirado (espejo backend): ≤10 => 0 y ≥80 => 100, centro intacto
const FG_SEGS: [number, number, number, number][] = [
  [-Infinity, 10, 0, 0], [10, 15, 0, 8], [15, 25, 8, 25], [25, 45, 25, 45],
  [45, 55, 45, 60], [55, 70, 60, 85], [70, 80, 85, 100], [80, Infinity, 100, 100],
];
function fgRiskScore(v: number): number {
  return bandScore(FG_SEGS, v);
}
const FG_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 10, '≤ 10', '0', 'Miedo Extremo'], [10, 15, '10–15', '0–8', 'Pánico'], [15, 25, '15–25', '8–25', 'Miedo'], [25, 45, '25–45', '25–45', 'Cautela'], [45, 55, '45–55', '45–60', 'Neutral'], [55, 70, '55–70', '60–85', 'Codicia'], [70, 80, '70–80', '85–100', 'Euforia'], [80, Infinity, '≥ 80', '100', 'Codicia Extrema'],
];
const FWD_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 15, '≤ 15', '0–25', 'Barato'], [15, 19, '15–19', '25–50', 'Justo'], [19, 22, '19–22', '50–80', 'Caro'], [22, 24, '22–24', '80–100', 'Elevado'], [24, Infinity, '≥ 24', '100', 'Extremo'],
];
// Orbe de cristal genérico con puntaje; click/hover muestra valor actual + tabla de ponderación.
type MomBlend = { level: number; levelScore: number; delta: number; ma: number; maLabel: string; trendScore: number } | null;
// Etiqueta de tendencia con color semáforo (alcista = riesgo, bajista = alivio).
function trendTag(d: number): { text: string; color: string } {
  const a = Math.abs(d);
  if (a < 0.1) return { text: 'Lateral', color: '#94a3b8' };
  const mag = a < 0.5 ? 'Leve' : a < 1.0 ? 'Elevada' : 'Extrema';
  const up = d > 0;
  const color = mag === 'Leve' ? (up ? '#eab308' : '#84cc36') : mag === 'Elevada' ? (up ? '#f97316' : '#34d399') : (up ? '#ef4444' : '#22c55e');
  return { text: `${up ? 'Alcista' : 'Bajista'} ${mag}`, color };
}
// Desglose nivel+tendencia para indicadores momentum (la tendencia pesa más).
function momBlend(lvlSegs: [number, number, number, number][], trdSegs: [number, number, number, number][], y: number, ma: number, maLabel = 'MA6M'): Exclude<MomBlend, null> {
  const levelScore = bandScore(lvlSegs, y);
  const trendScore = bandScore(trdSegs, y - ma);
  return { level: y, levelScore, delta: y - ma, ma, maLabel, trendScore };
}
// Tabla de historia (12 meses + hace 2 y 3 años) con rendimiento a hoy y pico; la usan los orbes y el detalle del BHT.
function OrbHistoryTable({ rows: histRows, loading, valueHeader, dec = 2, showValue = true }: { rows: OrbHistoryRow[]; loading: boolean; valueHeader: string; dec?: number; showValue?: boolean }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  return (
    <>
              {loading ? <div className="text-[10px] text-slate-500 font-mono">{ti('historyLoading')}</div>
                : histRows.length === 0 ? <div className="text-[10px] text-slate-500 font-mono">{ti('historyEmpty')}</div>
                : (
                  <table className="w-full text-[10px] font-mono tabular-nums">
                    <thead>
                      <tr className="text-slate-500">
                        <th colSpan={showValue ? 3 : 2} />
                        <th colSpan={3} className="text-center font-normal pb-0.5 border-b border-slate-700/70">{ti('historyPerfToday')}</th>
                        <th className="w-3" />
                        <th colSpan={3} className="text-center font-normal pb-0.5 border-b border-slate-700/70">{ti('historyPeak')}</th>
                      </tr>
                      <tr className="text-slate-500">
                        <th className="text-left font-normal py-0.5">{ti('historyMonth')}</th>
                        {showValue && <th className="text-right font-normal">{valueHeader}</th>}
                        <th className="text-right font-normal pr-2">{ti('historyScore')}</th>
                        <th className="text-right font-normal text-sky-300/80">S&amp;P 500</th>
                        <th className="text-right font-normal text-violet-300/80">Nasdaq</th>
                        <th className="text-right font-normal text-pink-300/80">TQQQ</th>
                        <th />
                        <th className="text-right font-normal text-sky-300/80">S&amp;P 500</th>
                        <th className="text-right font-normal text-violet-300/80">Nasdaq</th>
                        <th className="text-right font-normal text-pink-300/80">TQQQ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histRows.map((r, i) => {
                        const first = r.yearsAgo != null && (i === 0 || histRows[i - 1].yearsAgo == null);
                        const pk = (v: { pct: number; date: string } | null) => (
                          <td className="text-right align-top py-0.5 whitespace-nowrap">
                            {v == null ? <span className="text-slate-600">—</span> : <>
                              <div className="text-emerald-300">+{v.pct.toFixed(1)}%</div>
                              <div className="text-[9px] text-slate-500">{shortDate(v.date, loc)}</div>
                            </>}
                          </td>
                        );
                        const pc = (v: number | null) => <td className={`text-right ${v == null ? 'text-slate-600' : v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}</td>;
                        return (
                          <tr key={r.month} className={`text-slate-300 ${first ? 'border-t border-slate-600' : ''} ${i === 0 ? 'bg-slate-700/40' : ''}`} title={r.date}>
                            <td className="py-0.5 whitespace-nowrap capitalize">{monthLabel(r.month, loc)}{r.yearsAgo != null && <span className="text-slate-500 normal-case"> · {ti('historyYearsAgo', { n: r.yearsAgo })}</span>}</td>
                            {showValue && <td className="text-right">{r.value != null ? r.value.toFixed(dec) : '—'}</td>}
                            <td className="text-right font-bold pr-2" style={{ color: r.score != null ? capeScoreColor(r.score) : undefined }}>{r.score != null ? Math.round(r.score) : '—'}</td>
                            {pc(r.perf.spx)}{pc(r.perf.ndx)}{pc(r.perf.tqqq)}
                            <td />
                            {pk(r.peak.spx)}{pk(r.peak.ndx)}{pk(r.peak.tqqq)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
    </>
  );
}

/** Historia mensual compartida (una petición para todos los orbes y el detalle del BHT). */
function useThermoPartsMonthly(enabled: boolean) {
  return useQuery({
    // v4: respuesta con bht, perf, peak y filas de 2/3 años; la versión evita reutilizar una caché con otra forma.
    queryKey: ['thermo-parts-monthly', 12, 'v4'],
    queryFn: async (): Promise<MonthlyParts[]> => {
      const r = await fetch(`${getApiBase()}/api/backtesting/thermo-parts-monthly?months=12`);
      if (!r.ok) throw new Error(`thermo-parts-monthly ${r.status}`);
      return r.json();
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
}

// Historia del BHT Index arriba del detalle del cálculo (mismas columnas que el popover de los orbes).
function BhtHistoryBlock() {
  const ti = useTranslations('Backtesting.indicators');
  const hist = useThermoPartsMonthly(true);
  return (
    <div className="mt-2 rounded-lg border border-slate-800 p-3 overflow-x-auto">
      <div className="text-xs font-semibold text-slate-100 mb-1.5">{ti('bhtHistoryTitle')}</div>
      <OrbHistoryTable rows={bhtHistoryRows(hist.data)} loading={hist.isLoading} valueHeader="BHT" dec={1} showValue={false} />
      <div className="text-[9px] text-slate-500 mt-1.5">{ti('bhtHistoryNote')}</div>
    </div>
  );
}

function ScoreOrb({ name, value, dec = 2, weight, score, bands, blend = null, small = false }: { name: string; value: number; dec?: number; weight: number; score: number; bands: [number, number, string, string, string][]; blend?: MomBlend; small?: boolean }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const c = capeScoreColor(score);
  const hasHistory = name in ORB_PART_KEY;
  const popRef = useRef<HTMLDivElement>(null);
  // Popover en posición fija, acotado a la pantalla (con historia es muy ancho y alto).
  // Horizontal: alineado al borde derecho del orbe. Vertical: abajo si cabe, arriba si cabe;
  // si no cabe en ninguno, se recorre para entrar completo (puede tapar el orbe).
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(vw * 0.96, hasHistory ? 1120 : 288);
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const h = Math.min(popRef.current?.scrollHeight ?? 0, vh - 16);
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = r.top - 6 - h >= 8 ? r.top - 6 - h : Math.max(8, vh - 8 - h);
    setPos({ left, top, maxH: vh - 16 });
  };
  const show = () => { setOpen(true); place(); };
  // Historia: una sola petición compartida por todos los orbes, al abrir el primero.
  const hist = useThermoPartsMonthly(open && hasHistory);
  const histRows = orbHistoryRows(hist.data, name);
  // Al abrir (o al llegar la historia) se mide la altura real y se recoloca.
  useLayoutEffect(() => { if (open) place(); }, [open, hist.data, hist.isLoading]);
  return (
    <span className="relative inline-flex" onMouseLeave={() => setOpen(false)}>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : show())} onMouseEnter={() => { if (!open) show(); }} title={ti('orbTitle', { name, score })}
        className={`relative rounded-full cursor-pointer shrink-0 ${small ? 'w-7 h-7' : 'w-11 h-11'}`}
        style={{ background: `radial-gradient(circle at 30% 18%, rgba(255,255,255,.55), rgba(255,255,255,.08) 30%, transparent 48%), linear-gradient(145deg, ${c}dd, ${c}55)`, boxShadow: `0 0 14px ${c}77, inset 0 0 8px rgba(255,255,255,.3)`, border: `1px solid ${c}` }}>
        <span className={`absolute inset-0 flex items-center justify-center font-mono font-extrabold text-slate-950 ${small ? 'text-[10px]' : 'text-[13px]'}`} style={{ textShadow: '0 0 4px rgba(255,255,255,.95), 0 0 2px rgba(255,255,255,.9), 0 1px 1px rgba(255,255,255,.6)' }}>{score}</span>
      </button>
      {open && (
        <div ref={popRef} style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxH } : { visibility: 'hidden' }} className={`fixed z-50 overflow-y-auto p-3 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl text-left normal-case flex flex-col md:flex-row gap-4 ${hasHistory ? 'w-[min(96vw,1120px)]' : 'w-72'}`}>
          <div className="w-full md:w-64 shrink-0">
          <div className="text-xs font-semibold text-slate-100">{ti('orbRisk', { name })} <span className="font-mono" style={{ color: c }}>{score}/100</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{name} {value.toFixed(dec)} → <span className="text-sky-300 font-semibold">{score}/100</span> · {ti('orbWeight', { weight })}</div>
          {blend && (
            <div className="mt-1.5 rounded-lg bg-slate-900/70 border border-slate-700/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
              <div className="text-slate-300">{ti('colLevel')} {blend.level.toFixed(2)} → {blend.levelScore.toFixed(1)} <span className="text-slate-500">×0.4</span></div>
              <div className="text-slate-300">Δ {blend.delta>=0?'+':''}{blend.delta.toFixed(2)}pp vs {blend.maLabel} {blend.ma.toFixed(2)} → {blend.trendScore.toFixed(1)} <span className="text-slate-500">×0.6</span>{(()=>{ const t = trendTag(blend.delta); return <span className="font-bold"> · <span style={{ color: t.color }}>{t.text}</span></span>; })()}</div>
              <div className="text-slate-100">= <span className="font-bold" style={{ color: capeScoreColor(score) }}>{score}</span> <span className="text-slate-500">{ti('trendWeighs')}</span></div>
            </div>
          )}
          <table className="w-full mt-2 text-[10px] font-mono">
            <thead><tr className="text-slate-500"><th className="text-left font-normal py-0.5">{name}</th><th className="text-right font-normal">Pts</th><th className="text-right font-normal">{ti('colLevel')}</th></tr></thead>
            <tbody>
              {bands.map(([lo, hi, disp, pts, lvl]) => {
                const on = value >= lo && value < hi;
                return <tr key={disp} className={on ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400'}><td className="py-0.5">{disp}</td><td className="text-right">{pts}</td><td className="text-right">{levelLabel(lvl, loc)}</td></tr>;
              })}
            </tbody>
          </table>
          </div>
          {hasHistory && (
            <div className="flex-1 min-w-0 md:border-l md:border-slate-700/70 md:pl-4 border-t md:border-t-0 border-slate-700/70 pt-2 md:pt-0">
              <div className="text-xs font-semibold text-slate-100 mb-1.5">{ti('historyTitle')}</div>
              <OrbHistoryTable rows={histRows} loading={hist.isLoading} valueHeader={name} dec={dec} />
              <div className="text-[9px] text-slate-500 mt-1.5">{ti('historyNote')}</div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// Hover compartido del BHT Index: detalle por indicador igual al termómetro.
// El cierre es diferido (gracia de 350ms) para poder mover el mouse al popup
// y pulsar el botón Estrategia sin que se cierre en el camino.
export type BhtHoverState = null | { d: string; x: number; y: number };
export function useBhtDetail() {
  const [hover, setHover] = useState<BhtHoverState>(null);
  const [cache, setCache] = useState<Record<string, any>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClear = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const scheduleClear = useCallback(() => { cancelClear(); timer.current = setTimeout(() => setHover(null), 350); }, [cancelClear]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const setHoverLive = useCallback((v: BhtHoverState | ((s: BhtHoverState) => BhtHoverState)) => { if (v != null) cancelClear(); setHover(v); }, [cancelClear]);
  const load = (d: string) => {
    if (cache[d]) return;
    fetch(`${getApiBase()}/api/backtesting/bht-forward/detail?date=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) setCache((m) => ({ ...m, [d]: j })); })
      .catch(() => {});
  };
  return { hover, setHover: setHoverLive, cache, load, scheduleClear, cancelClear };
}

// Al salir el mouse hacia el popup no se cierra (permite pulsar Estrategia);
// al salir fuera, cierre diferido.
export const bhtLeaveGuard = (e: any, det: { scheduleClear: () => void; cancelClear: () => void }) => {
  if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('[data-bht-pop]')) det.cancelClear();
  else det.scheduleClear();
};

export function BhtDetailPopover({ hover, detail, forward, onLeave, onHold, liveValue }: { hover: { d: string; x: number; y: number }; detail: any; forward?: any; onLeave: () => void; onHold?: () => void; liveValue?: number | null }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const left = Math.min(Math.max(8, hover.x + 12), (typeof window !== 'undefined' ? window.innerWidth - 540 : 1000));
  // A la derecha y debajo del cursor para no tapar el punto observado; si no cabe
  // abajo, se voltea arriba del cursor.
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const below = hover.y + 16;
  const top = below > winH - 560 ? Math.max(8, hover.y - 560) : Math.max(8, below);
  const half = detail != null ? Math.ceil(detail.parts.length / 2) : 0;
  const bd = detail != null ? bhtBand(Number(detail.value)) : null;
  const headV = liveValue ?? (detail != null ? Number(detail.value) : null);
  const loadMsg = liveValue != null ? 'Detalle en cálculo (se guarda al cierre)...' : 'Cargando detalle...';
  const [showStrat, setShowStrat] = useState(false);
  useEffect(() => { setShowStrat(false); }, [hover.d]);
  return (
    <div data-bht-pop className="fixed z-[9999] w-[520px] max-w-[calc(100vw-16px)] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-relaxed text-slate-200 text-left pointer-events-none" style={{ left, top }} onMouseEnter={() => onHold?.()} onMouseLeave={onLeave}>
      <div className="font-bold mb-1.5"><span className="text-sky-300">{hover.d}</span> <span className="text-slate-100">· BHT</span> {headV != null && <span className="font-mono" style={{ color: capeScoreColor(headV) }}>{headV.toFixed(1)}/100</span>}{liveValue != null && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-teal-500/20 text-teal-300 font-bold" title={ti('liveTitle')}>{ti('live')}</span>}{bd && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowStrat((v) => !v); }}
          className="ml-2 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900 align-middle cursor-pointer pointer-events-auto"
          style={{ backgroundColor: bd.color }}>Estrategia {showStrat ? '▾' : '▸'}</button>
      )}</div>
      {showStrat && bd && (
        <div className="mt-1 mb-1.5 p-2 rounded-lg border" style={{ borderColor: `${bd.color}66`, backgroundColor: `${bd.color}14` }}>
          <div className="font-bold mb-0.5" style={{ color: bd.color }}>{ti('strategyBand', { label: ti(`bht.b${BHT_BANDS.indexOf(bd)}.label`) })}</div>
          <div className="text-slate-200 font-normal leading-snug">{ti(`bht.b${BHT_BANDS.indexOf(bd)}.advice`)}</div>
        </div>
      )}
      {detail == null ? <div className="text-slate-500 font-mono">{loadMsg}</div> : (
        <>
          <div className="flex gap-3">
            {[0, 1].map((col) => (
              <table key={col} className="flex-1 font-mono text-[11px]">
                <thead><tr className="text-slate-500"><th className="text-left font-normal py-0.5">Ind</th><th className="text-right font-normal">{ti('colValue')}</th><th className="text-right font-normal">Pts</th><th className="text-right font-normal">{ti('colContribution')}</th></tr></thead>
                <tbody>
                  {detail.parts.slice(col * half, (col + 1) * half).map((p: any) => {
                    const dec = p.key === 'RATIO' ? 3 : p.key === 'FG' ? 0 : p.key === 'MS' ? 1 : 2;
                    return <tr key={p.key} className="border-t border-slate-800/60"><td className="py-px pr-1 text-slate-300 text-[10px] whitespace-nowrap">{partLabel(p.key, loc)}</td><td className="text-right">{Number(p.value).toFixed(dec)}</td><td className="text-right" style={{ color: capeScoreColor(p.score) }}>{Math.round(p.score)}</td><td className="text-right text-slate-100">{Number(p.aporte).toFixed(1)}</td></tr>;
                  })}
                </tbody>
              </table>
            ))}
          </div>
          {(detail.bonus ?? 0) > 0 && <div className="font-mono text-[11px] mt-1.5 text-orange-300">{ti('hyBonusDetail', { label: detail.bonusLabel ?? '', n: Number(detail.bonus).toFixed(0) })}</div>}
          {(detail.liqBonus ?? 0) !== 0 && <div className={`font-mono text-[11px] mt-1 ${Number(detail.liqBonus) > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>Bonus liquidez M2/M0 ({detail.liqBonusLabel ?? ''}): {Number(detail.liqBonus) > 0 ? '+' : ''}{Number(detail.liqBonus).toFixed(0)} (fuera del promedio){detail.liqYoy != null && <> · M2 +{Number(detail.liqYoy).toFixed(1)}%{detail.liqM0d3 != null && <> · M0 Δ3M {Number(detail.liqM0d3) >= 0 ? '+' : ''}{Number(detail.liqM0d3).toFixed(1)}%</>}{detail.liqDrop != null && Number(detail.liqDrop) >= 50 && <> · −{Number(detail.liqDrop).toFixed(0)}% del pico</>}</>}</div>}
          {(detail.oilBonus ?? 0) !== 0 && <div className={`font-mono text-[11px] mt-1 ${Number(detail.oilBonus) > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>Bonus petróleo WTI ({detail.oilBonusLabel ?? ''}): {Number(detail.oilBonus) > 0 ? '+' : ''}{Number(detail.oilBonus).toFixed(0)} (fuera del promedio){detail.oilPrice != null && <> · ${Number(detail.oilPrice).toFixed(2)}{detail.oilRatio != null && <> · ×{Number(detail.oilRatio).toFixed(2)} SMA36M</>}</>}</div>}
          {(detail.bonus ?? 0) > 0 && detail.bonusHy != null && (
            <div className="font-mono text-[11px] mt-1 text-slate-400">
              HY {Number(detail.bonusHy).toFixed(2)}{detail.bonusD1 != null && <> · 1M-atrás {(Number(detail.bonusHy) - Number(detail.bonusD1)).toFixed(2)} · Δ1M {Number(detail.bonusD1) >= 0 ? '+' : ''}{Number(detail.bonusD1).toFixed(2)} (gatillo {'≥'} +1.00)</>}{detail.bonusZ != null && detail.bonusSigma != null && <> · Δ3M {(Number(detail.bonusZ) * Number(detail.bonusSigma)).toFixed(2)} · σ24 {Number(detail.bonusSigma).toFixed(2)} → z {Number(detail.bonusZ) >= 0 ? '+' : ''}{Number(detail.bonusZ).toFixed(1)}σ (gatillo z{'>'}1.5, HY{'>'}5)</>}{detail.bonusFed != null && <> · Fed {Number(detail.bonusFed).toFixed(2)} rescate→tope +5</>}
            </div>
          )}
          <div className="font-mono text-[11px] text-slate-400 mt-1.5">Σ {Number(detail.numerator).toFixed(1)} ÷ {detail.denominator}{(detail.bonus ?? 0) > 0 ? ` + ${Number(detail.bonus).toFixed(0)}` : ''}{(detail.liqBonus ?? 0) !== 0 ? ` ${Number(detail.liqBonus) > 0 ? '+' : ''}${Number(detail.liqBonus).toFixed(0)}` : ''}{(detail.oilBonus ?? 0) !== 0 ? ` ${Number(detail.oilBonus) > 0 ? '+' : ''}${Number(detail.oilBonus).toFixed(0)}` : ''} = <span className="text-slate-100 font-bold">{Number(detail.value).toFixed(1)}</span> · {detail.coverage}/13</div>
          {forward && (
            <div className="mt-2 border-t border-slate-800 pt-1.5">
              <div className="text-slate-400 mb-1">Si comprabas el {hover.d}</div>
              {(() => {
                const keys = ['spx', 'ndx', 'tqqq'];
                const matureY = [1, 2, 3, 5].filter((y) => keys.some((k) => forward[`${k}${y}y`] != null));
                const showHoy = keys.some((k) => [1, 2, 3, 5].some((y) => forward[`${k}${y}y`] == null)) && keys.some((k) => forward[`${k}Tt`] != null);
                const lineColor: Record<string, string> = { spx: '#38bdf8', ndx: '#a78bfa', tqqq: '#f472b6' };
                const fmtFull = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
                const base = (k: string) => forward[k] != null ? Number(forward[k]) : null;
                const nomCell = (key: string | number, k: string, pct: number | null, title: string, prefix = '') => {
                  if (pct == null) return <td key={key} className="text-right text-slate-600">—</td>;
                  const v = Number(pct);
                  const b = base(k);
                  const nom = b != null ? fmtFull(b * (1 + v / 100)) : null;
                  return <td key={key} className="text-right" title={title}>
                    <div style={{ color: v >= 0 ? '#84cc36' : '#f87171' }}>{prefix}{v >= 0 ? '▲ ' : '▼ '}{Math.abs(v).toFixed(1)}%</div>
                    {nom != null && <div className="text-[10px]" style={{ color: lineColor[k], opacity: 0.8 }}>{nom}</div>}
                  </td>;
                };
                return (
                  <table className="w-full font-mono text-[11px]">
                    <thead><tr className="text-slate-500"><th className="text-left font-normal py-0.5"></th>{matureY.map((y) => <th key={y} className="text-right font-normal">{y}Y</th>)}{showHoy && <th className="text-right font-normal" title={ti('partialTitle')}>{ti('today')}</th>}</tr></thead>
                    <tbody>
                      {([['SPX', 'spx'], ['NDX', 'ndx'], ['TQQQ', 'tqqq']] as const).map(([label, k]) => (
                        <tr key={k} className="border-t border-slate-800/60">
                          <td className="py-0.5 font-bold" style={{ color: lineColor[k] }}>{label}
                            {base(k) != null && <div className="text-[10px] font-normal" style={{ opacity: 0.8 }}>{fmtFull(base(k)!)}</div>}
                          </td>
                          {matureY.map((y) => nomCell(y, k, forward[`${k}${y}y`], `${label} ${y}Y desde ${hover.d}: nominal entonces → nominal +${y}a`))}
                          {showHoy && nomCell('hoy', k, forward[`${k}Tt`], `${label} a hoy (parcial, horizonte no maduro)`, '~ ')}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )})()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Tabla BHT Forward: BHT Index + precios y retornos forward maduros 1/2/3/5Y.
// Solo pinta horizontes con fecha objetivo ya cumplida (el resto es '—').
function BhtForwardTable({ live }: { live: { current: { v: number | null; d: string | null } } }) {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const liveBht = live.current.v;
  const [rows, setRows] = useState<any[]>([]);
  const [view, setView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Estándar de tablas: scroll infinito (ver tabla CAPE). Sin botón "Ver más".
  const [visibleCount, setVisibleCount] = useState(60);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null) as any;
  const bhtDet = useBhtDetail();
  const loadRows = useCallback(async () => {
    try {
      const r = await fetch(`${getApiBase()}/api/backtesting/bht-forward?from=1993-01-01`, { cache: 'no-store' });
      if (r.ok) setRows(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    loadRows();
    const onSync = () => loadRows();
    window.addEventListener('bht:synced', onSync);
    return () => window.removeEventListener('bht:synced', onSync);
  }, [loadRows]);
  useEffect(() => { setVisibleCount(60); setSortCol('date'); setSortDir('desc'); }, [view]);
  // Scroll infinito: al acercarse al fondo (+60 filas). Sentinela como fallback.
  useEffect(() => {
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((prev: number) => Math.min(prev + 60, 10000));
    }, { threshold: 0.1 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, view, rows.length, sortCol, sortDir]);
  if (!rows.length) return null;
  let list = rows;
  if (view === 'monthly') { const m = new Map<string, any>(); for (const r of rows) m.set((r.date || '').slice(0, 7), r); list = Array.from(m.values()); }
  if (view === 'yearly') { const m = new Map<string, any>(); for (const r of rows) m.set((r.date || '').slice(0, 4), r); list = Array.from(m.values()); }
  const maxDate = list.reduce((mm: any, r: any) => r.date > mm ? r.date : mm, list[0].date);
  const sorted = [...list].sort((a: any, b: any) => {
    if (sortCol === 'date') return sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    const av = a[sortCol] ?? -Infinity, bv = b[sortCol] ?? -Infinity;
    if (av === bv) return b.date.localeCompare(a.date);
    return sortDir === 'desc' ? bv - av : av - bv;
  });
  const cols: { k: string; label: string; cls: string }[] = [
    { k: 'date', label: view === 'monthly' ? 'Mes' : view === 'yearly' ? 'Año' : 'Fecha', cls: 'text-left w-[92px] min-w-[92px] max-w-[92px] sticky left-0 bg-slate-900 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.3)]' },
    { k: 'bhtValue', label: 'BHT', cls: 'text-right' },
    { k: 'spx', label: 'SP500', cls: 'text-right text-sky-300' },
    { k: 'ndx', label: 'Nasdaq', cls: 'text-right text-sky-300' },
    { k: 'tqqq', label: 'TQQQ', cls: 'text-right text-sky-300' },
    ...['spx', 'ndx', 'tqqq'].flatMap((p) => [1, 2, 3, 5].map((y) => ({ k: `${p}${y}y`, label: `${p.toUpperCase()} ${y}Y`, cls: 'text-right' }))),
  ];
  const retTd = (v: number | null, key: string) => v == null
    ? <td key={key} className="p-2 text-right font-mono text-slate-600 whitespace-nowrap">—</td>
    : <td key={key} className={`p-2 text-right font-mono font-semibold whitespace-nowrap rounded ${v >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>{v >= 0 ? '▲ ' : '▼ '}{Math.abs(v).toFixed(1)}%</td>;
  const toggle = (k: string) => {
    if (sortCol === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(k); setSortDir('desc'); }
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-slate-100">{ti('fwdTitle')}</h3>
        <div className="flex items-center gap-1">
          {(['daily', 'monthly', 'yearly'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${view === v ? 'bg-slate-700 text-teal-300 border border-slate-600' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'daily' ? 'Daily' : v === 'monthly' ? 'Monthly' : 'Yearly'}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} onScroll={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
              setVisibleCount((prev) => Math.min(prev + 60, 10000));
            }
          }} className="overflow-x-auto overflow-y-auto max-h-[484px] border border-slate-900 rounded-xl custom-scrollbar">
        <table className="w-full text-xs relative">
          <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-900 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
            <tr>
              {cols.map((col) => (
                <th key={col.k} onClick={() => toggle(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-teal-300 ${sortCol === col.k ? 'text-teal-300' : ''}`}>
                  {col.label} <span className="text-[10px]">{sortCol === col.k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
            {sorted.slice(0, visibleCount).map((r: any, idx: number) => {
              const d = (r.date || '').slice(0, 10);
              const isCurrent = sortCol === 'date' && sortDir === 'desc' && r.date === maxDate;
              const isLast = idx === Math.min(visibleCount, sorted.length) - 1 && visibleCount < sorted.length;
              return (
                <tr key={r.date} ref={isLast ? sentinelRef : null} className={`${isCurrent ? 'bg-teal-500/[0.08] border-l-2 border-l-teal-500 ring-1 ring-teal-500/15' : 'hover:bg-slate-900/40'} transition-colors`}>
                  <td className={`p-1.5 px-2 font-mono whitespace-nowrap w-[92px] min-w-[92px] max-w-[92px] align-top sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.25)] ${isCurrent ? 'bg-slate-900' : 'bg-slate-950 group-hover:bg-slate-900'}`}><div className="flex flex-col items-start leading-none gap-0.5"><span className={`${isCurrent ? 'text-teal-300 font-bold' : 'text-slate-200'} text-xs`}>{view === 'yearly' ? d.slice(0, 4) : view === 'monthly' ? d.slice(0, 7) : d}</span>{isCurrent && <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500 text-white font-bold leading-none">Actual</span>}</div></td>
                  {(() => { const isLive = isCurrent && liveBht != null; const v = isLive ? liveBht : r.bhtValue; if (v == null) return <td className="p-2 text-right font-mono text-slate-600 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono font-semibold whitespace-nowrap cursor-help" style={{ color: capeScoreColor(v) }} onMouseEnter={(e) => { bhtDet.setHover({ d, x: e.clientX, y: e.clientY }); bhtDet.load(d); }} onMouseMove={(e) => bhtDet.setHover((s) => s && s.d === d ? { ...s, x: e.clientX, y: e.clientY } : s)} onMouseLeave={(e) => bhtLeaveGuard(e, bhtDet)}><span className="border-b border-dotted border-slate-400/40" title={isLive ? 'En vivo (igual que el semáforo)' : undefined}>{Number(v).toFixed(1)}{isLive && <span className="text-teal-300"> •</span>}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.spx != null ? `$${Number(r.spx).toFixed(2)}` : '—'}</td>
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.ndx != null ? `$${Number(r.ndx).toFixed(2)}` : '—'}</td>
                  <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">{r.tqqq != null ? `$${Number(r.tqqq).toFixed(2)}` : '—'}</td>
                  {['spx', 'ndx', 'tqqq'].flatMap((p) => [1, 2, 3, 5].map((y) => retTd(r[`${p}${y}y`], `${p}${y}`)))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">{ti('fwdFoot', { shown: Math.min(visibleCount, sorted.length), total: sorted.length, days: rows.length })}{visibleCount < sorted.length ? ti('fwdMore') : ''}</p>
      {bhtDet.hover && <BhtDetailPopover hover={bhtDet.hover} detail={bhtDet.cache[bhtDet.hover.d]} forward={rows.find((r) => r.date === bhtDet.hover!.d)} onLeave={() => bhtDet.scheduleClear()} onHold={() => bhtDet.cancelClear()} liveValue={(sortCol === 'date' && sortDir === 'desc' && bhtDet.hover.d === maxDate && liveBht != null) ? liveBht : null} />}
    </div>
  );
}

const NAME_KEYS = ["fed_rate", "DGS2", "DGS10", "DGS30", "BAMLH0A0HYM2", "BAMLH0A0HYM2EY", "DFEDTARU", "CPIAUCSL", "CPILFESL", "M2SL", "BOGMBASE", "DCOILWTICO", "GDP", "GDPC1", "FINRA_DEBIT", "MARGIN_GDP", "MSACSR", "VIXCLS", "FEAR_GREED", "^GSPC", "^IXIC", "TQQQ", "QQQ", "SPY", "VOO", "SCHD", "JEPQ", "SQQQ", "SPX_ADV_VOL", "SPX_DEC_VOL", "NYSE_ADV_VOL", "NYSE_DEC_VOL", "NSDQ_ADV_VOL", "NSDQ_DEC_VOL"];
const TIP_KEYS = ["schiller_pe", "pe_ratio", "fwd_pe_ratio", "inflation", "core_inflation", "fed_rate", "treasury_30y", "vix", "fear_greed", "^GSPC", "^IXIC", "TQQQ", "QQQ", "SPY", "VOO", "SCHD", "JEPQ", "SQQQ", "DFEDTARU", "DGS2", "DGS10", "DGS30", "CPIAUCSL", "M2SL", "BOGMBASE", "DCOILWTICO", "CPILFESL", "BAMLH0A0HYM2", "BAMLH0A0HYM2EY", "GDP", "GDPC1", "FINRA_DEBIT", "MARGIN_GDP", "MSACSR", "VIXCLS", "FEAR_GREED", "NYSE_ADV_VOL", "NYSE_DEC_VOL", "NSDQ_ADV_VOL", "NSDQ_DEC_VOL", "SPX_ADV_VOL", "SPX_DEC_VOL"];

export function IndicatorsPanel() {
  const ti = useTranslations('Backtesting.indicators');
  const loc = useLocale();
  const [indicators, setIndicators] = useState<any[]>([]);
  const [cape, setCape] = useState<any[]>([]);
  const [capeView, setCapeView] = useState<'daily'|'monthly'|'yearly'>('daily');
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);
  const [thermoView, setThermoView] = useState<'overview' | 'timeline' | 'stats'>('overview');
  const [markets, setMarkets] = useState<Record<string, number | null>>({});
  const [marketHistory, setMarketHistory] = useState<Record<string, Map<string, number>>>({});
  // Filas de la tabla CAPE: serie CAPE o, si falta, días hábiles del SP500 (ver lib/capeTableRows).
  const capeRows: any[] = useMemo(() => buildCapeTableRows(cape, marketHistory['^GSPC']?.keys()), [cape, marketHistory]);
  const [volHistory, setVolHistory] = useState<Record<string, Map<string, number>>>({});
  const [thermoHist, setThermoHist] = useState<Record<string, { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string }>>({});
  const capeBhtDet = useBhtDetail();
  const liveBhtRef = useRef<{ v: number | null; d: string | null }>({ v: null, d: null });
  const [capeFwdCache, setCapeFwdCache] = useState<Record<string, any>>({});
  const loadCapeFwd = (d: string) => {
    if (capeFwdCache[d] !== undefined) return;
    setCapeFwdCache((m) => ({ ...m, [d]: null }));
    const from = new Date(d); from.setDate(from.getDate() - 7);
    fetch(`${getApiBase()}/api/backtesting/bht-forward?from=${from.toISOString().slice(0, 10)}&to=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCapeFwdCache((m) => ({ ...m, [d]: rows.length ? rows[rows.length - 1] : null })))
      .catch(() => {});
  };
  const [loading, setLoading] = useState(true);
  const tSync = useTranslations('Backtesting.regimes');
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const marketSync = useMarketSyncStream(async () => {
    // Tras la extracción, la caché live de react-query (1h FRED / 5-30min mercado)
    // seguiría sirviendo valores viejos en fila actual, cards y termómetro.
    // Invalidarla obliga a releer del backend sin recargar la página.
    await queryClient.invalidateQueries({ queryKey: ['live'] });
    await loadAll();
    window.dispatchEvent(new CustomEvent('bht:synced'));
  });
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
  const liveM2 = useLiveTicker('M2SL');
  const liveM0 = useLiveTicker('BOGMBASE');
  const liveOil = useLiveTicker('DCOILWTICO');
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
  const thermoLiveQ = useThermoLive();
  const liveMap: Record<string, any> = { '^GSPC': liveGspc, '^IXIC': liveIxic, 'TQQQ': liveTqqq, 'CPIAUCSL': liveCpi, 'CPILFESL': liveCore, 'M2SL': liveM2, 'BOGMBASE': liveM0, 'DCOILWTICO': liveOil, 'DFEDTARU': liveFed, 'DGS2': live2y, 'DGS10': live10y, 'DGS30': live30y, 'BAMLH0A0HYM2': liveHyOas, 'BAMLH0A0HYM2EY': liveHyEy, 'GDP': liveGdp, 'GDPC1': liveGdpc1, 'FINRA_DEBIT': liveFinra, 'MSACSR': liveMsacsr, 'VIXCLS': liveVix, 'FEAR_GREED': liveFg, 'NYSE_ADV_VOL': liveNyAdv, 'NYSE_DEC_VOL': liveNyDec, 'NSDQ_ADV_VOL': liveNqAdv, 'NSDQ_DEC_VOL': liveNqDec, 'SPX_ADV_VOL': liveSxAdv, 'SPX_DEC_VOL': liveSxDec };
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
  function getMarginGdpMa24(isoDate: string, n = 24, minReal = 6): number | null {
    // MA del ratio mensual; antes de 1999 promedia lo disponible de la época.
    if (!isValidIsoDate(isoDate)) return null;
    const vals: number[] = [];
    const base = new Date(isoDate.slice(0, 10));
    for (let k=0;k<40 && vals.length<n;k++){
      const e = new Date(base.getFullYear(), base.getMonth()-k+1, 0);
      const ek = e.toISOString().slice(0,10);
      if (ek > isoDate.slice(0,10)) continue;
      const finra = getRecentPrice(marketHistory['FINRA_DEBIT'], ek, 45);
      const gdp = getRecentPrice(marketHistory['GDP'], ek, 120);
      if (finra!=null && gdp) vals.push((finra/1000)/gdp*100);
    }
    if (vals.length<minReal) return null;
    return vals.reduce((a,b)=>a+b,0)/vals.length;
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
  function getCpiMa6(map: Map<string, number> | undefined, isoDate: string, n = 6, minObs = 4): number | null {
    // Media de los últimos n YoY mensuales <= fecha (para series mensuales como CPI).
    if (!map || map.size===0 || !isValidIsoDate(isoDate)) return null;
    let anchor: string | null = null;
    for (let i=0;i<40;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); if(map.has(k)){ anchor=k; break; } }
    if(!anchor){ for(const k of map.keys()) if(k<=isoDate && (anchor==null || k>anchor)) anchor=k; }
    if(!anchor) return null;
    const a = new Date(anchor);
    const vals: number[] = [];
    for (let k=0;k<n;k++){ const ref=new Date(a); ref.setMonth(ref.getMonth()-k); const y=getCpiYoY(map, ref.toISOString().slice(0,10)); if(y!=null) vals.push(y); }
    if (vals.length<minObs) return null;
    return vals.reduce((x,y)=>x+y,0)/vals.length;
  }
  function getMa126(map: Map<string, number> | undefined, isoDate: string, n = 126, minObs = 100): number | null {
    // Media móvil de los últimos n cierres <= fecha (walk de observaciones).
    if (!map || map.size===0 || !isValidIsoDate(isoDate)) return null;
    const vals: number[] = [];
    for (let i=0;i<400 && vals.length<n;i++){ const d=new Date(isoDate); d.setDate(d.getDate()-i); const v=map.get(d.toISOString().slice(0,10)); if(v!=null) vals.push(v); }
    if (vals.length<minObs) return null;
    return vals.reduce((a,b)=>a+b,0)/vals.length;
  }
  // % vs la fila de hace N meses (series mensuales FRED). Espejo de getMonthlyPct backend.
  function monthlyPctLive(map: Map<string, number> | undefined, isoDate: string, monthsBack: number): number | null {
    if (!map || map.size === 0 || !isValidIsoDate(isoDate)) return null;
    let anchor: string | null = null;
    for (let i = 0; i < 40; i++) { const d = new Date(isoDate); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); if (map.has(k)) { anchor = k; break; } }
    if (!anchor) { for (const k of map.keys()) if (k <= isoDate && (anchor == null || k > anchor)) anchor = k; }
    if (!anchor) return null;
    const a = new Date(anchor); a.setMonth(a.getMonth() - monthsBack);
    const prev = getRecentPrice(map, a.toISOString().slice(0, 10), 40);
    const cur = map.get(anchor)!;
    if (prev == null || prev === 0) return null;
    return (cur / prev - 1) * 100;
  }
  // Ratio WTI / SMA36M con anclas mensuales. Espejo del backend (bandas 0.70/0.90/1.20/1.45).
  function oilRatioLive(wtim: Map<string, number> | undefined, isoDate: string): { ratio: number | null; price: number | null } {
    if (!wtim || wtim.size === 0 || !isValidIsoDate(isoDate)) return { ratio: null, price: null };
    const price = getRecentPrice(wtim, isoDate, 10);
    if (price == null) return { ratio: null, price: null };
    let anchor: string | null = null;
    for (let i = 0; i < 40; i++) { const dd = new Date(isoDate + 'T12:00:00Z'); dd.setDate(dd.getDate() - i); const k = dd.toISOString().slice(0, 10); if (wtim.has(k)) { anchor = k; break; } }
    if (!anchor) { for (const k of wtim.keys()) if (k <= isoDate && (anchor == null || k > anchor)) anchor = k; }
    if (!anchor) return { ratio: null, price: null };
    const vals: number[] = [];
    for (let m = 0; m < 36; m++) { const q = new Date(anchor + 'T12:00:00Z'); q.setDate(1); q.setMonth(q.getMonth() - m); const v = getRecentPrice(wtim, q.toISOString().slice(0, 10), 10); if (v != null) vals.push(v); }
    if (vals.length < 30) return { ratio: null, price };
    return { ratio: price / (vals.reduce((a, b) => a + b, 0) / vals.length), price };
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
        try {
          const thRes = await fetch(`${base}/api/backtesting/thermo-history?from=1993-01-01`, { cache: 'no-store' });
          if (thRes.ok) {
            const arr = await thRes.json();
            const m: Record<string, { value: number; numerator: number; denominator: number; coverage: number; bonus?: number; bonusLabel?: string; liqBonus?: number; liqBonusLabel?: string; oilBonus?: number; oilBonusLabel?: string }> = {};
            for (const row of arr) m[(row.date || '').slice(0, 10)] = row;
            setThermoHist(m);
          }
        } catch {}
        const tickers = ['TQQQ', 'QQQ', 'SCHD', 'JEPQ', 'SQQQ', 'VOO', 'SPY', '^GSPC', '^IXIC', 'CPIAUCSL', 'CPILFESL', 'M2SL', 'BOGMBASE', 'DCOILWTICO', 'DFEDTARU', 'DGS2', 'DGS10', 'DGS30', 'BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'GDP', 'GDPC1', 'FINRA_DEBIT', 'MSACSR', 'VIXCLS', 'FEAR_GREED', 'NYSE_ADV_VOL', 'NYSE_DEC_VOL', 'NSDQ_ADV_VOL', 'NSDQ_DEC_VOL', 'SPX_ADV_VOL', 'SPX_DEC_VOL', 'SPX_EPS', 'SPX_FWD_EPS'];
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
  }, [capeView, capeRows.length, visibleCount]);
  useEffect(()=>{
    if (visibleCount >= 10000) return;
    const observer = new IntersectionObserver((entries)=>{
      if (entries[0].isIntersecting) setVisibleCount((prev:number)=> Math.min(prev+15, 10000));
    }, { threshold: 0.1 });
    if (observerRef.current) observer.observe(observerRef.current);
    return ()=> observer.disconnect();
  }, [visibleCount, capeView, capeRows.length, sortCol, sortDir]);

  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500">{ti('loading')}</div>;

  const capeLast = cape[cape.length - 1];
  const thermoToday = new Date().toISOString().slice(0, 10);
  const thermoSpx = (liveGspc?.data?.close != null && liveGspc.data.source !== 'db-fallback') ? Number(liveGspc.data.close) : getClosestPrice(marketHistory['^GSPC'], thermoToday);
  const thermoFwdEps = getRecentPrice(marketHistory['SPX_FWD_EPS'], thermoToday, 130);
  const thermoFwd = thermoSpx != null && thermoFwdEps != null && thermoFwdEps !== 0 ? thermoSpx / thermoFwdEps : null;
  const thermoEps = getRecentPrice(marketHistory['SPX_EPS'], thermoToday, 120);
  const thermoPe = thermoSpx != null && thermoEps != null && thermoEps !== 0 ? thermoSpx / thermoEps : null;
  const thermoCpi = getCpiYoY(marketHistory['CPIAUCSL'], liveMap['CPIAUCSL']?.data?.date || thermoToday);
  const thermoCore = getCpiYoY(marketHistory['CPILFESL'], liveMap['CPILFESL']?.data?.date || thermoToday);
  const thermoCpiMa = getCpiMa6(marketHistory['CPIAUCSL'], liveMap['CPIAUCSL']?.data?.date || thermoToday);
  const thermoCoreMa = getCpiMa6(marketHistory['CPILFESL'], liveMap['CPILFESL']?.data?.date || thermoToday);
  const thermoY30 = (liveMap['DGS30']?.data?.close != null && liveMap['DGS30'].data.source !== 'db-fallback') ? Number(liveMap['DGS30'].data.close) : getClosestPrice(marketHistory['DGS30'], thermoToday);
  const thermoY30ma = getMa126(marketHistory['DGS30'], liveMap['DGS30']?.data?.date || thermoToday);
  // Termómetro y bonus de hoy desde el backend (fuente única). Mientras carga o si falla,
  // se usa la última fila guardada en bt_thermo_history para no pintar el termómetro vacío.
  const thermoLastStored = (() => {
    const keys = Object.keys(thermoHist).filter((k) => k <= thermoToday).sort();
    return keys.length ? thermoHist[keys[keys.length - 1]] : undefined;
  })();
  const thermoLive = thermoLiveQ.data;
  const hyBonusNow: ThermoLive['hy'] = thermoLive?.hy ?? { bonus: thermoLastStored?.bonus ?? 0, label: thermoLastStored?.bonusLabel ?? 'sin dato', hy: null, z: null, d1: null };
  const liqBonusNow: ThermoLive['liq'] = thermoLive?.liq ?? { bonus: thermoLastStored?.liqBonus ?? 0, label: thermoLastStored?.liqBonusLabel ?? 'sin dato', yoy: null, m0d3: null, drop: null };
  const oilBonusNow: ThermoLive['oil'] = thermoLive?.oil ?? { bonus: thermoLastStored?.oilBonus ?? 0, label: thermoLastStored?.oilBonusLabel ?? 'sin dato', ratio: null, price: null };
  // Series M2/M0 con punto live anexado para el bonus simétrico de liquidez.
  const liqMergeLive = (key: string): Map<string, number> => {
    const base = marketHistory[key];
    const lq = liveMap[key];
    const m = new Map(base ?? []);
    if (lq?.data?.close != null && lq.data.source !== 'db-fallback' && isValidIsoDate(lq.data.date)) m.set(String(lq.data.date).slice(0, 10), Number(lq.data.close));
    return m;
  };
  const liqM2Map = liqMergeLive('M2SL');
  const liqM0Map = liqMergeLive('BOGMBASE');
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
          <h3 className="font-semibold text-slate-100">{ti('dailyTitle')}</h3>
          {isAdmin && (
          <button onClick={runSync} disabled={syncing} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold shadow border border-teal-500/30 transition">
            <span className={syncing ? 'animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full' : ''}>{syncing ? '' : '↻'}</span>
            {syncing ? tSync('refreshing') : tSync('refreshButton')}
          </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {isAdmin && <>Cron <code className="text-teal-400">L-V 22:05 America/New_York</code> → <code>daily_update.py</code> (yfinance <code>auto_adjust</code> + <code>verify_splits</code>) + <code>build_shiller_daily()</code>.{' '}</>}
          {ti('lastCape')} <span className="text-emerald-400 font-mono">{capeLast?.cape?.toFixed(2) ?? '—'}</span> ratio {capeLast?.capeRatio?.toFixed(3) ?? '—'} @ {capeLast?.date?.slice(0,10) ?? '—'}
          {isAdmin && <span className="ml-2 text-[11px] text-slate-500">· Precios/Bonos live vía API con caché (mercado 5 min / FRED 1h), CAPE diario desde DB</span>}

        </p>
      </div>
      {/* === Termómetro de Riesgo — Mercado General (estilo CNN Fear & Greed) === */}
      {(()=>{
        // Termómetro compuesto: promedio ponderado base 100 (no suma). Cada indicador aporta
        // puntaje 0-100 × peso; al agregar más, se normaliza entre el peso total acumulado.
        const PART_DEC: Record<string, number> = { RATIO: 3, FG: 0, MS: 1 };
        // Bandas de cada componente (las mismas de los orbes de las cards) para el popover del detalle.
        const PART_BANDS: Record<string, [number, number, string, string, string][]> = {
          CAPE: CAPE_BANDS, FWD: FWD_BANDS, RATIO: RATIO_BANDS, CPI: CPI_BANDS, CORE: CPI_BANDS, Y2M: Y2M_BANDS,
          '30Y': Y30_BANDS, MG: MG_BANDS, VIX: VIX_BANDS, FG: FG_BANDS, MS: MS_BANDS, PIB: GDP_BANDS,
        };
        const parts = (thermoLive?.parts ?? []).map((p) => ({ ...p, dec: PART_DEC[p.key] ?? 2 }));
        const wTotal = parts.reduce((m, p) => m + p.weight, 0);
        const hyB = hyBonusNow;
        const liqB = liqBonusNow;
        const oilB = oilBonusNow;
        const riskScore = thermoLive?.value ?? thermoLastStored?.value ?? 0;
        liveBhtRef.current = { v: riskScore, d: new Date().toISOString().slice(0, 10) };
        const band = bhtBand(riskScore);
        const riskLabel = band.label;
        const riskColor = band.textClass;
        const CX = 100, CY = 104, R = 80;
        const polar = (deg:number, r:number) => { const rad = (deg * Math.PI) / 180; return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)] as const; };
        // Arco proporcional a la frecuencia histórica (√freq: verde 11%, lima 25%,
        // amarillo 46%, naranja 13%, rojo 6%): las bandas habituales se ven más grandes.
        const SEGV = [0, ...BHT_CUTS, 100];
        const SEGARC = [28, 43, 58, 30, 21];
        const angL = (v:number) => {
          const c = Math.max(0, Math.min(100, v));
          let i = SEGV.findIndex((e, k) => k < SEGV.length - 1 && c >= e && (c < SEGV[k + 1] || (k === SEGV.length - 2 && c <= SEGV[k + 1])));
          if (i < 0) i = SEGV.length - 2;
          const acc = SEGARC.slice(0, i).reduce((m, x) => m + x, 0);
          return acc + ((c - SEGV[i]) / (SEGV[i + 1] - SEGV[i])) * SEGARC[i];
        };
        const A = (v:number) => 180 - angL(v);
        const arc = (v0:number, v1:number) => { const a0 = A(v0) - 0.6, a1 = A(v1) + 0.6; const [x0,y0] = polar(a0, R); const [x1,y1] = polar(a1, R); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
        const segs = BHT_BANDS.map((b): readonly [number, number, string] => [b.lo, b.hi, b.color]);
        const [nx,ny] = polar(A(riskScore), R - 24);
        const [t0x,t0y] = polar(A(0), R + 12);
        const [t50x,t50y] = polar(A(50), R + 12);
        const [t100x,t100y] = polar(A(100), R + 12);
        return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-slate-100">{ti('thermoTitle')}</h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
                {(['overview', 'timeline', 'stats'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setThermoView(v)}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition ${thermoView === v ? 'bg-slate-700 text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'}`}>
                    {v === 'overview' ? 'Overview' : v === 'timeline' ? 'Timeline' : 'Stats'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">{ti('underConstruction')}</span>
            </div>
          </div>
          {thermoView === 'timeline' && <BhtTimeline />}
          {thermoView === 'stats' && <BhtStats />}
          {thermoView === 'overview' && (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <svg viewBox="0 0 200 118" className="w-full max-w-[440px] flex-[1.2] shrink" role="img" aria-label={ti('riskAria', { score: riskScore, label: ti(`bht.b${BHT_BANDS.indexOf(band)}.label`) })}>
              {segs.map(([v0,v1,c]) => <path key={v0} d={arc(v0 + 0.8, v1 - 0.8)} fill="none" stroke={c} strokeWidth="16" strokeLinecap="butt" opacity="0.85" />)}
              <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
              <circle cx={CX} cy={CY} r="6" fill="#e2e8f0" />
              <text x={t0x.toFixed(0)} y={t0y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="start">0</text>
              <text x={t50x.toFixed(0)} y={t50y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">50</text>
              <text x={t100x.toFixed(0)} y={t100y.toFixed(0)} fill="#cbd5e1" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">100</text>
            </svg>
            <div className="flex-1 w-full text-center lg:text-left">
              <div className="font-mono text-5xl font-bold text-slate-100">{riskScore}<span className="text-lg text-slate-500">/100</span></div>
              <div className={`text-base font-semibold mt-1 ${riskColor}`}>{ti(`bht.b${BHT_BANDS.indexOf(band)}.label`)}</div>
            </div>
            <ul className="flex-[1.4] w-full space-y-1">
              {BHT_BANDS.map((b) => {
                const on = b.label === riskLabel;
                return <li key={b.label} className={`px-3 py-1.5 rounded-lg text-xs ${on ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:b.color}} />
                    <span className={`flex-1 ${on ? 'font-semibold' : ''}`}>{ti(`bht.b${BHT_BANDS.indexOf(b)}.label`)}</span>
                    <span className="font-mono">{b.range}</span>
                  </div>
                  <p className={`mt-0.5 pl-5 text-[11px] leading-snug ${on ? 'text-slate-300' : 'text-slate-500'}`}>{ti(`bht.b${BHT_BANDS.indexOf(b)}.advice`)}</p>
                </li>;
              })}
            </ul>
          </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">{ti('thermoFootA')} {parts.length ? parts.map(p => `${partName(p.key)} ${p.score.toFixed(0)}×${p.weight}`).join(' + ') + ` ÷ ${wTotal}` : ti('noIndicators')}{hyB.bonus > 0 ? ` + ${ti('bonusHy')} ${hyB.label} (+${hyB.bonus})` : ''}{liqB.bonus !== 0 ? ` + ${ti('bonusLiq')} ${liqB.label} (${liqB.bonus > 0 ? '+' : ''}${liqB.bonus})` : ''}{oilB.bonus !== 0 ? ` + ${ti('bonusOil')} ${oilB.label} (${oilB.bonus > 0 ? '+' : ''}${oilB.bonus})` : ''} · {ti('thermoFootB', { n: parts.length })}</p>
          <RiskDisclaimer variant="signal" className="mt-2" />
          <button type="button" onClick={() => setRiskDetailOpen(o => !o)} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:text-teal-300 hover:border-slate-600 transition">
            {riskDetailOpen ? ti('hideDetail') : ti('showDetail')}
          </button>
          {riskDetailOpen && <BhtHistoryBlock />}
          {riskDetailOpen && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-xs font-mono">
                <thead><tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left font-normal px-3 py-1.5">{ti('colIndicator')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colValue')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colScore')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colWeight')}</th><th className="text-right font-normal px-3 py-1.5">{ti('colContribution')}</th>
                </tr></thead>
                <tbody>
                  {parts.map(p => (
                    <tr key={p.key} className="border-b border-slate-800/60 text-slate-300">
                      <td className="px-3 py-1.5">{partLabel(p.key, loc)}</td>
                      <td className="text-right px-3 py-1.5">{p.value.toFixed(p.dec)}</td>
                      <td className="text-right px-3 py-1" style={{ color: capeScoreColor(p.score) }}>
                        {PART_BANDS[p.key] && PART_ORB_NAME[p.key]
                          ? <span className="inline-flex justify-end"><ScoreOrb name={PART_ORB_NAME[p.key]} value={p.value} dec={p.dec} weight={p.weight} score={Math.round(p.score)} bands={PART_BANDS[p.key]} small /></span>
                          : p.score.toFixed(0)}
                      </td>
                      <td className="text-right px-3 py-1.5 text-slate-400">{p.weight}</td>
                      <td className="text-right px-3 py-1.5 text-sky-300">{(p.score * p.weight / (wTotal || 1)).toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('hyBonusRow', { label: hyB.label })}</td>
                    <td className="text-right px-3 py-1.5">{hyB.hy != null ? hyB.hy.toFixed(2) : '—'}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: hyB.bonus > 0 ? '#f97316' : '#64748b' }}>{hyB.bonus > 0 ? `+${hyB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">+{hyB.bonus.toFixed(1)}</td>
                  </tr>
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('liqBonusRow', { label: liqB.label })}</td>
                    <td className="text-right px-3 py-1.5">{liqB.yoy != null ? `M2 +${liqB.yoy.toFixed(1)}%` : '—'}{liqB.m0d3 != null ? ` · M0 ${liqB.m0d3 >= 0 ? '+' : ''}${liqB.m0d3.toFixed(1)}%` : ''}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: liqB.bonus > 0 ? '#f97316' : liqB.bonus < 0 ? '#34d399' : '#64748b' }}>{liqB.bonus !== 0 ? `${liqB.bonus > 0 ? '+' : ''}${liqB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">{liqB.bonus !== 0 ? `${liqB.bonus > 0 ? '+' : ''}${liqB.bonus.toFixed(1)}` : '0.0'}</td>
                  </tr>
                  <tr className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-3 py-1.5">{ti('oilBonusRow', { label: oilB.label })}</td>
                    <td className="text-right px-3 py-1.5">{oilB.price != null ? `$${oilB.price.toFixed(2)}` : '—'}{oilB.ratio != null ? ` · ×${oilB.ratio.toFixed(2)}` : ''}</td>
                    <td className="text-right px-3 py-1.5" style={{ color: oilB.bonus > 0 ? '#f97316' : oilB.bonus < 0 ? '#34d399' : '#64748b' }}>{oilB.bonus !== 0 ? `${oilB.bonus > 0 ? '+' : ''}${oilB.bonus}` : '0'}</td>
                    <td className="text-right px-3 py-1.5 text-slate-400">—</td>
                    <td className="text-right px-3 py-1.5 text-sky-300">{oilB.bonus !== 0 ? `${oilB.bonus > 0 ? '+' : ''}${oilB.bonus.toFixed(1)}` : '0.0'}</td>
                  </tr>
                  <tr className="text-slate-100 font-semibold">
                    <td className="px-3 py-1.5" colSpan={4}>{ti('finalScore')} = Σ ÷ {wTotal}{hyB.bonus > 0 ? ` + bonus ${hyB.bonus}` : ''}{liqB.bonus !== 0 ? ` ${liqB.bonus > 0 ? '+' : ''}${liqB.bonus} liq` : ''}{oilB.bonus !== 0 ? ` ${oilB.bonus > 0 ? '+' : ''}${oilB.bonus} oil` : ''}</td>
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
        const tooltipMap: Record<string, string> = Object.fromEntries(TIP_KEYS.map((k) => [k, ti(`tips.${k.replace(/[^A-Za-z0-9_]/g, '')}`)]));
        const catOrder = [
          { key: 'valoracion', label: ti('cats.valoracion'), icon: '📊', keys: ['schiller_pe','pe_ratio','fwd_pe_ratio'] },
          { key: 'inflacion', label: ti('cats.inflacion'), icon: '🏛️', keys: ['inflation','core_inflation','fed_rate'] },
          { key: 'liquidez', label: ti('cats.liquidez'), icon: '💧', keys: ['M2SL','BOGMBASE'] },
          { key: 'energia', label: ti('cats.energia'), icon: '🛢️', keys: ['DCOILWTICO'] },
          { key: 'sentimiento', label: ti('cats.sentimiento'), icon: '😱', keys: ['VIXCLS','FEAR_GREED'] },
          { key: 'apalancamiento', label: ti('cats.apalancamiento'), icon: '💳', keys: ['FINRA_DEBIT','MARGIN_GDP'] },
          { key: 'tasas', label: ti('cats.tasas'), icon: '📈', keys: ['treasury_30y','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY'] },
          { key: 'crecimiento', label: ti('cats.crecimiento'), icon: '🏭', keys: ['GDP'] },
          { key: 'vivienda', label: ti('cats.vivienda'), icon: '🏠', keys: ['MSACSR'] },
          { key: 'volumen', label: ti('cats.volumen'), icon: '⚖️', keys: ['SPX_ADV_VOL','SPX_DEC_VOL','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL'] },
          { key: 'mercado', label: ti('cats.mercado'), icon: '💹', keys: ['^GSPC','^IXIC','TQQQ','QQQ','SPY','VOO','SCHD','JEPQ','SQQQ'] },
        ];
        const indByKey = new Map(indicators.map((i:any)=>[i.key, i]));
        const marketName: Record<string, string> = Object.fromEntries(NAME_KEYS.map((k) => [k, ti(`names.${k.replace(/[^A-Za-z0-9_]/g, '')}`)]));
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
          const displayValue = isSchiller && capeLast?.cape != null ? capeLast.cape : (isInflation && inflationYoY!=null ? inflationYoY : (ind.key==='fwd_pe_ratio' && thermoFwd!=null ? thermoFwd : (ind.key==='pe_ratio' && thermoPe!=null ? thermoPe : (useLive ? liveVal : ind.currentValue))));
          const displayStatus = isSchiller && capeLast?.cape != null ? (capeLast.cape >= 30 ? 'High' : capeLast.cape >= 20 ? 'Normal' : 'Low') : ind.status;
          const tip = tooltipMap[ind.key] || ind.description || '';
          // Grupo banda+orbe estándar: una sola config por tarjeta con puntaje.
          const sg = isSchiller && capeLast?.cape != null
            ? { label: capeBandLabel(capeLast.cape), score: Math.round(capeRiskScore(capeLast.cape)), name: 'CAPE', value: capeLast.cape, dec: 2, weight: 20, bands: CAPE_BANDS, blend: null as MomBlend }
            : ind.key === 'fwd_pe_ratio' && thermoFwd != null
            ? { label: fwdBandLabel(thermoFwd), score: Math.round(fwdRiskScore(thermoFwd)), name: 'Fwd PE', value: thermoFwd, dec: 2, weight: 10, bands: FWD_BANDS, blend: null as MomBlend }
            : ind.key === 'inflation' && thermoCpi != null && thermoCpiMa != null
            ? { label: cpiBandLabel(cpiMScore(thermoCpi, thermoCpiMa)), score: Math.round(cpiMScore(thermoCpi, thermoCpiMa)), name: 'CPI', value: thermoCpi, dec: 2, weight: 10, bands: CPI_BANDS, blend: momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, thermoCpi, thermoCpiMa) as MomBlend }
            : ind.key === 'core_inflation' && thermoCore != null && thermoCoreMa != null
            ? { label: cpiBandLabel(cpiMScore(thermoCore, thermoCoreMa)), score: Math.round(cpiMScore(thermoCore, thermoCoreMa)), name: 'Core', value: thermoCore, dec: 2, weight: 10, bands: CPI_BANDS, blend: momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, thermoCore, thermoCoreMa) as MomBlend }
            : ind.key === 'treasury_30y' && thermoY30 != null && thermoY30ma != null
            ? { label: y30mBandLabel(y30mRiskScore(thermoY30, thermoY30ma)), score: Math.round(y30mRiskScore(thermoY30, thermoY30ma)), name: '30Y', value: thermoY30, dec: 2, weight: 10, bands: Y30_BANDS, blend: momBlend(Y30M_LVL_SEGS, Y2M_TRD_SEGS, thermoY30, thermoY30ma) as MomBlend }
            : null;
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 group/card">
              <div className="text-xs text-slate-500 flex items-center">{ind.key} {isSchiller && <span className="text-teal-400 ml-1">{ti('daily')}</span>} {tip && renderTooltip(tip + (isSchiller && capeLast?.cape!=null ? ` ${ti('synced', { v: capeLast.cape.toFixed(2), d: (capeLast.date||'').slice(0,10) })}` : ''))}</div>
              <div className="font-semibold text-slate-100 truncate">{loc === 'es' ? ind.name : (marketName[ind.key] ?? ind.name)}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xl font-mono text-emerald-400">{displayValue != null ? Number(displayValue).toFixed(2) : '—'}{ind.unit}{isInflation && inflationYoY!=null ? <span className="text-[10px] text-slate-500 ml-1">YoY</span> : null}</span>
                {sg ? (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/50 py-0.5 pl-2.5 pr-1">
                    {(()=>{ const c = capeScoreColor(sg.score); return <span className="text-xs font-semibold" style={{ color: c }}>{levelLabel(sg.label, loc)}</span>; })()}
                    <ScoreOrb name={sg.name} value={sg.value} dec={sg.dec} weight={sg.weight} score={sg.score} bands={sg.bands} blend={sg.blend} small />
                  </span>
                )
                : <span className={`text-xs px-2 py-0.5 rounded-full border ${displayStatus==='High'?'bg-orange-500/20 text-orange-400 border-orange-500/30':displayStatus==='Greed'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-slate-800 text-slate-400 border-slate-700'}`}>{displayStatus}</span>}
              </div>
              {isInflation && liveVal!=null && <div className="text-[10px] font-mono text-slate-500">{ti('index')} {Number(liveVal).toFixed(2)}</div>}
              <div className="text-xs text-slate-500 mt-2 line-clamp-2">{loc === 'es' ? ind.description : (tooltipMap[ind.key] ?? ind.description)}</div>
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
            const level = ratio==null ? null : ratio>=5?'Extremo': ratio>=4.5?'Muy alto': ratio>=4?'Alto': ratio>=3?'Elevado': ratio>=2?'Normal':'Bajo';
            const levelColor = ratio==null?'text-slate-400': ratio>=5?'text-red-400': ratio>=4?'text-orange-400': ratio>=2?'text-yellow-400':'text-emerald-400';
            const mgM = ((): { ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(ratio==null) return null; const ma = getMarginGdpMa24(new Date().toISOString().slice(0,10)); if(ma==null) return null; const b = momBlend(MG_SEGS, MG_TRD_SEGS, ratio, ma); return { ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
            return (
              <div className="border rounded-lg px-3 py-2 bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">MARGIN_GDP {tip && renderTooltip(tip)} <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold">Ratio</span></div>
              <div className="font-semibold text-slate-100 truncate">{marketName['MARGIN_GDP']}</div>
                <div className="font-mono text-slate-100 text-lg flex items-center gap-2">{ratio!=null? `${ratio.toFixed(2)}%`:'—'}{ratio!=null && mgM!=null && <span className="ml-auto"><ScoreOrb name="Margen/PIB" value={ratio} weight={10} score={mgM.score} bands={MG_BANDS} blend={{ level: ratio, levelScore: mgM.levelScore, delta: mgM.d, ma: mgM.ma, maLabel: 'MA24M', trendScore: mgM.trendScore }} small /></span>}</div>
                {ratio!=null && <div className={`text-[11px] font-mono font-semibold ${levelColor}`}>{level} · FINRA ${(finraVal!/1000).toFixed(0)}B / GDP ${(gdpVal!/1000).toFixed(1)}T</div>}
                {ratio!=null && mgM!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {mgM.d>=0?'+':''}{mgM.d.toFixed(2)}pp vs MA24M {mgM.ma.toFixed(2)}% · <span style={{color: capeScoreColor(mgM.score)}}>{mgBandLabel(mgM.score)}</span></div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · FINRA/GDP</div>}
                {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
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
          const isHyOas = t==='BAMLH0A0HYM2';
          const isM2 = t==='M2SL';
          const isM0 = t==='BOGMBASE';
          const isOil = t==='DCOILWTICO';
          const isBreadth = t==='NYSE_ADV_VOL'||t==='NYSE_DEC_VOL'||t==='NSDQ_ADV_VOL'||t==='NSDQ_DEC_VOL'||t==='SPX_ADV_VOL'||t==='SPX_DEC_VOL';
          const fmt = (n:number) => isGDP ? `$${(n/1000).toFixed(1)}T` : (isM2||isM0) ? `$${(n/1000).toFixed(2)}T` : isFinra ? `$${(n/1000).toFixed(0)}B` : isMsacsr ? `${n.toFixed(1)} m` : isVix ? n.toFixed(2) : isFg ? n.toFixed(0) : isBreadth ? `${(n/1e9).toFixed(2)}B` : isYield ? `${n.toFixed(2)}%` : `$${n.toFixed(2)}`;
          // CPI cards: YoY mensual fijo (no diario) — live usa mes más reciente
          const cpiYoYForCard = isCpi ? getCpiYoY(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)) : null;
          const cpiMForCard = ((): { yoy: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(!isCpi) return null; const yoy = cpiYoYForCard; if(yoy==null) return null; const ma = getCpiMa6(marketHistory[t], liveMap[t]?.data?.date || new Date().toISOString().slice(0,10)); if(ma==null) return null; const b = momBlend(CPI_LVL_SEGS, CPI_TRD_SEGS, yoy, ma); return { yoy, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          // Y2M para la card DGS2: nivel + delta vs MA6M (reemplaza a FED en el termo).
          const y2mForCard = ((): { cur: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(t!=='DGS2') return null; const cur = showLive ? Number(live) : (v!=null ? Number(v) : null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const ma = getMa126(marketHistory['DGS2'], refDate); if(ma==null) return null; const b = momBlend(Y2M_LVL_SEGS, Y2M_TRD_SEGS, cur, ma); return { cur, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          const y30mForCard = ((): { cur: number; ma: number; d: number; score: number; levelScore: number; trendScore: number } | null => { if(t!=='DGS30') return null; const cur = showLive ? Number(live) : (v!=null ? Number(v) : null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const ma = getMa126(marketHistory['DGS30'], refDate); if(ma==null) return null; const b = momBlend(Y30M_LVL_SEGS, Y2M_TRD_SEGS, cur, ma); return { cur, ma, d: b.delta, score: Math.round(0.4*b.levelScore+0.6*b.trendScore), levelScore: b.levelScore, trendScore: b.trendScore }; })();
          // HY OAS: card informativa sin orbe de peso — bonus asimétrico Régimen 3 fuera del promedio.
          const hyCardB = isHyOas ? hyBonusNow : null;
          // M2/M0: cards informativas con el bonus simétrico de liquidez (fuera del promedio, como HY).
          const liqCardB = (isM2||isM0) ? liqBonusNow : null;
          // WTI: card informativa con el bonus simétrico de petróleo (fuera del promedio, como HY/LIQ).
          const oilCardB = isOil ? oilBonusNow : null;
          const gdpYoY = (()=>{ if(t!=='GDP') return null; const cur = showLive ? Number(live) : (v!=null? Number(v): null); if(cur==null) return null; const refRaw = q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDP'], iso, 95) ?? getClosestPrice(marketHistory['GDP'], refDate, 95);
            let p = prev; if(p==null){ const qd = new Date(refDate); qd.setMonth(qd.getMonth()-12); p = getClosestPrice(marketHistory['GDP'], qd.toISOString().slice(0,10), 95); } if(p==null || p===0) return null; return (cur/p -1)*100; })();
          const gdpc1YoY = (()=>{ if(t!=='GDP') return null; const fwdRaw = liveGdpc1?.data?.date; const fwdDate = isValidIsoDate(fwdRaw) ? String(fwdRaw).slice(0,10) : new Date().toISOString().slice(0,10); const curReal = liveGdpc1?.data?.close ?? getClosestPrice(marketHistory['GDPC1'], fwdDate, 95); if(curReal==null) return null; const refRaw = isValidIsoDate(liveGdpc1?.data?.date) ? liveGdpc1?.data?.date : q?.data?.date; const refDate = isValidIsoDate(refRaw) ? String(refRaw).slice(0,10) : new Date().toISOString().slice(0,10); const d=new Date(refDate); d.setFullYear(d.getFullYear()-1); const iso=d.toISOString().slice(0,10); const prev=getClosestPrice(marketHistory['GDPC1'], iso, 95); let p=prev; if(p==null){ const qd=new Date(refDate); qd.setMonth(qd.getMonth()-12); p=getClosestPrice(marketHistory['GDPC1'], qd.toISOString().slice(0,10),95);} if(p==null||p===0) return null; return (curReal/p -1)*100; })();
          // Para CPI mostrar YoY con índice como subtítulo
          if (isCpi) {
            const idxVal = showLive ? Number(live) : (v!=null ? Number(v) : null);
            return (
              <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
                <div className="font-semibold text-slate-100 truncate">{marketName[t] ?? t}</div>
                <div className="font-mono text-slate-100 flex items-center gap-2">{cpiYoYForCard!=null ? `${cpiYoYForCard.toFixed(2)}%` : '—'} <span className="text-[10px] text-slate-500">YoY</span>{cpiMForCard!=null && <span className="ml-auto"><ScoreOrb name={t==='CPIAUCSL'?'CPI':'Core'} value={cpiMForCard.yoy} dec={2} weight={10} score={cpiMForCard.score} bands={CPI_BANDS} blend={{ level: cpiMForCard.yoy, levelScore: cpiMForCard.levelScore, delta: cpiMForCard.d, ma: cpiMForCard.ma, maLabel: 'MA6M', trendScore: cpiMForCard.trendScore }} small /></span>}</div>
                {idxVal!=null && <div className="text-[10px] font-mono text-slate-500">{ti('index')} {idxVal.toFixed(2)}</div>}
                {cpiMForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {cpiMForCard.d>=0?'+':''}{cpiMForCard.d.toFixed(2)}pp vs MA6M {cpiMForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(cpiMForCard.score)}}>{levelLabel(cpiBandLabel(cpiMForCard.score), loc)}</span></div>}
                {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
                {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
              </div>
            );
          }
          return (
            <div className={`border rounded-lg px-3 py-2 ${showLive ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">{t} {tip && renderTooltip(tip)} {showLive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-white font-bold">Actual</span>}</div>
              <div className="font-semibold text-slate-100 truncate">{marketName[t] ?? t}</div>
              <div className="font-mono text-slate-100 flex items-center gap-2">{showLive ? fmt(Number(live)) : (v!=null ? fmt(Number(v)) : '—')}{(()=>{ const vv = showLive ? Number(live) : (v!=null ? Number(v) : null); if (vv == null) return null;
                if (isVix) return <span className="ml-auto"><ScoreOrb name="VIX" value={vv} weight={10} score={Math.round(vixRiskScore(vv))} bands={VIX_BANDS} small /></span>;
                if (isFg) { const s = Math.round(fgRiskScore(vv)); return <span className="ml-auto"><ScoreOrb name="F&G" value={vv} weight={10} score={s} bands={FG_BANDS} small /></span>; }
                if (isHyOas && hyCardB != null) return <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${hyCardB.bonus > 0 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>bonus {hyCardB.bonus > 0 ? `+${hyCardB.bonus}` : '+0'}</span>;
                if ((isM2||isM0) && liqCardB != null) return <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${liqCardB.bonus > 0 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : liqCardB.bonus < 0 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>liq {liqCardB.bonus !== 0 ? `${liqCardB.bonus > 0 ? '+' : ''}${liqCardB.bonus}` : '0'}</span>;
                if (isOil && oilCardB != null && oilCardB.ratio != null) { const s = Math.round(oilRiskScore(oilCardB.ratio)); return <span className="ml-auto"><ScoreOrb name="WTI" value={oilCardB.ratio} dec={2} weight={0} score={s} bands={OIL_BANDS} small /></span>; }
                if (isMsacsr) return <span className="ml-auto"><ScoreOrb name="MSACSR" value={vv} dec={1} weight={5} score={Math.round(msRiskScore(vv))} bands={MS_BANDS} small /></span>;
                if (t==='DGS2' && y2mForCard!=null) return <span className="ml-auto"><ScoreOrb name="2Y Mom" value={y2mForCard.cur} dec={2} weight={10} score={y2mForCard.score} bands={Y2M_BANDS} blend={{ level: y2mForCard.cur, levelScore: y2mForCard.levelScore, delta: y2mForCard.d, ma: y2mForCard.ma, maLabel: 'MA6M', trendScore: y2mForCard.trendScore }} small /></span>;
                if (t==='DGS30' && y30mForCard!=null) return <span className="ml-auto"><ScoreOrb name="30Y Mom" value={y30mForCard.cur} dec={2} weight={10} score={y30mForCard.score} bands={Y30_BANDS} blend={{ level: y30mForCard.cur, levelScore: y30mForCard.levelScore, delta: y30mForCard.d, ma: y30mForCard.ma, maLabel: 'MA6M', trendScore: y30mForCard.trendScore }} small /></span>;
                if (isGDP && gdpc1YoY != null) return <span className="ml-auto"><ScoreOrb name="PIB real" value={gdpc1YoY} weight={5} score={Math.round(gdpRiskScore(gdpc1YoY))} bands={GDP_BANDS} small /></span>;
                return null; })()}</div>
              {t==='DGS2' && y2mForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {y2mForCard.d>=0?'+':''}{y2mForCard.d.toFixed(2)}pp vs MA6M {y2mForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(y2mForCard.score)}}>{levelLabel(y2mBandLabel(y2mForCard.score), loc)}</span></div>}
              {isHyOas && hyCardB != null && hyCardB.hy != null && <div className="text-[11px] font-mono font-semibold text-slate-400">{levelLabel(hyBandLabel(hyCardB.hy), loc)} · <span className={hyCardB.bonus > 0 ? 'text-orange-300' : 'text-slate-500'}>{ti('regime3')} {hyCardB.bonus > 0 ? `${hyCardB.label} (+${hyCardB.bonus})` : ti('regime3Inactive')}</span></div>}
              {(isM2||isM0) && liqCardB != null && liqCardB.yoy != null && <div className="text-[11px] font-mono font-semibold text-slate-400">M2 YoY +{liqCardB.yoy.toFixed(1)}% · M0 Δ3M {liqCardB.m0d3 != null ? `${liqCardB.m0d3 >= 0 ? '+' : ''}${liqCardB.m0d3.toFixed(1)}%` : '—'} · <span className={liqCardB.bonus > 0 ? 'text-orange-300' : liqCardB.bonus < 0 ? 'text-emerald-300' : 'text-slate-500'}>{liqCardB.bonus !== 0 ? `${liqCardB.label} (${liqCardB.bonus > 0 ? '+' : ''}${liqCardB.bonus})` : ti('noBonus')}</span></div>}
              {isOil && oilCardB != null && oilCardB.ratio != null && <div className="text-[11px] font-mono font-semibold text-slate-400">×{oilCardB.ratio.toFixed(2)} SMA36M · <span className={oilCardB.bonus > 0 ? 'text-orange-300' : oilCardB.bonus < 0 ? 'text-emerald-300' : 'text-slate-500'}>{oilCardB.bonus !== 0 ? `${oilCardB.label} (${oilCardB.bonus > 0 ? '+' : ''}${oilCardB.bonus})` : ti('neutral')}</span></div>}
              {t==='DGS30' && y30mForCard!=null && <div className="text-[11px] font-mono font-semibold text-slate-400">Δ {y30mForCard.d>=0?'+':''}{y30mForCard.d.toFixed(2)}pp vs MA6M {y30mForCard.ma.toFixed(2)}% · <span style={{color: capeScoreColor(y30mForCard.score)}}>{levelLabel(y30mBandLabel(y30mForCard.score), loc)}</span></div>}
              {isGDP && (gdpYoY!=null || gdpc1YoY!=null) && <div className="flex gap-2 text-[11px] font-mono font-semibold"><span className={gdpYoY!=null && gdpYoY>=0?'text-emerald-400':'text-red-400'}>{gdpYoY!=null? `${gdpYoY>=0?'▲':'▼'} ${Math.abs(gdpYoY).toFixed(2)}% Nom`:'— Nom'}</span><span className="text-slate-600">·</span><span className={gdpc1YoY!=null && gdpc1YoY>=0?'text-sky-400':'text-orange-400'}>{gdpc1YoY!=null? `${gdpc1YoY>=0?'▲':'▼'} ${Math.abs(gdpc1YoY).toFixed(2)}% Real`:'— Real'}</span></div>}
              {fresh && <div className="text-[11px] text-slate-500">{fresh} · {src}</div>}
              {tip && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{tip}</div>}
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
                            <span className="text-xs font-semibold" style={{ color: c }}>{levelLabel(ratioBandLabel(ratio), loc)}</span>
                            <ScoreOrb name="CAPE Ratio" value={ratio} dec={3} weight={15} score={s} bands={RATIO_BANDS} small />
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 line-clamp-2">{ti('ratioDesc')} {ti('synced', { v: ratio.toFixed(3), d: (capeLast.date||'').slice(0,10) })}</div>
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
            <p className="text-xs text-slate-500">{ti('marketHint')}</p>
          </div>
        );
      })()}
      <MarginGdpChart marketHistory={chartHistory} cape={cape} volHistory={volHistory} />
      <CrisisEventsTable />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-100">{ti('capeChartTitle')}</h3>
          <div className="flex items-center gap-2">
          <button onClick={()=>{
            const buildSheet = (view: 'daily'|'monthly'|'yearly')=>{
              const headers = ['Fecha','SP500', view==='monthly' ? 'Change Monthly' : view==='yearly' ? 'Change Yearly' : 'Change Daily','BHT Index','Perf 1Y','Perf Total','CAGR','Nasdaq','TQQQ','SPX EPS','PE TTM','Fwd PE','CAPE Registrado','CAPE Ajustado','mean3y','RatioCape','FED Target','2Y','10Y','30Y','HY OAS','HY EY','HY 10Y+OAS','HY Bonus','LIQ Bonus','Oil Bonus','WTI','WTI xSMA36','M2','M2 YoY','M0','M0 Δ3M','CPI','Core CPI','GDP','FINRA Debit','Margin/GDP','MSACSR','VIX','F&G','Vol SPY','OBV','Fuerza','Tend-OBV','NetAdv','Up/Down','CAPE SMA 3Y','CAPE SMA 5Y','CAPE SMA 10Y','CAPE EMA 3Y','CAPE EMA 5Y','CAPE EMA 10Y'];
              let rowsView: any[] = capeRows;
              if(view==='monthly'){
                const byMonth = new Map<string, any>();
                for(const r of capeRows) byMonth.set((r.date||'').slice(0,7), r);
                rowsView = Array.from(byMonth.values());
              } else if(view==='yearly'){
                const byYear = new Map<string, any>();
                for(const r of capeRows) byYear.set((r.date||'').slice(0,4), r);
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
                  if(sortCol==='termo') return thermoHist[d]?.value ?? -1e9;
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
                const thRow = thermoHist[d];
                const m2vX = getRecentPrice(marketHistory['M2SL'], d, 40);
                const m0vX = getRecentPrice(marketHistory['BOGMBASE'], d, 40);
                const m2yX = monthlyPctLive(marketHistory['M2SL'], d, 12);
                const m0dX = monthlyPctLive(marketHistory['BOGMBASE'], d, 3);
                const wtiX = getRecentPrice(marketHistory['DCOILWTICO'], d, 10);
                const wtiRtX = oilRatioLive(marketHistory['DCOILWTICO'], d).ratio;
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
                return [label, getClosestPrice(marketHistory['^GSPC'], d) ?? '', varDia != null ? Number(varDia.toFixed(2)) : '', thermoHist[d]?.value ?? '', perf1y != null ? Number(perf1y.toFixed(2)) : '', perfTot != null ? Number(perfTot.toFixed(2)) : '', cagr != null ? Number(cagr.toFixed(2)) : '', getClosestPrice(marketHistory['^IXIC'], d) ?? '', getClosestPrice(marketHistory['TQQQ'], d) ?? '', spxEpsXls != null ? Number(spxEpsXls.toFixed(2)) : '', peTtmXls != null ? Number(peTtmXls.toFixed(2)) : '', fwdPeXls != null ? Number(fwdPeXls.toFixed(2)) : '', r.cape ?? '', r.capeAdjusted ?? '', (r.mean3y ?? r.mean) ?? '', r.capeRatio ?? '', getClosestPrice(marketHistory['DFEDTARU'], d) ?? '', getClosestPrice(marketHistory['DGS2'], d) ?? '', getClosestPrice(marketHistory['DGS10'], d) ?? '', getClosestPrice(marketHistory['DGS30'], d) ?? '', hyOas ?? '', hyEy ?? '', hy10y, thRow?.bonus ?? '', thRow?.liqBonus ?? '', thRow?.oilBonus ?? '', wtiX ?? '', wtiRtX != null ? Number(wtiRtX.toFixed(3)) : '', m2vX ?? '', m2yX != null ? Number(m2yX.toFixed(2)) : '', m0vX ?? '', m0dX != null ? Number(m0dX.toFixed(2)) : '', cpi ?? '', core ?? '', gdp ?? '', finra ?? '', marginGdp != null ? Number(marginGdp.toFixed(2)) : '', msacsrXls ?? '', vixXls ?? '', fgXls ?? '', volXls ?? '', obvXls ?? '', fuerzaXls != null ? Number(fuerzaXls.toFixed(3)) : '', obvtXls != null ? Number(obvtXls.toFixed(3)) : '', brXls.net ?? '', brXls.ratio ?? '', (r.mean3y ?? -1e9) !== -1e9 ? (r.mean3y ?? r.mean) : '', r.mean5y ?? '', r.mean10y ?? '', (r.mean3y_ema ?? (r as any).mean3yEma) ?? '', (r.mean5y_ema ?? (r as any).mean5yEma) ?? '', (r.mean10y_ema ?? (r as any).mean10yEma) ?? ''];
              });
              return { name: `CAPE ${view}`, headers, rows: rowsData };
            };
            const sheets = [buildSheet('daily'), buildSheet('monthly'), buildSheet('yearly')];
            exportToExcel(`CAPE-Shiller-Completo-${new Date().toISOString().slice(0,10)}.xlsx`, sheets);
          }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition">
            <Download size={14} /> {ti('excel3')}
          </button>
          <div className="flex gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg">
            {(['daily','monthly','yearly'] as const).map(v=>(
              <button key={v} onClick={()=>setCapeView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${capeView===v?'bg-slate-700 text-teal-300 border border-slate-600':'text-slate-400 hover:text-slate-200'}`}>{v==='daily'?'Daily':v==='monthly'?'Monthly':'Yearly'}</button>
            ))}
          </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">{ti('capeTableHint', { view: capeView })}</p>
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
                  {k:'termo', label:'BHT Index', cls:'text-right'},
                  {k:'perf1y', label:'Perf 1Y', cls:'text-right text-lime-300'},
                  {k:'perfTotal', label:'Perf Total', cls:'text-right text-teal-300'},
                  {k:'cagr', label:'CAGR', cls:'text-right text-amber-300'},
                  {k:'ndx', label:'Nasdaq', cls:'text-right text-sky-300'},
                  {k:'tqqq', label:'TQQQ', cls:'text-right text-sky-300'},
                  {k:'spxeps', label:'SPX EPS', cls:'text-right text-teal-300'},
                  {k:'spxpe', label:'PE TTM', cls:'text-right text-teal-300'},
                  {k:'spxfwdpe', label:'Fwd PE', cls:'text-right text-teal-300'},
                  {k:'cape', label:'CAPE Reg.', cls:'text-right', title:'CAPE registrado: S&P 500 ÷ denominador (E10) del último mes que Shiller había publicado ese día. Es el que usan el termómetro y el RatioCape.'},
                  {k:'capeAdj', label:'CAPE Ajust.', cls:'text-right text-slate-400', title:'CAPE ajustado (informativo): S&P 500 ÷ E10 del propio mes, con el dato final de Shiller. No se conocía ese día; vacío hasta que Shiller publica el mes.'},
                  {k:'mean3y', label:'mean3y', cls:'text-right text-amber-300'},
                  {k:'ratio', label:'RatioCape', cls:'text-right'},
                  {k:'fed', label:'FED Target', cls:'text-right text-violet-300'},
                  {k:'dgs2', label:'2Y', cls:'text-right text-cyan-300'},
                  {k:'dgs10', label:'10Y', cls:'text-right text-cyan-300'},
                  {k:'dgs30', label:'30Y', cls:'text-right text-cyan-300'},
                  {k:'hyOas', label:'HY OAS', cls:'text-right text-orange-300'},
                  {k:'hyEy', label:'HY EY', cls:'text-right text-orange-300'},
                  {k:'hy10y', label:'HY 10Y+OAS', cls:'text-right text-orange-300'},
                  {k:'hyBonus', label:'HY Bonus', cls:'text-right text-orange-300'},
                  {k:'liqBonus', label:'LIQ Bonus', cls:'text-right text-emerald-300'},
                  {k:'oilBonus', label:'Oil Bonus', cls:'text-right text-amber-300'},
                  {k:'wti', label:'WTI', cls:'text-right text-amber-300'},
                  {k:'wtiRatio', label:'WTI ×SMA36', cls:'text-right text-amber-300'},
                  {k:'m2', label:'M2', cls:'text-right text-teal-300'},
                  {k:'m2yoy', label:'M2 YoY', cls:'text-right text-teal-300'},
                  {k:'m0', label:'M0', cls:'text-right text-teal-300'},
                  {k:'m0d3', label:'M0 Δ3M', cls:'text-right text-teal-300'},
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
                ].map((col: { k: string; label: string; cls: string; title?: string })=>(
                  <th key={col.k} title={col.title} onClick={()=>toggleSort(col.k)} className={`p-2 ${col.cls} cursor-pointer select-none hover:text-teal-300 ${sortCol===col.k?'text-teal-300':''}`}>
                    {col.label} <span className="text-[10px]">{sortCol===col.k ? (sortDir==='asc'?'▲':'▼') : '↕'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 bg-slate-950/20 font-mono">
              {(()=>{
                let rows = capeRows;
                if (capeView==='monthly') {
                  const byMonth = new Map<string, any>();
                  for (const r of capeRows) byMonth.set((r.date||'').slice(0,7), r);
                  rows = Array.from(byMonth.values());
                } else if (capeView==='yearly') {
                  const byYear = new Map<string, any>();
                  for (const r of capeRows) byYear.set((r.date||'').slice(0,4), r);
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
                    if(sortCol==='hyBonus') return thermoHist[d]?.bonus ?? -Infinity;
                    if(sortCol==='liqBonus') return thermoHist[d]?.liqBonus ?? -Infinity;
                    if(sortCol==='oilBonus') return thermoHist[d]?.oilBonus ?? -Infinity;
                    if(sortCol==='wti') return getRecentPrice(marketHistory['DCOILWTICO'], d, 10) ?? -Infinity;
                    if(sortCol==='wtiRatio') return oilRatioLive(marketHistory['DCOILWTICO'], d).ratio ?? -Infinity;
                    if(sortCol==='m2') return getRecentPrice(marketHistory['M2SL'], d, 40) ?? -Infinity;
                    if(sortCol==='m2yoy') return monthlyPctLive(marketHistory['M2SL'], d, 12) ?? -Infinity;
                    if(sortCol==='m0') return getRecentPrice(marketHistory['BOGMBASE'], d, 40) ?? -Infinity;
                    if(sortCol==='m0d3') return monthlyPctLive(marketHistory['BOGMBASE'], d, 3) ?? -Infinity;
                    if(sortCol==='spxeps') return getRecentPrice(marketHistory['SPX_EPS'], d, 120) ?? -Infinity;
                    if(sortCol==='spxpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_EPS'], d, 120); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='spxfwdpe') { const p=getClosestPrice(marketHistory['^GSPC'], d); const e=getRecentPrice(marketHistory['SPX_FWD_EPS'], d, 130); return (p!=null&&e!=null&&e!==0)? p/e : -Infinity; }
                    if(sortCol==='cape') return r.cape ?? -Infinity;
                    if(sortCol==='capeAdj') return r.capeAdjusted ?? -Infinity;
                    if(sortCol==='mean3y') return (r.mean3y ?? r.mean ?? -Infinity);
                    if(sortCol==='ratio') return r.capeRatio ?? -Infinity;
                    if(sortCol==='termo') return thermoHist[d]?.value ?? -Infinity;
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
                const thR = thermoHist[d];
                const m2v = getRecentPrice(liqM2Map, d, 40);
                const m0v = getRecentPrice(liqM0Map, d, 40);
                const m2y = monthlyPctLive(liqM2Map, d, 12);
                const m0d = monthlyPctLive(liqM0Map, d, 3);
                const isLiveRow = sortCol==='date' && sortDir==='desc' && r.date===maxDate;
                const hyBO = isLiveRow ? hyBonusNow : null;
                const liqBO = isLiveRow ? liqBonusNow : null;
                const oilBO = isLiveRow ? oilBonusNow : null;
                const hyBv = isLiveRow ? (hyBO?.bonus ?? null) : (thR?.bonus ?? null);
                const hyBLbl = isLiveRow ? (hyBO?.label ?? '') : (thR?.bonusLabel ?? '');
                const liqBv = isLiveRow ? (liqBO?.bonus ?? null) : (thR?.liqBonus ?? null);
                const liqBLbl = isLiveRow ? (liqBO?.label ?? '') : (thR?.liqBonusLabel ?? '');
                const oilBv = isLiveRow ? (oilBO?.bonus ?? null) : (thR?.oilBonus ?? null);
                const oilBLbl = isLiveRow ? (oilBO?.label ?? '') : (thR?.oilBonusLabel ?? '');
                const oilRt = isLiveRow ? (oilBO?.ratio ?? null) : oilRatioLive(marketHistory['DCOILWTICO'], d).ratio;
                const oilPx = isLiveRow ? (oilBO?.price ?? null) : getRecentPrice(marketHistory['DCOILWTICO'], d, 10);
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
                  {(()=>{ const th = thermoHist[d]; const isLive = isCurrent && liveBhtRef.current.v != null; if (th == null && !isLive) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const thv = isLive ? liveBhtRef.current.v! : th.value; const c = capeScoreColor(thv); return <td className="p-2 text-right font-mono font-semibold whitespace-nowrap cursor-help" style={{color:c}} onMouseEnter={(e)=>{ capeBhtDet.setHover({d, x:e.clientX, y:e.clientY}); capeBhtDet.load(d); loadCapeFwd(d); }} onMouseMove={(e)=> capeBhtDet.setHover((s)=> s && s.d===d ? {...s, x:e.clientX, y:e.clientY} : s)} onMouseLeave={(e)=> bhtLeaveGuard(e, capeBhtDet)}><span className="border-b border-dotted border-slate-400/40" title={isLive ? 'En vivo (igual que el semáforo)' : undefined}>{thv.toFixed(1)}{isLive && <span className="text-teal-300"> •</span>}</span></td>; })()}
                  {(()=>{ const p=getPerf1Y(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const mature=isPerf1YMature(d); const cls = !mature ? 'text-sky-300 bg-sky-500/10 italic' : p>15?'text-emerald-400 bg-emerald-500/10':p>5?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-5?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const tip = mature ? `SP500 ${d} → +12m` : `SP500 ${d} → hoy: parcial anualizado (${perf1YElapsedMonths(d)}m transcurridos, no maduro)`; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={tip}>{arrow} {!mature?'~ ':''}{p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getPerfTotal(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>100?'text-emerald-300 bg-emerald-500/15':p>50?'text-emerald-400 bg-emerald-500/10':p>15?'text-green-400 bg-green-500/10':p>0?'text-yellow-400 bg-yellow-500/10':p>-10?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const todayS = new Date().toISOString().slice(0,10); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`SP500 ${d} → hoy ${todayS}`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ const p=getCAGR(d); if(p==null) return <td className="p-2 text-right font-mono whitespace-nowrap text-slate-500">—</td>; const cls = p>15?'text-emerald-400 bg-emerald-500/10':p>10?'text-green-400 bg-green-500/10':p>5?'text-yellow-400 bg-yellow-500/10':p>0?'text-orange-400 bg-orange-500/10':'text-red-400 bg-red-500/10'; const arrow = p>0?'▲':'▼'; const years = ((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold rounded ${cls}`} title={`CAGR ${d} → hoy (${years}a): (Phoy/Pd)^(1/años)-1`}>{arrow} {p.toFixed(2)}%</td>; })()}
                  {(()=>{ if(ndxDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'^IXIC', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='^IXIC' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(ndxDisp).toFixed(2)}</span></td>; })()}
                  {(()=>{ if(tqqqDisp==null) return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-sky-300 whitespace-nowrap cursor-help" onMouseEnter={(e)=> setStockHover({ticker:'TQQQ', d, x:e.clientX, y:e.clientY, cape: r.cape ?? null, ratio: r.capeRatio ?? null})} onMouseMove={(e)=> setStockHover(s=> s && s.ticker==='TQQQ' && s.d===d ? {...s, x:e.clientX, y:e.clientY}: s)} onMouseLeave={()=> setStockHover(null)}><span className="border-b border-dotted border-sky-400/40">${Number(tqqqDisp).toFixed(2)}</span></td>; })()}
                  <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`S&P 500 EPS TTM ${d} — multpl mensual`}>{spxEps!=null?`$${spxEps.toFixed(2)}`:'—'}</td>
                  {(()=>{ const pe=(spxDisp!=null&&spxEps!=null&&spxEps!==0)? spxDisp/spxEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`PE TTM ${d} — precio SPX / EPS TTM`}>{pe.toFixed(2)}</td>; })()}
                  {(()=>{ const pe=(spxDisp!=null&&spxFwdEps!=null&&spxFwdEps!==0)? spxDisp/spxFwdEps : null; if(pe==null) return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`Forward PE ${d} — precio SPX / EPS estimado 12m (operating)`}>{pe.toFixed(2)}</td>; })()}
                  <td className="p-2 text-right font-mono text-emerald-400 whitespace-nowrap" title={r.e10Month ? `CAPE registrado ${d}: S&P 500 ÷ E10 de ${String(r.e10Month).slice(0, 7)} (${r.e10 != null ? Number(r.e10).toFixed(2) : '—'})` : undefined}>{r.cape?.toFixed(2) ?? '—'}</td>
                  <td className="p-2 text-right font-mono text-slate-400 whitespace-nowrap" title={r.capeAdjusted == null ? 'Shiller aún no publica este mes' : 'Informativo: con el E10 final del propio mes'}>{r.capeAdjusted != null ? Number(r.capeAdjusted).toFixed(2) : '—'}</td>
                  <td className="p-2 text-right font-mono text-amber-300 whitespace-nowrap">{(r.mean3y ?? r.mean)?.toFixed(2) ?? '—'}</td>
                  <td className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${ratioColor} ${ratioBg} rounded`}>{ratio!=null ? `${ratio.toFixed(3)}X` : '—'}</td>
                  <td className="p-2 text-right font-mono text-violet-300 whitespace-nowrap">{fedDisp!=null?`${Number(fedDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs2Disp!=null?`${Number(dgs2Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs10Disp!=null?`${Number(dgs10Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-cyan-300 whitespace-nowrap">{dgs30Disp!=null?`${Number(dgs30Disp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2 OAS">{hyOasDisp!=null?`${Number(hyOasDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="BAMLH0A0HYM2EY Effective Yield">{hyEyDisp!=null?`${Number(hyEyDisp).toFixed(2)}%`:'—'}</td>
                  <td className="p-2 text-right font-mono text-orange-300 whitespace-nowrap" title="DGS10 + OAS">{hy10yDisp!=null?`${Number(hy10yDisp).toFixed(2)}%`:'—'}</td>
                  {(()=>{ if(hyBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=hyBv>0?'text-orange-300 bg-orange-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus HY Spread ${d}${hyBLbl?` — ${hyBLbl}`:''}`}>{hyBv>0?`+${hyBv}`:'0'}</td>; })()}
                  {(()=>{ if(liqBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=liqBv>0?'text-orange-300 bg-orange-500/10 font-semibold':liqBv<0?'text-emerald-300 bg-emerald-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus liquidez M2/M0 ${d}${liqBLbl?` — ${liqBLbl}`:''}`}>{liqBv!==0?`${liqBv>0?'+':''}${liqBv}`:'0'}</td>; })()}
                  {(()=>{ if(oilBv==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=oilBv>0?'text-orange-300 bg-orange-500/10 font-semibold':oilBv<0?'text-emerald-300 bg-emerald-500/10 font-semibold':'text-slate-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap rounded ${cls}`} title={`Bonus petróleo WTI ${d}${oilBLbl?` — ${oilBLbl}`:''}`}>{oilBv!==0?`${oilBv>0?'+':''}${oilBv}`:'0'}</td>; })()}
                  {(()=>{ if(oilPx==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-amber-300 whitespace-nowrap" title={`WTI ${d} (FRED DCOILWTICO, $/barril)`}>${oilPx.toFixed(2)}</td>; })()}
                  {(()=>{ if(oilRt==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-slate-200 whitespace-nowrap" title={`WTI / SMA36M ${d} — shock ≥1.45, caro ≥1.20, barato <0.90, alivio <0.70`}>{oilRt.toFixed(2)}×</td>; })()}
                  <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`M2 oferta monetaria ${d} (FRED M2SL, billones $)`}>{m2v!=null?`$${(m2v/1000).toFixed(2)}T`:'—'}</td>
                  {(()=>{ if(m2y==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; return <td className="p-2 text-right font-mono text-slate-200 whitespace-nowrap" title={`M2 YoY ${d} — tailwind exige >4% y acelerando vs 3M atrás`}>{m2y>=0?'+':''}{m2y.toFixed(1)}%</td>; })()}
                  <td className="p-2 text-right font-mono text-teal-300 whitespace-nowrap" title={`M0 base monetaria ${d} (FRED BOGMBASE, billones $)`}>{m0v!=null?`$${(m0v/1000).toFixed(2)}T`:'—'}</td>
                  {(()=>{ if(m0d==null) return <td className="p-2 text-right font-mono text-slate-500 whitespace-nowrap">—</td>; const cls=m0d>=0?'text-emerald-300':'text-red-400'; return <td className={`p-2 text-right font-mono whitespace-nowrap font-semibold ${cls}`} title={`M0 Δ3M ${d} — ${m0d<0?'≤0: veta el tailwind de liquidez':'positivo: permite tailwind'}`}>{m0d>=0?'+':''}{m0d.toFixed(1)}%</td>; })()}
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
        <p className="text-[11px] text-slate-500 mt-2">{ti('capeFootA', { n: capeRows.length })}{!cape.length && capeRows.length > 0 && <span className="text-amber-400"> · {ti('capeNoSeries')}</span>} · {ti('capeFootB')}</p>
      </div>
      <BhtForwardTable live={liveBhtRef} />
      {capeBhtDet.hover && <BhtDetailPopover hover={capeBhtDet.hover} detail={capeBhtDet.cache[capeBhtDet.hover.d]} forward={capeFwdCache[capeBhtDet.hover.d]} onLeave={() => capeBhtDet.scheduleClear()} onHold={() => capeBhtDet.cancelClear()} liveValue={(capeBhtDet.hover.d === liveBhtRef.current.d && liveBhtRef.current.v != null) ? liveBhtRef.current.v : null} />}
      {stockHover && (()=>{ const {ticker, d, x, y, cape:chCape, ratio:chRatio}=stockHover; const price=getClosestPrice(marketHistory[ticker], d); const p1y=getTickerPrice1Y(ticker,d); const perf1y=getTickerPerf1Y(ticker,d); const todayP=getTodayPrice(ticker); const perfTot=getTickerPerfTotal(ticker,d); const cagr=getTickerCAGR(ticker,d); const years=((new Date().getTime()-new Date(d).getTime())/(365.25*24*60*60*1000)).toFixed(1); const label=ticker==='^GSPC'?'SP500':ticker==='^IXIC'?'Nasdaq':ticker; const left = Math.min(Math.max(8, x+12), (typeof window!=='undefined'? window.innerWidth-332: 1000)); const top = Math.min(Math.max(8, y+12), (typeof window!=='undefined'? window.innerHeight-260: 800)); const nextD = (()=>{ const nd=new Date(d); nd.setMonth(nd.getMonth()+12); return nd.toISOString().slice(0,10); })(); return <div className="fixed z-[9999] w-[320px] p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs leading-relaxed text-slate-200 text-left" style={{left, top}} onMouseLeave={()=>setStockHover(null)}><div className="font-bold text-sky-300 mb-1.5 flex justify-between"><span>{label} · {d}</span><span className="text-slate-400 font-mono">CAPE {chCape?.toFixed(2) ?? '—'} · {chRatio!=null? chRatio.toFixed(2)+'×':'—'}</span></div><div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]"><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Precio entonces</div><div className="text-slate-100 font-bold">{price!=null? '$'+Number(price).toFixed(2):'—'}</div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">Hoy {new Date().toISOString().slice(0,10)}</div><div className="text-slate-100 font-bold">{todayP!=null? '$'+Number(todayP).toFixed(2):'—'} <span className={perfTot!=null && perfTot>0?'text-emerald-400':'text-red-400'}>{perfTot!=null? (perfTot>0?'▲ ':'▼ ')+perfTot.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">+1 año {nextD}</div><div className="text-slate-100 font-bold">{p1y!=null? '$'+Number(p1y).toFixed(2):'—'} <span className={perf1y!=null && perf1y>0?'text-emerald-400':'text-red-400'}>{perf1y!=null? (perf1y>0?'▲ ':'▼ ')+perf1y.toFixed(2)+'%':'—'}</span></div></div><div className="bg-slate-800/60 rounded p-1.5 border border-slate-700"><div className="text-slate-500">CAGR ({years}a)</div><div className="text-amber-300 font-bold">{cagr!=null? (cagr>0?'▲ ':'▼ ')+cagr.toFixed(2)+'%':'—'}</div></div></div><div className="text-[10px] text-slate-500 mt-1.5">{ticker==='TQQQ'?'TQQQ 3× Nasdaq · inception 2010-02-11':'S&P 500 / Nasdaq · valor nominal + performance 1Y y total'} · CAPE ratio = CAPE/mean3y</div></div>; })()}
    </div>
  );
}
