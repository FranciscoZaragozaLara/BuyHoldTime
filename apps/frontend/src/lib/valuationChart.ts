// Serie de la gráfica "Market Valuation" (/indicators): mensual de Shiller antes del primer dato diario
// y diaria desde 1990 (S&P 500, P/E registrado, CAPE). Medias SMA 50/200 (mismas que el régimen tendencial y los
// cruces Golden/Death): en el tramo diario son medias simples de 50 y 200 sesiones del instrumento (con menos
// historia, la media de lo disponible); en el mensual, SMA de 3 y 10 meses (≈ 50 y 200 sesiones). Señales: BHT × tendencia ($$, $, ⚠) y cruces
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
/** Instrumento de la gráfica: precio, SMA y P/E son los suyos; CAPE y BHT son del mercado (independientes). */
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

/** Media simple móvil de los últimos `n` valores (con menos, la media de los disponibles). */
function smaWindow(n: number) {
  const buf: number[] = [];
  let sum = 0;
  return (v: number): number => {
    buf.push(v); sum += v;
    if (buf.length > n) sum -= buf.shift()!;
    return sum / buf.length;
  };
}

export function buildValuationChart(monthly: MonthlyRow[], daily: DailyValuation | null, instrument: Instrument = 'spx'): ChartPoint[] {
  // Nasdaq 100 y TQQQ no tienen serie mensual previa: solo el tramo diario (CAPE y BHT siguen desde 1990).
  if (instrument !== 'spx') monthly = [];
  const firstDaily = daily?.dates.find((_, i) => daily.spx[i] != null || daily.cape[i] != null);
  const cutMonth = firstDaily ? firstDaily.slice(0, 7) : null;
  const out: ChartPoint[] = [];
  const m50 = smaWindow(3), m200 = smaWindow(10);
  for (const row of monthly) {
    if (cutMonth && row.date >= cutMonth) break;
    const px = row.sp500Price;
    out.push({
      time: `${row.date}-01`, daily: false,
      sp500Price: px, peRatio: row.peRatio, shillerPe: row.shillerPe,
      sp500PriceMa50: px != null ? r2(m50(px)) : undefined,
      sp500PriceMa200: px != null ? r2(m200(px)) : undefined,
    });
  }
  if (!daily || !cutMonth) return out;
  const d50 = smaWindow(50), d200 = smaWindow(200);
  const prices = daily[PRICE_KEY[instrument]] ?? [];
  const pes = daily[PE_KEY[instrument]] ?? [];
  daily.dates.forEach((d, i) => {
    if (d < firstDaily!) return;
    const px = prices[i] ?? undefined;
    const s50 = px != null ? d50(px) : undefined, s200 = px != null ? d200(px) : undefined;
    out.push({
      time: d, daily: true,
      sp500Price: px, peRatio: pes[i] ?? undefined, shillerPe: daily.cape[i] ?? undefined, bht: daily.bht?.[i] ?? undefined,
      trend: daily.trend?.[i] ?? undefined,
      sp500PriceMa50: s50 != null ? r2(s50) : undefined,
      sp500PriceMa200: s200 != null ? r2(s200) : undefined,
    });
  });
  return out;
}

export type SignalKind = 'max' | 'strong' | 'buy' | 'starter' | 'danger' | 'sell' | 'golden' | 'death';
export type SignalMarker = {
  time: string; kind: SignalKind;
  /** 3 cruce · 2 entrada a un estado / subida de nivel · 1 recordatorio mensual (para el raleo por zoom). */
  priority: number;
  position: 'aboveBar' | 'belowBar'; color: string; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text: string; size: number;
};

/** Espera mínima (sesiones, ~2 meses) entre dos entradas de alerta (⚠). */
export const SIGNAL_COOLDOWN = 40;
/**
 * Compras: mientras el BHT siga en cualquier nivel de compra, una señal cada ~1 mes (sesiones) aunque el precio no baje
 * más (bajar a un nivel más barato la adelanta). Alerta (⚠): recordatorio igual de espaciado, solo si el precio subió.
 */
export const SIGNAL_REPEAT = 21;
/**
 * El Death Cross solo se marca con BHT ≥ este nivel: con el BHT barato llega tarde (cerca de los pisos: dic-2018,
 * mar-2020, abr-2025) y se leía como "no compres" justo en las oportunidades.
 */
export const DEATH_CROSS_MIN_BHT = 50;
export const CROSS_MIN_SESSIONS = 10;
/** Salidas escalonadas: primera al cruzar 75 y otra cada +5 (80, 85, 90…); la escalera se reinicia al bajar de 70. */
export const SELL_START = 75;
export const SELL_STEP = 5;
export const SELL_RESET_BELOW = 70;

// Compras: más barato = señal (y tramo) más grande.
const STYLE: Record<SignalKind, Omit<SignalMarker, 'time' | 'kind' | 'priority'>> = {
  max: { position: 'belowBar', color: TOKENS.favorable, shape: 'circle', text: '$$$', size: 1.6 },
  strong: { position: 'belowBar', color: TOKENS.favorable, shape: 'circle', text: '$$', size: 1.25 },
  buy: { position: 'belowBar', color: TOKENS.accent, shape: 'circle', text: '$', size: 0.95 },
  starter: { position: 'belowBar', color: TOKENS.caution, shape: 'circle', text: '¼$', size: 0.7 },
  danger: { position: 'aboveBar', color: TOKENS.risk, shape: 'square', text: '⚠', size: 1 },
  // Salida: el texto y el tamaño dependen del nivel (ver signalMarkers).
  sell: { position: 'aboveBar', color: TOKENS.elevated, shape: 'arrowDown', text: 'Vende', size: 1 },
  golden: { position: 'belowBar', color: TOKENS.caution, shape: 'arrowUp', text: 'Golden Cross', size: 1.1 },
  death: { position: 'aboveBar', color: '#94a3b8', shape: 'arrowDown', text: 'Death Cross', size: 1.1 },
};

export type SignalState = 'max' | 'strong' | 'buy' | 'starter' | 'danger';
/** Nivel de las señales de compra (1 ¼$ … 4 $$$): bajar a un nivel más barato no espera la pausa entre señales. */
export const BUY_RANK: Record<string, number> = { starter: 1, buy: 2, strong: 3, max: 4 };
const BUY_BY_RANK: SignalState[] = ['starter', 'starter', 'buy', 'strong', 'max'];

/**
 * Estado BHT × tendencia de un día. Compras en escalera por lo barato del BHT (más barato = tramo más grande):
 *  BHT 50–60 → ¼$ · 40–49 → $ · 30–39 → $$ · < 30 → $$$, con el S&P 500 arriba de su SMA 200 (alcista o corrección).
 *  Abajo de la SMA 200 cada tramo baja un nivel (escalonar hasta que la tendencia confirme): 40–49 → ¼$ … < 30 → $$;
 *  50–60 abajo de la SMA 200 no compra. danger (⚠): BHT ≥ 50 en tendencia bajista (abajo de la SMA 50 y de la 200).
 *  Sin alerta con tendencia alcista (los rallies con BHT 70+ suelen seguir) ni en Rebote (tras un piso se leía como
 *  «no compres» justo al empezar la recuperación).
 */
export function signalState(bht: number | undefined, trend: string | undefined): SignalState | null {
  const regime = toTrendRegime(trend);
  if (bht == null || !regime) return null;
  const above = regime === 'UPTREND' || regime === 'PULLBACK';
  const tier = bht < 30 ? 4 : bht < 40 ? 3 : bht < 50 ? 2 : bht < 61 ? 1 : 0;
  const rank = above ? tier : tier - 1;
  if (rank >= 1) return BUY_BY_RANK[rank];
  return regime === 'DOWNTREND' && bht >= 50 ? 'danger' : null;
}

/**
 * Señales de la gráfica. Compras (¼$ … $$$): al entrar en zona de compra, al bajar a un nivel más barato (de inmediato)
 * y, mientras siga barato, una cada SIGNAL_REPEAT sesiones con el nivel vigente. Alerta (⚠): al entrar (con
 * SIGNAL_COOLDOWN entre entradas), una por episodio bajista salvo que el precio suba. Y cruces de la SMA 50 sobre la SMA 200 del precio mostrado (Golden Cross hacia arriba,
 * Death Cross hacia abajo), descartando los que se revierten en menos de CROSS_MIN_SESSIONS sesiones.
 */
export function signalMarkers(points: ChartPoint[], locale = 'es'): SignalMarker[] {
  const daily = points.filter((p) => p.daily && p.sp500Price != null);
  const out: Array<{ time: string; kind: SignalKind; priority: number; level?: number }> = [];
  // 0) Salidas con BHT muy alto: al cruzar 75 y cada +5; se reinicia al bajar de 70 (si salta varios niveles, el más alto).
  let nextSell = SELL_START;
  for (const p of daily) {
    if (p.bht == null) continue;
    if (p.bht < SELL_RESET_BELOW) nextSell = SELL_START;
    if (p.bht >= nextSell) {
      const level = SELL_START + SELL_STEP * Math.floor((p.bht - SELL_START) / SELL_STEP);
      // Prioridad creciente con el nivel: al ralear por zoom gana la salida más alta (la de mayor riesgo).
      out.push({ time: p.time, kind: 'sell', priority: 2.5 + (level - SELL_START) / 1000, level });
      nextSell = level + SELL_STEP;
    }
  }
  // 1) BHT × tendencia
  let prev: string | null = null;
  let lastBuy: { i: number; kind: string } | null = null;
  let lastDanger: { i: number; price: number } | null = null;
  // Precio de la última ⚠ del episodio bajista (abajo de la SMA 200): otra alerta solo si el precio subió. Al recuperar
  // la SMA 200 el episodio termina. Evita alertas repetidas al oscilar entre Bajista y Rebote.
  let episodeDanger: number | null = null;
  daily.forEach((p, i) => {
    const st = signalState(p.bht, p.trend);
    const price = p.sp500Price!;
    const reg = toTrendRegime(p.trend);
    if (reg === 'UPTREND' || reg === 'PULLBACK') episodeDanger = null;
    if (st && BUY_RANK[st]) {
      // Compras: entrada, nivel más barato o recordatorio mensual mientras siga en zona de compra.
      const deeper = !!lastBuy && BUY_RANK[st] > (BUY_RANK[lastBuy.kind] ?? 0) && i - lastBuy.i < SIGNAL_REPEAT;
      if (!lastBuy || deeper || i - lastBuy.i >= SIGNAL_REPEAT) {
        const entry = !prev || !BUY_RANK[prev] || deeper;
        out.push({ time: p.time, kind: st as SignalKind, priority: entry ? 2 : 1 });
        lastBuy = { i, kind: st };
      }
    } else if (st === 'danger' && (episodeDanger == null || price > episodeDanger)) {
      const entry = prev !== 'danger';
      const ok = entry
        ? !lastDanger || i - lastDanger.i >= SIGNAL_COOLDOWN
        : !lastDanger || (i - lastDanger.i >= SIGNAL_REPEAT && price > lastDanger.price);
      if (ok) {
        out.push({ time: p.time, kind: 'danger', priority: entry ? 2 : 1 });
        lastDanger = { i, price };
        episodeDanger = price;
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
  const sellWord = locale === 'es' ? 'Vende' : 'Sell';
  return out
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(({ level, ...m }) => {
      const st = { ...m, ...STYLE[m.kind] };
      if (m.kind !== 'sell' || level == null) return st;
      // Más alto = flecha más grande y más roja.
      const step = (level - SELL_START) / SELL_STEP;
      return { ...st, text: `${sellWord} ${level}`, size: 1 + 0.2 * Math.min(step, 4), color: step >= 2 ? TOKENS.risk : TOKENS.elevated };
    });
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
  const KIND_RANK: Partial<Record<SignalKind, number>> = { max: 4, sell: 4, strong: 3, danger: 3, buy: 2, starter: 1 };
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
