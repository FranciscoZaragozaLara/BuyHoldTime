import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';
import { FastSyncTickersUseCase } from './fast-sync-tickers.use-case';

export interface TickerDetailsDto {
  ticker: Ticker;
  historicalPrices: HistoricalPrice[];
  snapshot?: any;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

@Injectable()
export class GetTickerDetailsUseCase {
  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
    private readonly fastSyncTickersUseCase: FastSyncTickersUseCase,
  ) {}

  async execute(symbol: string, limit?: number): Promise<TickerDetailsDto> {
    const cleanSymbol = symbol.toUpperCase();
    let ticker = await this.tickerRepository.findBySymbol(cleanSymbol);
    if (!ticker) {
      throw new NotFoundException(`Ticker with symbol ${symbol} not found`);
    }

    // Auto-refresh live price if stored updatedAt is older than 15 minutes
    const ageMs = Date.now() - new Date(ticker.updatedAt).getTime();
    if (ageMs > FIFTEEN_MINUTES_MS) {
      const refreshed = await this.fastSyncTickersUseCase.executeSingle(cleanSymbol);
      if (refreshed) {
        ticker = refreshed;
      }
      // Asynchronously trigger fast sync for ALL 67 tickers in background (~3.5s total)
      this.fastSyncTickersUseCase.executeAll().catch(() => {});
    }

    const historicalPrices = await this.tickerRepository.findHistoricalPrices(ticker.id, limit);
    const snapshot = await this.tickerRepository.findLatestSnapshot(cleanSymbol);

    return {
      ticker,
      historicalPrices,
      snapshot: snapshot || null,
    };
  }
}
