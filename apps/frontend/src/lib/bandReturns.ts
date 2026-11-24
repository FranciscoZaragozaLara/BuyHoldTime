// Retornos posteriores agrupados por banda del BHT (las mismas 7 de la matriz BHT × tendencia) o por nivel del CAPE,
// para la sección "¿Funciona el BHT?" de la página de indicadores. Funciones puras (testeadas en bandReturns.test.ts).
import { MATRIX_BANDS } from './bhtMatrix';

export type Asset = 'spx' | 'ndx' | 'tqqq';
export type Window = '5y' | '10y' | 'all';
export type FwdRow = { date: string; bhtValue: number | null } & Partial<Record<`${Asset}${1 | 3}y`, number | null>>;

/** Niveles del CAPE (fijos e interpretables; el CAPE histórico de 1993 a hoy va de ~15 a ~44). */
export const CAPE_LEVELS = [
  { lo: -Infinity, range: '< 20' }, { lo: 20, range: '20–25' }, { lo: 25, range: '25–30' },
  { lo: 30, range: '30–35' }, { lo: 35, range: '35–40' }, { lo: 40, range: '≥ 40' },
] as const;

export type Stat = { n: number; avg: number; median: number; pos: number } | null;
export type BandRow = {
  key: number; range: string;
  /** Días del rango con retorno a 1 año ya maduro y su % del total. */
  days: number; pctTime: number;
  y1: Stat; y3: Stat;
  /** CAGR equivalente al promedio a 3 años (igual que la vista Estrategia). */
  cagr3: number | null;
  /**
   * Robustez: los días seguidos de un mismo rally no son casos independientes. `dense` = la ventana de 5 años con más
   * días de la banda (años y % de los días); `y1Without` = promedio a 1 año sin esa ventana; `thin` = la ventana
   * concentra ≥ 45% de los días (el resultado depende de un solo periodo).
   */
  dense: { from: string; to: string; share: number } | null; y1Without: number | null; thin: boolean;
};

/** Ventana de 5 años con más días (fechas ordenadas): índices [j, i] y número de días. */
function densestWindow(dates: string[]): { j: number; i: number; n: number } | null {
  if (!dates.length) return null;
  let best = { j: 0, i: 0, n: 1 }, j = 0;
  for (let i = 0; i < dates.length; i++) {
    const lim = `${Number(dates[i].slice(0, 4)) - 5}${dates[i].slice(4, 10)}`;
    while (dates[j] < lim) j++;
    if (i - j + 1 > best.n) best = { j, i, n: i - j + 1 };
  }
  return best;
}

const stat = (v: number[]): Stat => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    n: v.length,
    avg: v.reduce((m, x) => m + x, 0) / v.length,
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    pos: (v.filter((x) => x > 0).length / v.length) * 100,
  };
};

/** Primer día incluido en la ventana (hoy − N años) o null para toda la historia. */
export function windowStart(w: Window, today: string): string | null {
  if (w === 'all') return null;
  const d = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - (w === '5y' ? 5 : 10));
  return d.toISOString().slice(0, 10);
}

const levelOf = (los: readonly number[], v: number) => { let k = 0; while (k + 1 < los.length && v >= los[k + 1]) k++; return k; };

/**
 * Agrupa los días por banda del BHT o por nivel del CAPE (`capeByDate`) y resume sus retornos a 1 y 3 años del activo.
 * Solo cuentan días con retorno a 1 año ya maduro; el de 3 años se resume con los que ya lo tienen.
 */
export function bandReturns(rows: FwdRow[], o: { asset: Asset; window: Window; today: string; by: 'bht' | 'cape'; capeByDate?: Map<string, number> }): BandRow[] {
  const from = windowStart(o.window, o.today);
  const bands = o.by === 'bht' ? MATRIX_BANDS.map((b) => ({ lo: b.lo as number, range: b.range as string })) : CAPE_LEVELS.map((b) => ({ lo: b.lo as number, range: b.range as string }));
  const los = bands.map((b) => b.lo);
  const y1: number[][] = bands.map(() => []), y3: number[][] = bands.map(() => []);
  const dts: string[][] = bands.map(() => []);
  let total = 0;
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    if (from && d < from) continue;
    const r1 = r[`${o.asset}1y`];
    if (r1 == null) continue;
    const x = o.by === 'bht' ? r.bhtValue : o.capeByDate?.get(d) ?? null;
    if (x == null) continue;
    const k = levelOf(los, x);
    y1[k].push(r1);
    dts[k].push(d);
    const r3 = r[`${o.asset}3y`];
    if (r3 != null) y3[k].push(r3);
    total++;
  }
  return bands.map((b, k) => {
    const s3 = stat(y3[k]);
    const days = y1[k].length;
    const w = densestWindow(dts[k]);
    const rest = w ? y1[k].filter((_, q) => q < w.j || q > w.i) : [];
    const share = w && days ? w.n / days : 0;
    return {
      dense: w ? { from: dts[k][w.j].slice(0, 4), to: dts[k][w.i].slice(0, 4), share } : null,
      y1Without: rest.length ? rest.reduce((m, x) => m + x, 0) / rest.length : null,
      thin: share >= 0.45,
      key: k, range: b.range, days: y1[k].length, pctTime: total ? (y1[k].length / total) * 100 : 0,
      y1: stat(y1[k]), y3: s3,
      cagr3: s3 ? (Math.pow(Math.max(0, 1 + s3.avg / 100), 1 / 3) - 1) * 100 : null,
    };
  });
}
