import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';

export interface ITickerRepository {
  findAll(): Promise<Ticker[]>;
  findBySymbol(symbol: string): Promise<Ticker | null>;
  findHistoricalPrices(tickerId: string, limit?: number): Promise<HistoricalPrice[]>;
  updateValuationMetrics(tickerId: string, data: Partial<Ticker>): Promise<void>;
  saveHistoricalPrices(tickerId: string, prices: { date: Date; open: number; high: number; low: number; close: number; adjClose: number; volume: bigint }[]): Promise<void>;
  clearHistoricalPrices(tickerId: string): Promise<void>;
  findLatestSnapshot(symbol: string): Promise<any | null>;
}

export const ITickerRepositorySymbol = Symbol('ITickerRepository');
