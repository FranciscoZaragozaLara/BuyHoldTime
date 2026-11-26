import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';
import type { Close } from '../../domain/price-levels';
import type { QuarterRevenue } from '../../domain/revenue-ttm';

export interface ITickerRepository {
  findAll(): Promise<Ticker[]>;
  /** Listado sin series históricas (historicalEps, historicalDividends, historicalEpsQuarterly). */
  findAllSummary(): Promise<Ticker[]>;
  findBySymbol(symbol: string): Promise<Ticker | null>;
  findHistoricalPrices(tickerId: string, limit?: number): Promise<HistoricalPrice[]>;
  updateValuationMetrics(tickerId: string, data: Partial<Ticker>): Promise<void>;
  saveHistoricalPrices(tickerId: string, prices: { date: Date; open: number; high: number; low: number; close: number; adjClose: number; volume: bigint }[]): Promise<void>;
  clearHistoricalPrices(tickerId: string): Promise<void>;
  findLatestSnapshot(symbol: string): Promise<any | null>;
  /** Fecha del cierre diario más reciente de historical_prices (clave de la caché de niveles de la lista). */
  latestCloseDate(): Promise<string | null>;
  /** Cierres diarios de todos los tickers, por símbolo y ordenados por fecha. */
  findAllCloses(): Promise<Map<string, Close[]>>;
  /** Ingresos trimestrales de EDGAR (historical_eps_quarterly) de todos los tickers, por símbolo. */
  findAllQuarterlyRevenue(): Promise<Map<string, QuarterRevenue[]>>;
}

export const ITickerRepositorySymbol = Symbol('ITickerRepository');
