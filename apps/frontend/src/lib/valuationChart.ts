// Serie de la gráfica "Market Valuation" (/indicators): mensual de Shiller antes del primer dato diario
// y diaria desde 1990 (S&P 500, P/E registrado, CAPE). Medias SMA 50/200 (mismas que el régimen tendencial y los
// cruces Golden/Death): en el tramo diario son medias simples de 50 y 200 sesiones del instrumento (con menos
// historia, la media de lo disponible); en el mensual, SMA de 3 y 10 meses (≈ 50 y 200 sesiones). Señales: BHT × tendencia ($$, $, ⚠) y cruces
// SMA 50/200 del instrumento (Golden / Death Cross).
import { TOKENS } from './designTokens';
import { toTrendRegime } from './trendRegime';
import { athDrawdown, type AthDrawdown } from './athDrawdown';

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
/** Venta de la escalera V1–V5 que calcula el backend (/api/backtesting/sell-ladder, el mismo motor de la pestaña
 *  Tranches). credit: ciclo abierto por crisis de crédito. */
export type SellLadderEvent = { date: string; id: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'; price: number; credit: boolean };
const SELL_COLOR: Record<SellLadderEvent['id'], string> = { V1: TOKENS.caution, V2: TOKENS.elevated, V3: TOKENS.elevated, V4: TOKENS.elevated, V5: TOKENS.risk };
const SELL_RANK: Record<SellLadderEvent['id'], number> = { V1: 1, V2: 2, V3: 3, V4: 2, V5: 4 };
/** Marcas de la escalera de venta: V1 Codicia · V2 Codicia extrema · V3 Euforia · V4 Primera grieta · V5 Tendencia rota
 *  (más grave = flecha más grande y más roja; «·C» si el ciclo lo abrió la crisis de crédito). Solo fechas de la gráfica. */
/** Compra de la escalera T0–T4 que calcula el backend (/api/backtesting/tranche-ladder, mismo motor de la pestaña). */
export type BuyLadderEvent = { date: string; id: 'T0' | 'T1' | 'T2' | 'T3' | 'T4'; price: number; size: number; backup: boolean };
const BUY_STYLE: Record<BuyLadderEvent['id'], { color: string; size: number }> = {
  T0: { color: '#a855f7', size: 1.5 }, T1: { color: TOKENS.caution, size: 0.95 }, T2: { color: TOKENS.accent, size: 1.3 },
  T3: { color: TOKENS.favorable, size: 1.15 }, T4: { color: TOKENS.favorable, size: 1.0 },
};
/** Marcas de la escalera de compra: T0 Capitulación (morado) · T1 Pánico terminando · T2 Desaceleración · T3 Validación ·
 *  T4 Valuación profunda; tamaño según el peso del tranche (25/15/25/20/15); «½» medio tranche, «·r» respaldo de T4. */
export function buyLadderMarkers(events: BuyLadderEvent[] | null | undefined, times?: Set<string>): SignalMarker[] {
  return (events ?? [])
    .filter((e) => !times || times.has(e.date))
    .map((e) => ({
      position: 'belowBar' as const, shape: 'circle' as const, time: e.date, kind: 'buy' as const, priority: 3.05,
      text: `${e.id}${e.size < 1 ? '½' : ''}${e.backup ? '·r' : ''}`, color: BUY_STYLE[e.id].color, size: BUY_STYLE[e.id].size,
    }));
}

export function sellLadderMarkers(events: SellLadderEvent[] | null | undefined, times?: Set<string>): SignalMarker[] {
  return (events ?? [])
    .filter((e) => !times || times.has(e.date))
    .map((e) => ({
      ...STYLE.sell, time: e.date, kind: 'sell' as const, priority: 3.1 + SELL_RANK[e.id] / 1000, // por encima de los cruces (3): al ralear gana la venta
      text: e.credit ? `${e.id}·C` : e.id, size: 0.9 + 0.15 * SELL_RANK[e.id], color: e.credit ? TOKENS.risk : SELL_COLOR[e.id],
    }));
}

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
export function signalMarkers(points: ChartPoint[], locale = 'es', opts: { buys?: boolean } = {}): SignalMarker[] {
  // buys: false → sin la escalera ¼$…$$$ por BHT (la gráfica usa las compras T0–T4 de los tranches).
  const withBuys = opts.buys !== false;
  const daily = points.filter((p) => p.daily && p.sp500Price != null);
  const out: Array<{ time: string; kind: SignalKind; priority: number }> = [];
  // Las ventas (V1–V5) ya no se calculan aquí: vienen del backend (sellLadderMarkers).
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
      if (!withBuys) { prev = st; return; }
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
  void locale;
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
 * Ventas que chocan con otra venta no se pierden: su etiqueta se suma a la que queda en forma compacta (p. ej.
 * «V1/4»), para que la gráfica no contradiga al detalle del día.
 */
/** Etiqueta compacta de ventas agrupadas: «V4», «V1» → «V1/4»; con crisis de crédito («V4·C») → «V1/4·C». */
export function mergeSellLabels(texts: string[]): string {
  const credit = texts.some((t) => t.endsWith('·C'));
  const nums = [...new Set(texts.map((t) => t.replace(/^V/, '').replace(/·C$/, '')))].sort();
  return `V${nums.join('/')}${credit ? '·C' : ''}`;
}

export function thinMarkers<T extends Pick<SignalMarker, 'time' | 'kind' | 'priority' | 'position'> & { text?: string }>(markers: T[], indexOf: (time: string) => number | undefined, minGapBars: number): T[] {
  if (minGapBars <= 1) return markers;
  const KIND_RANK: Partial<Record<SignalKind, number>> = { max: 4, sell: 4, strong: 3, danger: 3, buy: 2, starter: 1 };
  const order = markers
    .map((m, k) => ({ m, k, idx: indexOf(m.time) }))
    .filter((x) => x.idx != null)
    .sort((a, b) => b.m.priority - a.m.priority || (KIND_RANK[b.m.kind] ?? 0) - (KIND_RANK[a.m.kind] ?? 0) || a.idx! - b.idx!);
  const taken: Record<string, Array<{ idx: number; k: number }>> = {};
  const keep = new Set<number>();
  const merged = new Map<number, Array<{ idx: number; text: string }>>();
  for (const x of order) {
    const lane = (taken[x.m.position] ??= []);
    const hit = lane.find((j) => Math.abs(j.idx - x.idx!) < minGapBars);
    if (hit) {
      const host = markers[hit.k];
      if (x.m.kind === 'sell' && host.kind === 'sell' && x.m.text) {
        const list = merged.get(hit.k) ?? [{ idx: hit.idx, text: host.text ?? '' }];
        list.push({ idx: x.idx!, text: x.m.text });
        merged.set(hit.k, list);
      }
      continue;
    }
    lane.push({ idx: x.idx!, k: x.k });
    keep.add(x.k);
  }
  return markers.flatMap((m, k) => {
    if (!keep.has(k)) return [];
    const list = merged.get(k);
    return [list ? { ...m, text: mergeSellLabels(list.map((t) => t.text)) } : m];
  });
}

/** Línea de caída desde el máximo: del pico (ATH, o máximo de 5 años si el ATH tiene más de 5 años) al último precio. */
export function athDrawdownLine(points: ChartPoint[]): (AthDrawdown & { from: { time: string; value: number }; to: { time: string; value: number } }) | null {
  const hist = new Map<string, number>();
  for (const p of points) if (p.sp500Price != null) hist.set(p.time, p.sp500Price);
  const dd = athDrawdown(hist, null);
  if (!dd) return null;
  const lastTime = [...hist.keys()].reduce((a, b) => (b > a ? b : a));
  return { ...dd, from: { time: dd.athDate, value: dd.ath }, to: { time: lastTime, value: hist.get(lastTime)! } };
}
