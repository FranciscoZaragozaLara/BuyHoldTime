import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';

export interface TickerDetailsDto {
  ticker: Ticker;
  historicalPrices: HistoricalPrice[];
  snapshot?: any;
}

@Injectable()
export class GetTickerDetailsUseCase {
  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
  ) {}

  async execute(symbol: string, limit?: number): Promise<TickerDetailsDto> {
    const ticker = await this.tickerRepository.findBySymbol(symbol.toUpperCase());
    if (!ticker) {
      throw new NotFoundException(`Ticker with symbol ${symbol} not found`);
    }

    const historicalPrices = await this.tickerRepository.findHistoricalPrices(ticker.id, limit);
    const snapshot = await this.tickerRepository.findLatestSnapshot(symbol);

    return {
      ticker,
      historicalPrices,
      snapshot: snapshot || null,
    };
  }
}
