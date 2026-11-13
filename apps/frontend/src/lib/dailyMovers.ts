import { isFundTicker } from './isFund';

type Mover = { symbol: string; sector?: string | null; changePercent: number | null | undefined };

/**
 * Mayores alzas y caídas del día del listado (solo acciones: sin ETFs ni índices).
 * Alzas: cambio > 0, de mayor a menor. Caídas: cambio < 0, de la más fuerte a la menor.
 */
export function dailyMovers<T extends Mover>(tickers: T[], n = 3): { gainers: T[]; losers: T[] } {
  const stocks = tickers.filter((t) => !isFundTicker(t) && typeof t.changePercent === 'number' && Number.isFinite(t.changePercent));
  const gainers = stocks.filter((t) => (t.changePercent as number) > 0).sort((a, b) => (b.changePercent as number) - (a.changePercent as number)).slice(0, n);
  const losers = stocks.filter((t) => (t.changePercent as number) < 0).sort((a, b) => (a.changePercent as number) - (b.changePercent as number)).slice(0, n);
  return { gainers, losers };
}
