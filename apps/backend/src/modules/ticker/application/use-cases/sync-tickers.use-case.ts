import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import YahooFinance from 'yahoo-finance2';

@Injectable()
export class SyncTickersUseCase {
  private readonly logger = new Logger(SyncTickersUseCase.name);
  private readonly yahooFinance: any;

  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
  ) {
    this.yahooFinance = new YahooFinance({
      suppressNotices: ['ripHistorical', 'yahooSurvey'],
    });
  }

  async execute(): Promise<{ success: boolean; updatedCount: number; errors: string[] }> {
    const tickers = await this.tickerRepository.findAll();
    this.logger.log(`Starting sync for ${tickers.length} tickers...`);

    let updatedCount = 0;
    const errors: string[] = [];

    for (const ticker of tickers) {
      // Index is global, skip indexing sync for indices if they don't have typical stock quotes,
      // but Yahoo Finance has SPY, QQQ, VOO, etc. so we can sync them too!
      const symbol = ticker.symbol.replace('.', '-'); // Handle BRK.B -> BRK-B for Yahoo Finance
      this.logger.log(`Syncing ${ticker.symbol} (Yahoo ID: ${symbol})...`);

      try {
        // 1. Fetch Quote and summary details from Yahoo Finance
        const quote = (await this.yahooFinance.quote(symbol)) as any;
        let summary: any = {};
        try {
          summary = (await this.yahooFinance.quoteSummary(symbol, {
            modules: ['defaultKeyStatistics', 'summaryDetail'],
          })) as any;
        } catch (summaryErr) {
          this.logger.warn(`Failed to fetch quoteSummary for ${symbol}, falling back to basic quote details.`);
        }

        if (!quote) {
          throw new Error(`No quote data returned from Yahoo Finance for ${symbol}`);
        }

        // 2. Fetch/Update historical prices
        const dbPrices = await this.tickerRepository.findHistoricalPrices(ticker.id);
        const todayStr = new Date().toISOString().split('T')[0];

        let shouldReDownloadFullHistory = false;
        let startDateStr = '1997-01-01';

        if (dbPrices.length > 0) {
          // Perform split validation: pick up to 3 random dates from dbPrices
          const sampleCount = Math.min(3, dbPrices.length);
          const sampleIndices = new Set<number>();
          while (sampleIndices.size < sampleCount) {
            sampleIndices.add(Math.floor(Math.random() * dbPrices.length));
          }

          let splitDetected = false;
          for (const index of sampleIndices) {
            const dbPrice = dbPrices[index];
            const dateStr = dbPrice.date.toISOString().split('T')[0];
            const nextDay = new Date(dbPrice.date.getTime() + 24 * 60 * 60 * 1000);
            const nextDayStr = nextDay.toISOString().split('T')[0];

            try {
              const yHist = await this.yahooFinance.historical(symbol, {
                period1: dateStr,
                period2: nextDayStr,
              });

              if (yHist && yHist.length > 0) {
                const yahooClose = yHist[0].close;
                const variance = Math.abs((dbPrice.close - yahooClose) / dbPrice.close);
                
                if (variance > 0.15) {
                  this.logger.warn(
                    `Split detected for ${ticker.symbol} on ${dateStr}. DB Close: ${dbPrice.close}, Yahoo Close: ${yahooClose} (variance: ${(variance * 100).toFixed(2)}%)`,
                  );
                  splitDetected = true;
                  break;
                }
              }
            } catch (err) {
              this.logger.debug(`Could not verify split on ${dateStr} for ${ticker.symbol}: ${err.message}`);
            }
          }

          if (splitDetected) {
            shouldReDownloadFullHistory = true;
          } else {
            // No split, do incremental download
            const newestPrice = dbPrices[dbPrices.length - 1];
            // Format newest date
            startDateStr = newestPrice.date.toISOString().split('T')[0];
          }
        } else {
          // DB is empty
          shouldReDownloadFullHistory = true;
        }

        if (shouldReDownloadFullHistory) {
          this.logger.log(`Downloading full history (since 1997) for ${ticker.symbol}...`);
          if (dbPrices.length > 0) {
            await this.tickerRepository.clearHistoricalPrices(ticker.id);
          }
          startDateStr = '1997-01-01';
        } else {
          this.logger.log(`Incremental sync for ${ticker.symbol} from ${startDateStr} to ${todayStr}...`);
        }

        // Fetch history from Yahoo Finance
        const history = await this.yahooFinance.historical(symbol, {
          period1: startDateStr,
          period2: todayStr,
        });

        if (history && history.length > 0) {
          const pricesToSave = history
            .filter((h: any) => h.open != null && h.close != null && h.high != null && h.low != null)
            .map((h: any) => ({
              date: new Date(h.date),
              open: h.open,
              high: h.high,
              low: h.low,
              close: h.close,
              adjClose: h.adjClose ?? h.close,
              volume: BigInt(h.volume ?? 0),
            }));

          await this.tickerRepository.saveHistoricalPrices(ticker.id, pricesToSave);
          this.logger.log(`Saved ${pricesToSave.length} price records for ${ticker.symbol}`);
        }

        // 3. Update valuation metrics in Ticker table
        const pe = quote.trailingPE || summary?.summaryDetail?.trailingPE || 0;
        const dy = (summary?.summaryDetail?.dividendYield || quote.trailingAnnualDividendYield || 0) * 100; // Convert to percentage e.g. 0.012 -> 1.2
        const capNum = quote.marketCap || summary?.summaryDetail?.marketCap || 0;
        
        // Format Market Cap to readable string (e.g. 2.8T, 500B, 50M)
        let capStr = 'N/A';
        if (capNum >= 1e12) {
          capStr = `${(capNum / 1e12).toFixed(1)}T`;
        } else if (capNum >= 1e9) {
          capStr = `${(capNum / 1e9).toFixed(1)}B`;
        } else if (capNum >= 1e6) {
          capStr = `${(capNum / 1e6).toFixed(1)}M`;
        } else if (capNum > 0) {
          capStr = capNum.toString();
        }

        // Calculate Buy/Hold Index based on dynamic formula
        let buyHoldIndex = 70; // Baseline
        if (pe > 0) {
          if (pe < 15) buyHoldIndex += 15;
          else if (pe < 25) buyHoldIndex += 10;
          else if (pe < 40) buyHoldIndex += 5;
          else if (pe > 60) buyHoldIndex -= 15;
          else buyHoldIndex -= 5;
        }
        if (dy > 0) {
          if (dy > 3.0) buyHoldIndex += 10;
          else if (dy > 1.5) buyHoldIndex += 5;
        }
        // Incorporate recent performance trend
        const change = quote.regularMarketChangePercent || 0;
        buyHoldIndex += Math.round(change);
        
        // Clamp index
        buyHoldIndex = Math.max(10, Math.min(98, buyHoldIndex));

        let recommendation = 'Hold';
        if (buyHoldIndex >= 85) recommendation = 'Strong Buy';
        else if (buyHoldIndex >= 75) recommendation = 'Buy';
        else if (buyHoldIndex >= 45) recommendation = 'Hold';
        else if (buyHoldIndex >= 30) recommendation = 'Sell';
        else recommendation = 'Strong Sell';

        // Valuation data fields
        const eps = quote.epsTrailingTwelveMonths || null;
        const forwardPe = quote.forwardPE || summary?.summaryDetail?.forwardPE || null;
        const trailingPe = quote.trailingPE || summary?.summaryDetail?.trailingPE || null;
        const pegRatio = summary?.defaultKeyStatistics?.pegRatio || null;
        const enterpriseValue = summary?.defaultKeyStatistics?.enterpriseValue || null;
        const avgVolume = quote.averageDailyVolume3Month || summary?.summaryDetail?.averageVolume || null;
        const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || null;
        const fiftyTwoWeekLow = quote.fiftyTwoWeekLow || null;
        const dividendRate = summary?.summaryDetail?.dividendRate || quote.trailingAnnualDividendRate || null;
        const bookValue = summary?.defaultKeyStatistics?.bookValue || null;

        await this.tickerRepository.updateValuationMetrics(ticker.id, {
          price: quote.regularMarketPrice ?? ticker.price,
          changePercent: quote.regularMarketChangePercent ?? ticker.changePercent,
          pe: pe || ticker.pe,
          dy: dy || ticker.dy,
          cap: capStr !== 'N/A' ? capStr : ticker.cap,
          buyHoldIndex,
          recommendation,
          eps,
          forwardPe,
          trailingPe,
          pegRatio,
          enterpriseValue,
          avgVolume,
          fiftyTwoWeekHigh,
          fiftyTwoWeekLow,
          dividendRate,
          bookValue,
        });

        updatedCount++;
        this.logger.log(`Successfully completed sync for ${ticker.symbol}`);

      } catch (err) {
        this.logger.error(`Error syncing ticker ${ticker.symbol}: ${err.message}`, err.stack);
        errors.push(`${ticker.symbol}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  }
}
