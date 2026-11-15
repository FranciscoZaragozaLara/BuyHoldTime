import { levelLabel } from '@/lib/levelLabels';
import { TOKENS } from '@/lib/designTokens';
import thermoSegsJson from '../../../../packages/bht-bands/thermo-segs.json';
import bandsJson from '../../../../packages/bht-bands/bands.json';

// Puntajes del termómetro BHT (0-100, 100 = riesgo máximo): bandas, etiquetas y desglose nivel+tendencia.
// Fuente única con el backend: packages/bht-bands/thermo-segs.json (componentes) y bands.json (CAPE por año).
// Las tablas *_BANDS de los popovers conservan su texto; thermoScoring.test.ts verifica que sus números
// coincidan con esos archivos.
export type Seg = [number, number, number, number];
type JsonSeg = { lo: number | null; hi: number | null; scoreLo: number; scoreHi: number; label?: string; display?: string };
const toSegs = (a: JsonSeg[]): Seg[] => a.map((x) => [x.lo ?? -Infinity, x.hi ?? Infinity, x.scoreLo, x.scoreHi]);
const SEGMENTS = (thermoSegsJson as { segments: Record<string, JsonSeg[]> }).segments;
/** Bandas de un componente desde thermo-segs.json (misma clave que el backend: 'FWD', 'CPI_LVL', …). */
export const segsOf = (name: string): Seg[] => toSegs(SEGMENTS[name]);

type BandsFile = { defaultYear: string; years: Record<string, { CAPE?: { segments: JsonSeg[] } }> };
/** Segmentos CAPE del año (mismo criterio que el backend: el año exacto, el anterior más cercano o defaultYear). */
export function capeJsonSegsForYear(year: number): JsonSeg[] {
  const bf = bandsJson as BandsFile;
  const prev = Object.keys(bf.years).map(Number).filter((y) => y <= year).sort((x, y) => y - x)[0];
  return (bf.years[String(prev ?? '')] ?? bf.years[bf.defaultYear]).CAPE!.segments;
}
// === Termómetro BuyHoldTime: puntaje CAPE 0-100 (100 = riesgo máximo), bandas del año en curso ===
// [lo, hi, puntajeLo, puntajeHi, etiqueta, display]; incluye el piso anual (P5 de los 20 años previos).
export const CAPE_SEGS: [number, number, number, number, string, string][] = capeJsonSegsForYear(new Date().getFullYear())
  .map((x) => [x.lo ?? -Infinity, x.hi ?? Infinity, x.scoreLo, x.scoreHi, x.label ?? '', x.display ?? '']);
export function bandScore(segs: Seg[], v: number): number {
  for (const [lo, hi, sLo, sHi] of segs) {
    if (v >= lo && v < hi) return sLo + (v - Math.max(lo, -1e9)) * ((sHi - sLo) / (Math.min(hi, 1e9) - Math.max(lo, -1e9) || 1));
  }
  return 100;
}
export function capeRiskScore(cape: number): number {
  return bandScore(CAPE_SEGS.map(([lo, hi, sLo, sHi]) => [lo, hi, sLo, sHi] as Seg), cape);
}
// Forward PE (EPS de Birinyi vía WSJ): bandas ×1.07 respecto a Yardeni; espejo de FWD_SEGS del backend.
export const FWD_SEGS: Seg[] = segsOf('FWD');
export function fwdRiskScore(pe: number): number {
  return bandScore(FWD_SEGS, pe);
}
// CAPE Ratio 5 bandas: 1.00→50, 1.05→60, 1.10→70, 1.15→80, 1.20→90, 1.30+→100
export const RATIO_SEGS: Seg[] = segsOf('RATIO');
export function ratioRiskScore(r: number): number {
  return bandScore(RATIO_SEGS, r);
}
// CPI momentum: nivel del YoY (40%) + delta vs media 6M de YoY (60%).
// Un 3.5 acelerando desde 2 pesa más que un 7 cayendo desde 9.
export const CPI_LVL_SEGS: Seg[] = segsOf('CPI_LVL');
export const CPI_TRD_SEGS: Seg[] = segsOf('CPI_TRD');
export function cpiMScore(yoy: number, ma: number): number {
  return 0.4 * bandScore(CPI_LVL_SEGS, yoy) + 0.6 * bandScore(CPI_TRD_SEGS, yoy - ma);
}
// Y2M (2Y Momentum): nivel del Treasury 2Y (40%) + delta vs MA6M (60%).
// El 2Y descuenta la política Fed meses antes del anuncio (sin su rezago).
export const Y2M_LVL_SEGS: Seg[] = segsOf('Y2M_LVL');
export const Y2M_TRD_SEGS: Seg[] = segsOf('Y2M_TRD');
// Y30M (30Y Momentum): mismo esquema que Y2M — nivel (40%) + delta vs MA6M (60%).
// Si los bonos se aceleran al alza, frenan economía y liquidez.
export const Y30M_LVL_SEGS: Seg[] = segsOf('Y30M_LVL');
export function y30mRiskScore(y: number, ma: number): number {
  return 0.4 * bandScore(Y30M_LVL_SEGS, y) + 0.6 * bandScore(Y2M_TRD_SEGS, y - ma);
}
// HY OAS (spread high-yield): a spread más amplio, más estrés crediticio = más riesgo
export const HY_SEGS: Seg[] = segsOf('HY');
export function hyRiskScore(v: number): number {
  return bandScore(HY_SEGS, v);
}
// Margen/PIB: a más apalancamiento, más riesgo de deleveraging
export const MG_SEGS: Seg[] = segsOf('MG');
// MG momentum: nivel del ratio (40%) + desvío vs MA24M (60%).
export const MG_TRD_SEGS: Seg[] = segsOf('MG_TRD');

// VIX invertido y sensible: complacencia <20 puntúa alto, pánico ≥30 cae a 0 rápido
export const VIX_SEGS: Seg[] = segsOf('VIX');
export function vixRiskScore(v: number): number {
  return bandScore(VIX_SEGS, v);
}
// Vivienda (MSACSR, meses de inventario): a más oferta sin vender, más riesgo
export const MS_SEGS: Seg[] = segsOf('MS');
export function msRiskScore(v: number): number {
  return bandScore(MS_SEGS, v);
}
// PIB real YoY procíclico (sobrecalentamiento): crecimiento muy fuerte = riesgo
// tardío de ciclo; recesión = score bajo (oportunidad, no frena la recompra).
export const GDP_SEGS: Seg[] = segsOf('GDP');
export function gdpRiskScore(v: number): number {
  // Sin techo (espejo backend): el suelo da score bajo por construcción.
  return bandScore(GDP_SEGS, v);
}
// Etiqueta visible del indicador (la clave interna RATIO se muestra como CAPE Ratio)
export const partName = (k: string) => k === 'RATIO' ? 'CAPE Ratio' : k;
// Descripción breve por indicador para las tablas de detalle (hover + termómetro).
export const partDesc: Record<string, string> = {
  CAPE: 'Valuación 10a', PE: 'Precio/Beneficio', FWD: 'PE estimado', RATIO: 'vs media 3a',
  CPI: 'Inflación', CORE: 'Inflación núcleo', Y2M: '2Y Momentum', '30Y': 'Momentum 30Y',
  HY: 'Crédito HY', MG: 'Apalancamiento', VIX: 'Volatilidad', FG: 'Sentimiento',
  MS: 'Vivienda', PIB: 'Crecimiento',
};
export const partLabel = (k: string, loc = 'es') => partDesc[k] ? `${partName(k)} - (${levelLabel(partDesc[k], loc)})` : partName(k);
export const fwdBandLabel = (pe: number) => bandLevel(FWD_BANDS, pe);
// Bandas para el popover del orbe: [lo, hi, display, puntos, nivel]
/** Nivel (5º campo) de la banda de una tabla *_BANDS que contiene v. */
export function bandLevel(bands: [number, number, string, string, string][], v: number): string {
  return (bands.find(([lo, hi]) => v >= lo && v < hi) ?? bands[bands.length - 1])[4];
}
// Tabla del popover del CAPE: texto y nivel vienen de bands.json (año en curso).
const ptsOf = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
export const CAPE_BANDS: [number, number, string, string, string][] = CAPE_SEGS.map(([lo, hi, sLo, sHi, label, display]) => [lo, hi, display, ptsOf(sLo, sHi), label]);
export const RATIO_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0.90, '≤ 0.90', '0–20', 'Barato'], [0.90, 1.00, '0.90–1.00', '20–50', 'Justo'], [1.00, 1.20, '1.00–1.20', '50–90', 'Caro'], [1.20, 1.30, '1.20–1.30', '90–100', 'Elevado'], [1.30, Infinity, '≥ 1.30', '100', 'Extremo'],
];
export const ratioBandLabel = (r: number) => bandLevel(RATIO_BANDS, r);
export const CPI_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.0, '≤ 1.0', '0–10', 'Muy baja'], [1.0, 1.5, '1.0–1.5', '10–25', 'Baja'], [1.5, 2.0, '1.5–2.0', '25–40', 'Rumbo a meta'], [2.0, 2.5, '2.0–2.5', '40–55', 'En meta'], [2.5, 3.0, '2.5–3.0', '55–70', 'Elevada'], [3.0, 4.0, '3.0–4.0', '70–85', 'Alta'], [4.0, Infinity, '≥ 4.0', '85–100', 'Extrema'],
];
// Etiqueta por puntaje combinado (nivel+tendencia de inflación).
export const cpiBandLabel = (s: number) => s < 20 ? 'Controlada' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Presión' : 'Descontrol';
export const Y2M_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 1.5, '≤ 1.5', '0–15', 'Muy bajo'], [1.5, 2.5, '1.5–2.5', '15–30', 'Bajo'], [2.5, 3.5, '2.5–3.5', '30–50', 'Moderado'], [3.5, 4.5, '3.5–4.5', '50–70', 'Neutral-alto'], [4.5, 5.5, '4.5–5.5', '70–88', 'Alto'], [5.5, Infinity, '≥ 5.5', '88–100', 'Extremo'],
];
// Etiqueta por puntaje combinado (nivel+tendencia), no solo por nivel.
export const y2mBandLabel = (s: number) => s < 20 ? 'Easing descontado' : s < 40 ? 'Alivio en camino' : s < 60 ? 'Neutral' : s < 80 ? 'Endurecimiento' : 'Restricción acelerada';
export const Y30_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 2.0, '≤ 2.0', '0–15', 'Suelo'], [2.0, 3.0, '2.0–3.0', '15–30', 'Baja'], [3.0, 3.5, '3.0–3.5', '30–50', 'Moderada'], [3.5, 4.0, '3.5–4.0', '50–70', 'Neutral-alta'], [4.0, 5.0, '4.0–5.0', '70–88', 'Alta'], [5.0, Infinity, '≥ 5.0', '88–100', 'Extrema'],
];
// Etiqueta por puntaje combinado (economía/liquidez), no solo por nivel.
export const y30mBandLabel = (s: number) => s < 20 ? 'Liquidez holgada' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Restricción' : 'Freno severo';
export const HY_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 3.0, '≤ 3.0', '0–12', 'Comprimido'], [3.0, 3.5, '3.0–3.5', '12–25', 'Ajustado'], [3.5, 4.0, '3.5–4.0', '25–38', 'Normal'], [4.0, 5.0, '4.0–5.0', '38–55', 'Elevándose'], [5.0, 6.5, '5.0–6.5', '55–68', 'Estrés'], [6.5, 8.0, '6.5–8.0', '68–80', 'Alto estrés'], [8.0, 11.0, '8.0–11', '80–90', 'Severo'], [11.0, Infinity, '≥ 11', '90–100', 'Extremo'],
];
export const hyBandLabel = (v: number) => bandLevel(HY_BANDS, v);
export const MG_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 2.0, '≤ 2.0', '0–20', 'Bajo'], [2.0, 3.0, '2.0–3.0', '20–50', 'Normal'], [3.0, 4.0, '3.0–4.0', '50–70', 'Elevado'], [4.0, 4.5, '4.0–4.5', '70–85', 'Alto'], [4.5, 5.0, '4.5–5.0', '85–100', 'Muy alto'], [5.0, Infinity, '≥ 5.0', '100', 'Extremo'],
];
export const mgBandLabel = (s: number) => s < 20 ? 'Desapalancamiento' : s < 40 ? 'Alivio' : s < 60 ? 'Neutral' : s < 80 ? 'Tensión' : 'Euforia';
export const GDP_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 0, '< 0', '0–10', 'Recesión'], [0, 1.0, '0–1.0', '10–25', 'Estancado'], [1.0, 2.0, '1.0–2.0', '25–45', 'Desacelera'], [2.0, 3.0, '2.0–3.0', '45–70', 'Saludable'], [3.0, 4.0, '3.0–4.0', '70–90', 'Sólido'], [4.0, Infinity, '≥ 4.0', '90–100', 'Sobrecalentado'],
];
export const MS_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 3.5, '≤ 3.5', '0–8', 'Escasez'], [3.5, 4.5, '3.5–4.5', '8–20', 'Ajustado'], [4.5, 5.5, '4.5–5.5', '20–35', 'Equilibrado'], [5.5, 6.5, '5.5–6.5', '35–50', 'Ampliándose'], [6.5, 7.5, '6.5–7.5', '50–62', 'Exceso'], [7.5, 9.0, '7.5–9.0', '62–74', 'Sobreoferta'], [9.0, 11.0, '9.0–11', '74–88', 'Muy frío'], [11.0, 13.0, '11–13', '88–100', 'Congelado'], [13.0, Infinity, '≥ 13', '100', 'Congelado'],
];
export const VIX_BANDS: [number, number, string, string, string][] = [
  [30, Infinity, '≥ 30', '0–10', 'Pánico'], [25, 30, '25–30', '10–35', 'Miedo'], [20, 25, '20–25', '35–60', 'Inquietud'], [15, 20, '15–20', '60–78', 'Tensión'], [12, 15, '12–15', '78–90', 'Complacencia'], [-Infinity, 12, '< 12', '90–100', 'Euforia'],
];
// WTI ratio vs SMA36M (bandas validadas 2003-2026, espejo del bonus oil del semáforo)
export const OIL_SEGS: Seg[] = segsOf('OIL');
export function oilRiskScore(ratio: number): number { return bandScore(OIL_SEGS, ratio); }
export const OIL_BANDS: [number, number, string, string, string][] = [
  [1.45, Infinity, '≥ 1.45', '85–100', 'Shock'], [1.20, 1.45, '1.20–1.45', '65–85', 'Caro'], [0.90, 1.20, '0.90–1.20', '35–65', 'Neutral'], [0.70, 0.90, '0.70–0.90', '15–35', 'Barato'], [-Infinity, 0.70, '< 0.70', '0–15', 'Alivio'],
];
// Fear & Greed entra directo (ya es 0-100 en la misma dirección)
// Fear & Greed estirado (espejo backend): ≤10 => 0 y ≥80 => 100, centro intacto
export const FG_SEGS: Seg[] = segsOf('FG');
export function fgRiskScore(v: number): number {
  return bandScore(FG_SEGS, v);
}
export const FG_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 10, '≤ 10', '0', 'Miedo Extremo'], [10, 15, '10–15', '0–8', 'Pánico'], [15, 25, '15–25', '8–25', 'Miedo'], [25, 45, '25–45', '25–45', 'Cautela'], [45, 55, '45–55', '45–60', 'Neutral'], [55, 70, '55–70', '60–85', 'Codicia'], [70, 80, '70–80', '85–100', 'Euforia'], [80, Infinity, '≥ 80', '100', 'Codicia Extrema'],
];
export const FWD_BANDS: [number, number, string, string, string][] = [
  [-Infinity, 16, '≤ 16', '0–25', 'Barato'], [16, 20.5, '16–20.5', '25–50', 'Justo'], [20.5, 23.5, '20.5–23.5', '50–80', 'Caro'], [23.5, 25.5, '23.5–25.5', '80–100', 'Elevado'], [25.5, Infinity, '≥ 25.5', '100', 'Extremo'],
];
export type MomBlend = { level: number; levelScore: number; delta: number; ma: number; maLabel: string; trendScore: number } | null;
// Etiqueta de tendencia con color semáforo (alcista = riesgo, bajista = alivio).
export function trendTag(d: number): { text: string; color: string } {
  const a = Math.abs(d);
  if (a < 0.1) return { text: 'Lateral', color: '#94a3b8' };
  const mag = a < 0.5 ? 'Leve' : a < 1.0 ? 'Elevada' : 'Extrema';
  const up = d > 0;
  const color = mag === 'Leve' ? (up ? '#eab308' : '#84cc36') : mag === 'Elevada' ? (up ? TOKENS.elevated : '#34d399') : (up ? TOKENS.risk : '#22c55e');
  return { text: `${up ? 'Alcista' : 'Bajista'} ${mag}`, color };
}
// Desglose nivel+tendencia para indicadores momentum (la tendencia pesa más).
export function momBlend(lvlSegs: Seg[], trdSegs: Seg[], y: number, ma: number, maLabel = 'MA6M'): Exclude<MomBlend, null> {
  const levelScore = bandScore(lvlSegs, y);
  const trendScore = bandScore(trdSegs, y - ma);
  return { level: y, levelScore, delta: y - ma, ma, maLabel, trendScore };
}
