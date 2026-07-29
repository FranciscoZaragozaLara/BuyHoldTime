import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import YahooFinance from 'yahoo-finance2';

@Injectable()
export class FastSyncTickersUseCase {
  private readonly logger = new Logger(FastSyncTickersUseCase.name);
  private readonly yahooFinance: any;

  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
  ) {
    this.yahooFinance = new YahooFinance({
      suppressNotices: ['ripHistorical', 'yahooSurvey'],
    });
  }

  /**
   * Fast sync live price quote for a single ticker (takes ~150ms)
   */
  async executeSingle(symbol: string): Promise<Ticker | null> {
    const cleanSymbol = symbol.toUpperCase();
    const yahooSymbol = cleanSymbol.replace('.', '-'); // e.g. BRK.B -> BRK-B

    const existingTicker = await this.tickerRepository.findBySymbol(cleanSymbol);
    if (!existingTicker) {
      this.logger.warn(`Cannot fast sync ${cleanSymbol}: ticker not found in DB`);
      return null;
    }

    try {
      this.logger.log(`Fast syncing live quote for ${cleanSymbol}...`);
      const quote = (await this.yahooFinance.quote(yahooSymbol)) as any;
      if (!quote || quote.regularMarketPrice == null) {
        this.logger.warn(`No live quote price returned from Yahoo Finance for ${cleanSymbol}`);
        return existingTicker;
      }

      const price = quote.regularMarketPrice;
      const changePercent = quote.regularMarketChangePercent || 0;
      const capNum = quote.marketCap || 0;

      let capStr = existingTicker.cap;
      if (capNum >= 1e12) {
        capStr = `${(capNum / 1e12).toFixed(1)}T`;
      } else if (capNum >= 1e9) {
        capStr = `${(capNum / 1e9).toFixed(1)}B`;
      } else if (capNum >= 1e6) {
        capStr = `${(capNum / 1e6).toFixed(1)}M`;
      }

      const pe = quote.trailingPE || existingTicker.pe;
      const forwardPe = quote.forwardPE || existingTicker.forwardPe;
      const avgVolume = quote.averageDailyVolume3Month || existingTicker.avgVolume;
      const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || existingTicker.fiftyTwoWeekHigh;
      const fiftyTwoWeekLow = quote.fiftyTwoWeekLow || existingTicker.fiftyTwoWeekLow;

      await this.tickerRepository.updateValuationMetrics(existingTicker.id, {
        price,
        changePercent,
        pe,
        cap: capStr,
        forwardPe,
        avgVolume,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
      });

      this.logger.log(`Fast sync completed for ${cleanSymbol}: $${price} (${changePercent.toFixed(2)}%)`);

      // Return updated ticker
      return await this.tickerRepository.findBySymbol(cleanSymbol);
    } catch (err: any) {
      this.logger.error(`Error fast syncing ${cleanSymbol}: ${err.message}`);
      return existingTicker;
    }
  }

  /**
   * Fast sync live price quotes for multiple or all tickers (~2-3 seconds total)
   */
  async executeAll(symbols?: string[]): Promise<{ updatedCount: number; errors: string[] }> {
    let targetTickers: Ticker[] = [];
    if (symbols && symbols.length > 0) {
      for (const sym of symbols) {
        const t = await this.tickerRepository.findBySymbol(sym.toUpperCase());
        if (t) targetTickers.push(t);
      }
    } else {
      targetTickers = await this.tickerRepository.findAll();
    }

    this.logger.log(`Starting fast live sync for ${targetTickers.length} tickers...`);

    let updatedCount = 0;
    const errors: string[] = [];

    // Process in small parallel chunks of 5 for optimal performance
    const chunkSize = 5;
    for (let i = 0; i < targetTickers.length; i += chunkSize) {
      const chunk = targetTickers.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (t) => {
          try {
            const updated = await this.executeSingle(t.symbol);
            if (updated) updatedCount++;
          } catch (err: any) {
            errors.push(`${t.symbol}: ${err.message}`);
          }
        })
      );
    }

    this.logger.log(`Fast live sync completed: ${updatedCount} tickers updated`);
    return { updatedCount, errors };
  }
}
