// Tabla `indicators`: filas cuyo valor actual sale de una serie de bt_market_data. Antes solo las
// escribía el seed (fed_rate 5.25, vix 13.4, fear_greed 62… congelados desde ago-2026); ahora se
// actualizan al terminar cada sincronización de mercado. schiller_pe, pe_ratio y fwd_pe_ratio los
// sigue escribiendo daily_update.py; las filas mensuales de Shiller (cpi, sp500_*, rate_gs10) no se tocan.
import { getClosestPrice, getCpiYoY, PriceMap } from '../backtesting/thermo-history';

export type IndicatorUpdate = { key: string; value: number; status: string; asOf: string };

/** Ticker de origen y cómo se lee: último valor o inflación interanual (series mensuales). */
export const INDICATOR_SOURCES: Record<string, { ticker: string; kind: 'last' | 'yoy' }> = {
  fed_rate: { ticker: 'DFEDTARU', kind: 'last' },
  treasury_30y: { ticker: 'DGS30', kind: 'last' },
  vix: { ticker: 'VIXCLS', kind: 'last' },
  fear_greed: { ticker: 'FEAR_GREED', kind: 'last' },
  inflation: { ticker: 'CPIAUCSL', kind: 'yoy' },
  core_inflation: { ticker: 'CPILFESL', kind: 'yoy' },
};

/** Etiqueta (mismo vocabulario que el seed: Low / Normal / High; Fear & Greed con las de CNN). */
export function indicatorStatus(key: string, v: number): string {
  switch (key) {
    case 'vix': return v < 15 ? 'Low' : v < 25 ? 'Normal' : 'High';
    case 'fear_greed': return v < 25 ? 'Extreme Fear' : v < 45 ? 'Fear' : v < 55 ? 'Neutral' : v < 75 ? 'Greed' : 'Extreme Greed';
    case 'fed_rate': return v <= 2 ? 'Low' : v <= 4 ? 'Normal' : 'High';
    case 'treasury_30y': return v < 3.5 ? 'Low' : v < 4.5 ? 'Normal' : 'High';
    case 'inflation': case 'core_inflation': return v < 2 ? 'Low' : v <= 3 ? 'Normal' : 'High';
    default: return 'Normal';
  }
}

/** Valores actuales a la fecha `today` a partir de las series (sin dato → la fila no se toca). */
export function indicatorUpdates(series: Record<string, PriceMap>, today: string): IndicatorUpdate[] {
  const out: IndicatorUpdate[] = [];
  for (const [key, src] of Object.entries(INDICATOR_SOURCES)) {
    const m = series[src.ticker];
    if (!m || m.size === 0) continue;
    const asOf = [...m.keys()].filter((d) => d <= today).sort().pop();
    if (!asOf) continue;
    const value = src.kind === 'yoy' ? getCpiYoY(m, asOf) : getClosestPrice(m, asOf, 1);
    if (value == null || !Number.isFinite(value)) continue;
    out.push({ key, value, status: indicatorStatus(key, value), asOf });
  }
  return out;
}

type Db = {
  btMarketData: { findMany(args: any): Promise<Array<{ ticker: string; date: Date; close: any }>> };
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
};

/** Lee las series (~16 meses, para el YoY del último CPI publicado) y actualiza las filas. Devuelve lo escrito. */
export async function syncIndicatorsTable(db: Db, now = new Date()): Promise<IndicatorUpdate[]> {
  const from = new Date(now.getTime() - 500 * 86400000); // CPI: último dato con ~1.5 meses de rezago + su mismo mes un año antes
  const rows = await db.btMarketData.findMany({
    where: { ticker: { in: [...new Set(Object.values(INDICATOR_SOURCES).map((s) => s.ticker))] }, date: { gte: from } },
    select: { ticker: true, date: true, close: true },
  });
  const series: Record<string, PriceMap> = {};
  for (const r of rows) {
    const v = Number(r.close);
    if (Number.isFinite(v)) (series[r.ticker] ??= new Map()).set(r.date.toISOString().slice(0, 10), v);
  }
  const ups = indicatorUpdates(series, now.toISOString().slice(0, 10));
  for (const u of ups) {
    await db.$executeRawUnsafe('UPDATE indicators SET current_value = $1, status = $2, updated_at = now() WHERE key = $3', u.value, u.status, u.key);
  }
  return ups;
}
