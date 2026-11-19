// Serie de la gráfica "Market Valuation" (/indicators): mensual de Shiller antes del primer dato diario
// y diaria desde 1990 (S&P 500, P/E registrado, CAPE). EMA 50/200: en el tramo mensual se aproximan
// en meses (50 días ≈ 2.4 meses, 200 ≈ 9.5); en el diario son EMA reales de 50 y 200 días, sembradas
// con el valor mensual previo para que la línea no salte. Señales: BHT × tendencia ($$, $, ⚠) y cruces
// SMA 50/200 del instrumento (Golden / Death Cross).
import { TOKENS } from './designTokens';
import { toTrendRegime } from './trendRegime';

export type MonthlyRow = { date: string; sp500Price?: number; peRatio?: number; shillerPe?: number };
export type DailyValuation = {
  dates: string[]; spx: (number | null)[]; pe: (number | null)[]; cape: (number | null)[]; bht?: (number | null)[];
  qqq?: (number | null)[]; tqqq?: (number | null)[]; ndxPe?: (number | null)[];
  /** Régimen tendencial del S&P 500 en una letra: U alcista · P corrección · R rebote · D bajista. */
  trend?: (string | null)[];
};
/** Instrumento de la gráfica: precio, EMA y P/E son los suyos; CAPE y BHT son del mercado (independientes). */
export type Instrument = 'spx' | 'ndx' | 'tqqq';
const PRICE_KEY: Record<Instrument, 'spx' | 'qqq' | 'tqqq'> = { spx: 'spx', ndx: 'qqq', tqqq: 'tqqq' };
const PE_KEY: Record<Instrument, 'pe' | 'ndxPe'> = { spx: 'pe', ndx: 'ndxPe', tqqq: 'ndxPe' };
export type ChartPoint = {
  time: string; // YYYY-MM-DD
  daily: boolean;
  /** Precio del instrumento elegido (el nombre se conserva por compatibilidad con la gráfica). */
  sp500Price?: number; peRatio?: number; shillerPe?: number;
  sp500PriceMa50?: number; sp500PriceMa200?: number;
  /** BHT Index del día (desde 1993): da el color de la línea del S&P 500 y el detalle en el hover. */
  bht?: number;
  /** Régimen tendencial del S&P 500 del día (letra U/P/R/D o código completo). */
  trend?: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** EMA recursiva; si no hay valor, el punto queda sin EMA y se conserva el estado. */
function emaStep(prev: number | undefined, v: number | undefined, alpha: number): number | undefined {
  if (v == null) return prev;
  return prev == null ? v : prev + (v - prev) * alpha;
}

export function buildValuationChart(monthly: MonthlyRow[], daily: DailyValuation | null, instrument: Instrument = 'spx'): ChartPoint[] {
  // Nasdaq 100 y TQQQ no tienen serie mensual previa: solo el tramo diario (CAPE y BHT siguen desde 1990).
  if (instrument !== 'spx') monthly = [];
  const firstDaily = daily?.dates.find((_, i) => daily.spx[i] != null || daily.cape[i] != null);
  const cutMonth = firstDaily ? firstDaily.slice(0, 7) : null;
  const out: ChartPoint[] = [];
  const m50 = 2 / (2.4 + 1), m200 = 2 / (9.5 + 1);
  let e50: number | undefined, e200: number | undefined;
  for (const row of monthly) {
    if (cutMonth && row.date >= cutMonth) break;
    e50 = emaStep(e50, row.sp500Price, m50);
    e200 = emaStep(e200, row.sp500Price, m200);
    out.push({
      time: `${row.date}-01`, daily: false,
      sp500Price: row.sp500Price, peRatio: row.peRatio, shillerPe: row.shillerPe,
      sp500PriceMa50: row.sp500Price != null && e50 != null ? r2(e50) : undefined,
      sp500PriceMa200: row.sp500Price != null && e200 != null ? r2(e200) : undefined,
    });
  }
  if (!daily || !cutMonth) return out;
  const d50 = 2 / 51, d200 = 2 / 201;
  const prices = daily[PRICE_KEY[instrument]] ?? [];
  const pes = daily[PE_KEY[instrument]] ?? [];
  daily.dates.forEach((d, i) => {
    if (d < firstDaily!) return;
    const px = prices[i] ?? undefined;
    e50 = emaStep(e50, px, d50);
    e200 = emaStep(e200, px, d200);
    out.push({
      time: d, daily: true,
      sp500Price: px, peRatio: pes[i] ?? undefined, shillerPe: daily.cape[i] ?? undefined, bht: daily.bht?.[i] ?? undefined,
      trend: daily.trend?.[i] ?? undefined,
      sp500PriceMa50: px != null && e50 != null ? r2(e50) : undefined,
      sp500PriceMa200: px != null && e200 != null ? r2(e200) : undefined,
    });
  });
  return out;
}

export type SignalKind = 'strong' | 'buy' | 'starter' | 'danger' | 'golden' | 'death';
export type SignalMarker = {
  time: string; kind: SignalKind;
  /** 3 cruce · 2 entrada a un estado / subida de nivel · 1 recordatorio mensual (para el raleo por zoom). */
  priority: number;
  position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text: string; size: number;
};

/**
 * Espera mínima (sesiones, ~2 meses) entre señales de la misma familia (¼$/$/$$ comparten una; ⚠ la suya; subir de
 * nivel de compra no espera), y duración mínima de un cruce para contarlo.
 */
export const SIGNAL_COOLDOWN = 40;
/**
 * Recordatorio mientras un estado se mantiene: cada ~1 mes (sesiones) se repite el icono. Compras: con solo mantenerse;
 * alerta (⚠): solo si el precio subió desde la alerta anterior.
 */
export const SIGNAL_REPEAT = 21;
/**
 * El Death Cross solo se marca con BHT ≥ este nivel: con el BHT barato llega tarde (cerca de los pisos: dic-2018,
 * mar-2020, abr-2025) y se leía como "no compres" justo en las oportunidades.
 */
export const DEATH_CROSS_MIN_BHT = 50;
export const CROSS_MIN_SESSIONS = 10;

const STYLE: Record<SignalKind, Omit<SignalMarker, 'time' | 'kind' | 'priority'>> = {
  strong: { position: 'belowBar', color: TOKENS.favorable, shape: 'circle', text: '$$', size: 1.2 },
  buy: { position: 'belowBar', color: TOKENS.accent, shape: 'circle', text: '$', size: 0.9 },
  starter: { position: 'belowBar', color: TOKENS.caution, shape: 'circle', text: '¼$', size: 0.7 },
  danger: { position: 'aboveBar', color: TOKENS.risk, shape: 'square', text: '⚠', size: 1 },
  golden: { position: 'belowBar', color: TOKENS.caution, shape: 'arrowUp', text: 'Golden Cross', size: 1.1 },
  death: { position: 'aboveBar', color: '#94a3b8', shape: 'arrowDown', text: 'Death Cross', size: 1.1 },
};

export type SignalState = 'strong' | 'buy' | 'starter' | 'danger';
/** Nivel de las señales de compra (subir de nivel no espera la pausa entre señales). */
const BUY_RANK: Record<string, number> = { starter: 1, buy: 2, strong: 3 };

/**
 * Estado BHT × tendencia de un día ("arriba" = S&P 500 arriba de su SMA 200, régimen alcista o corrección):
 *  strong ($$): BHT < 40 arriba · buy ($): BHT < 40 abajo, o 40–49 arriba · starter (¼$, primer tramo pequeño):
 *  BHT 50–60 arriba · danger (⚠): BHT ≥ 50 abajo de la SMA 200 (tendencia rota). Con BHT alto y tendencia alcista no
 *  hay alerta: los rallies con BHT 70+ suelen seguir, y marcarlos como peligro hacía salir demasiado pronto.
 */
export function signalState(bht: number | undefined, trend: string | undefined): SignalState | null {
  const regime = toTrendRegime(trend);
  if (bht == null || !regime) return null;
  const above = regime === 'UPTREND' || regime === 'PULLBACK';
  if (bht < 40) return above ? 'strong' : 'buy';
  if (bht < 50) return above ? 'buy' : null;
  if (!above) return 'danger';
  return bht < 61 ? 'starter' : null;
}

/**
 * Señales de la gráfica: $$ / $ / ¼$ / ⚠ al ENTRAR en cada estado (no cada día), con SIGNAL_COOLDOWN sesiones entre
 * dos de la misma familia; si el estado se mantiene, un recordatorio cada SIGNAL_REPEAT sesiones (⚠ solo si el
 * precio subió); y cruces de la SMA 50 sobre la SMA 200 del precio mostrado (Golden Cross hacia arriba,
 * Death Cross hacia abajo), descartando los que se revierten en menos de CROSS_MIN_SESSIONS sesiones.
 */
export function signalMarkers(points: ChartPoint[]): SignalMarker[] {
  const daily = points.filter((p) => p.daily && p.sp500Price != null);
  const out: Array<{ time: string; kind: SignalKind; priority: number }> = [];
  // 1) BHT × tendencia
  let prev: string | null = null;
  const fam = (k: string) => (k === 'danger' ? 'danger' : 'buy');
  const last: Record<string, { i: number; kind: string } | undefined> = {};
  // Última marca dentro del estado vigente (para los recordatorios) y su precio.
  let runMark: { i: number; price: number } | null = null;
  daily.forEach((p, i) => {
    const st = signalState(p.bht, p.trend);
    const price = p.sp500Price!;
    if (st && st !== prev) {
      runMark = null;
      const l = last[fam(st)];
      const upgrade = st !== 'danger' && !!l && (BUY_RANK[st] ?? 0) > (BUY_RANK[l.kind] ?? 0);
      if (!l || upgrade || i - l.i >= SIGNAL_COOLDOWN) {
        out.push({ time: p.time, kind: st, priority: 2 });
        last[fam(st)] = { i, kind: st };
        runMark = { i, price };
      }
    } else if (st && st === prev) {
      // El estado se mantiene: recordatorio mensual (desde la última marca de la familia si la entrada esperó).
      const ref = runMark ?? (last[fam(st)] ? { i: last[fam(st)]!.i, price: daily[last[fam(st)]!.i].sp500Price! } : null);
      const due = !ref || i - ref.i >= SIGNAL_REPEAT;
      if (due && (st !== 'danger' || !ref || price > ref.price)) {
        out.push({ time: p.time, kind: st, priority: 1 }); // recordatorio
        last[fam(st)] = { i, kind: st };
        runMark = { i, price };
      }
    }
    prev = st;
  });
  // 2) Cruces SMA 50 / SMA 200 del precio mostrado
  const px = daily.map((p) => p.sp500Price!);
  let s50 = 0, s200 = 0, sign = 0;
  const flips: Array<{ i: number; up: boolean }> = [];
  for (let i = 0; i < px.length; i++) {
    s50 += px[i]; s200 += px[i];
    if (i >= 50) s50 -= px[i - 50];
    if (i >= 200) s200 -= px[i - 200];
    if (i < 199) continue;
    const d = s50 / 50 - s200 / 200;
    const sg = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (sg !== 0 && sign !== 0 && sg !== sign) flips.push({ i, up: sg > 0 });
    if (sg !== 0) sign = sg;
  }
  // Un cruce que se revierte antes de CROSS_MIN_SESSIONS es ruido: se descartan ambos.
  const keep = flips.filter((f, k) => {
    const next = flips[k + 1], before = flips[k - 1];
    return !(next && next.i - f.i < CROSS_MIN_SESSIONS) && !(before && f.i - before.i < CROSS_MIN_SESSIONS);
  });
  for (const f of keep) {
    const b = daily[f.i].bht;
    if (!f.up && b != null && b < DEATH_CROSS_MIN_BHT) continue; // Death Cross con BHT barato: rezagado, se omite
    out.push({ time: daily[f.i].time, kind: f.up ? 'golden' : 'death', priority: 3 });
  }
  return out
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((m) => ({ ...m, ...STYLE[m.kind] }));
}

/** Distancia mínima en píxeles entre dos señales del mismo carril (arriba / abajo de la línea). */
export const MARKER_MIN_PX = 30;

/**
 * Raleo según el zoom: en cada carril (position) se acepta una señal solo si no hay otra aceptada a menos de
 * `minGapBars` sesiones. Se decide por prioridad (cruces, luego entradas, luego recordatorios; a igual prioridad,
 * $$ sobre $ y ¼$) y luego por fecha, así lo importante nunca se pierde. `indexOf` da la posición de cada fecha.
 */
export function thinMarkers<T extends Pick<SignalMarker, 'time' | 'kind' | 'priority' | 'position'>>(markers: T[], indexOf: (time: string) => number | undefined, minGapBars: number): T[] {
  if (minGapBars <= 1) return markers;
  const KIND_RANK: Partial<Record<SignalKind, number>> = { strong: 3, danger: 3, buy: 2, starter: 1 };
  const order = markers
    .map((m, k) => ({ m, k, idx: indexOf(m.time) }))
    .filter((x) => x.idx != null)
    .sort((a, b) => b.m.priority - a.m.priority || (KIND_RANK[b.m.kind] ?? 0) - (KIND_RANK[a.m.kind] ?? 0) || a.idx! - b.idx!);
  const taken: Record<string, number[]> = {};
  const keep = new Set<number>();
  for (const x of order) {
    const lane = (taken[x.m.position] ??= []);
    if (lane.some((j) => Math.abs(j - x.idx!) < minGapBars)) continue;
    lane.push(x.idx!);
    keep.add(x.k);
  }
  return markers.filter((_, k) => keep.has(k));
}
