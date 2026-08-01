import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import YahooFinance from 'yahoo-finance2';

@Injectable()
export class SyncTickersUseCase {
  private readonly logger = new Logger(SyncTickersUseCase.name);
  private readonly yahooFinance: any;
  private readonly sectorPeCache: Record<string, Array<{ date: string; peRatio: number }>> = {};

  private async getSectorPe(sectorName: string, apiKey: string): Promise<Array<{ date: string; peRatio: number }>> {
    if (this.sectorPeCache[sectorName]) {
      return this.sectorPeCache[sectorName];
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const url = `https://financialmodelingprep.com/stable/historical-sector-pe?sector=${encodeURIComponent(sectorName)}&from=1997-01-01&to=${todayStr}&apikey=${apiKey}`;
    try {
      this.logger.log(`Fetching historical sector PE for ${sectorName}...`);
      const response = await fetch(url);
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map((item: any) => ({
          date: item.date,
          peRatio: Number(item.pe || item.peRatio || 0),
        }));
        this.sectorPeCache[sectorName] = mapped;
        return mapped;
      }
    } catch (err) {
      this.logger.error(`Failed to fetch sector PE for ${sectorName}: ${err.message}`);
    }
    return [];
  }

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
        const todayStr = new Date().toISOString().split('T')[0];
        // 1. Fetch Quote and summary details from Yahoo Finance
        const quote = (await this.yahooFinance.quote(symbol)) as any;
        let summary: any = {};
        try {
          summary = (await this.yahooFinance.quoteSummary(symbol, {
            modules: ['defaultKeyStatistics', 'summaryDetail', 'earnings', 'incomeStatementHistory', 'earningsHistory'],
          })) as any;
        } catch (summaryErr) {
          this.logger.warn(`Failed to fetch quoteSummary for ${symbol}, falling back to basic quote details.`);
        }

        // Fetch historical dividends list
        let historicalDividendsList: any[] = [];
        try {
          historicalDividendsList = (await this.yahooFinance.historical(symbol, {
            period1: '1997-01-01',
            period2: todayStr,
            events: 'dividends',
          })) as any;
        } catch (divErr) {
          this.logger.warn(`Failed to fetch historical dividends for ${symbol}: ${divErr.message}`);
        }

        if (!quote) {
          throw new Error(`No quote data returned from Yahoo Finance for ${symbol}`);
        }

        // 2. Fetch/Update historical prices
        const dbPrices = await this.tickerRepository.findHistoricalPrices(ticker.id);

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

        // =========================================================
        // Build historicalEpsQuarterly: [{date, eps, source}] sorted desc
        // The frontend will compute TTM for any date by summing the 4
        // most recent quarters with date <= target date.
        // =========================================================
        type QuarterEntry = {
          date: string;
          period: string;
          fiscalYear: string;
          revenue: number;
          netIncome: number;
          eps: number;
          epsDiluted: number;
          sharesOutstanding: number;
          peRatio?: number | null;
          source: 'real' | 'estimated';
        };

        const fmpApiKey = 'aHWvhgdKuBbca6TnHQyXFDwe4w5I6ja5';
        const sym = ticker.symbol.toUpperCase();
        const isTickerFund = 
          ticker.sector === 'Index' || 
          ticker.sector === 'ETF' || 
          ticker.sector?.toLowerCase().includes('etf') || 
          ticker.sector?.toLowerCase().includes('fund') || 
          sym === 'QQQ' || sym === 'VOO' || sym === 'SCHD';

        let historicalEpsQuarterly: QuarterEntry[] = [];
        let realQuartersCount = 0;

        if (isTickerFund) {
          // Keep existing historicalEpsQuarterly if it was already seeded/populated manually for QQQ, TQQQ, VOO, SPY
          const manuallySeeded = ['QQQ', 'TQQQ', 'VOO', 'SPY'];
          if (manuallySeeded.includes(sym) && ticker.historicalEpsQuarterly && (ticker.historicalEpsQuarterly as any[]).length > 0) {
            historicalEpsQuarterly = ticker.historicalEpsQuarterly as any[];
            realQuartersCount = historicalEpsQuarterly.length;
          } else {
            // Fund sector mapping to fetch real P/E ratios from FMP historical sector P/E
            let sectorsToFetch: string[] = [];
          if (sym === 'QQQ' || sym === 'TQQQ') {
            sectorsToFetch = ['Technology'];
          } else if (sym === 'SCHD') {
            sectorsToFetch = ['Financial Services', 'Industrials', 'Healthcare'];
          } else if (sym === 'VOO' || sym === 'SPY' || ticker.sector === 'Index') {
            sectorsToFetch = ['Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical'];
          } else {
            sectorsToFetch = [ticker.sector || 'Technology'];
          }

          // Fetch sector lists
          const sectorLists: Array<Array<{ date: string; peRatio: number }>> = [];
          for (const sect of sectorsToFetch) {
            const list = await this.getSectorPe(sect, fmpApiKey);
            if (list.length > 0) {
              sectorLists.push(list);
            }
          }

          const getPeForDate = (targetDateStr: string): number => {
            if (sectorLists.length === 0) return 0;
            const targetTime = new Date(targetDateStr).getTime();
            let sumPe = 0;
            let count = 0;
            
            for (const list of sectorLists) {
              let closestPe = list[0].peRatio;
              let minDiff = Math.abs(new Date(list[0].date).getTime() - targetTime);
              
              for (const item of list) {
                const diff = Math.abs(new Date(item.date).getTime() - targetTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestPe = item.peRatio;
                }
              }
              if (closestPe > 0) {
                sumPe += closestPe;
                count++;
              }
            }
            return count > 0 ? sumPe / count : 0;
          };

          const generatedQuarters: QuarterEntry[] = [];
          const today = new Date();
          const currentYear = today.getFullYear();
          
          for (let yr = 1997; yr <= currentYear; yr++) {
            const qConfigs = [
              { period: 'Q1', dateStr: `${yr}-03-31` },
              { period: 'Q2', dateStr: `${yr}-06-30` },
              { period: 'Q3', dateStr: `${yr}-09-30` },
              { period: 'Q4', dateStr: `${yr}-12-31` }
            ];
            for (const q of qConfigs) {
              const qDate = new Date(q.dateStr + 'T12:00:00');
              if (qDate > today) continue;
              
              const realSectorPe = getPeForDate(q.dateStr);
              
              generatedQuarters.push({
                date: q.dateStr,
                period: q.period,
                fiscalYear: String(yr),
                revenue: 0,
                netIncome: 0,
                eps: 0,
                epsDiluted: 0,
                sharesOutstanding: 0,
                peRatio: realSectorPe > 0 ? parseFloat(realSectorPe.toFixed(4)) : null,
                source: 'real',
              });
            }
          }
          // Ensure current active month entry is updated dynamically with today's live P/E ratio from Yahoo Finance quote
          const todayEndStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
          const currentPeLive = quote.trailingPE || summary?.summaryDetail?.trailingPE || (quote.regularMarketPrice && eps ? quote.regularMarketPrice / eps : null);
          
          if (currentPeLive && currentPeLive > 0) {
            const existingIdx = generatedQuarters.findIndex(q => q.date === todayEndStr);
            const liveEntry: QuarterEntry = {
              date: todayEndStr,
              period: `M${String(today.getMonth() + 1).padStart(2, '0')}`,
              fiscalYear: String(today.getFullYear()),
              revenue: 0,
              netIncome: 0,
              eps: parseFloat(((quote.regularMarketPrice || ticker.price) / currentPeLive).toFixed(4)),
              epsDiluted: parseFloat(((quote.regularMarketPrice || ticker.price) / currentPeLive).toFixed(4)),
              sharesOutstanding: 0,
              peRatio: parseFloat(Number(currentPeLive).toFixed(4)),
              source: 'real',
            };

            if (existingIdx >= 0) {
              generatedQuarters[existingIdx] = liveEntry;
            } else {
              generatedQuarters.push(liveEntry);
            }
          }

          historicalEpsQuarterly = generatedQuarters.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          realQuartersCount = historicalEpsQuarterly.length;
          }

        } else {
          // Standard corporate ticker income statements from FMP
          const quarterMap: Map<string, QuarterEntry> = new Map();
          const fmpUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=quarter&apikey=${fmpApiKey}`;
          
          try {
            this.logger.log(`Fetching quarterly income statement from FMP for ${ticker.symbol}`);
            const response = await fetch(fmpUrl);
            const fmpData = await response.json() as any;

            if (Array.isArray(fmpData)) {
              for (const item of fmpData) {
                if (item.date && item.eps !== undefined) {
                  const dateStr = item.date;
                  quarterMap.set(dateStr, {
                    date: dateStr,
                    period: item.period || 'Q',
                    fiscalYear: String(item.fiscalYear || ''),
                    revenue: Number(item.revenue || 0),
                    netIncome: Number(item.netIncome || 0),
                    eps: Number(item.eps || 0),
                    epsDiluted: Number(item.epsDiluted || item.eps || 0),
                    sharesOutstanding: Number(item.weightedAverageShsOutDil || item.weightedAverageShsOut || 0),
                    source: 'real',
                  });
                }
              }
            } else if (fmpData && fmpData.Error) {
              this.logger.warn(`FMP API returned an error for ${ticker.symbol}: ${fmpData.Error}`);
            }
          } catch (fmpErr: any) {
            this.logger.error(`Failed to fetch quarterly statement from FMP for ${ticker.symbol}: ${fmpErr.message}`);
          }

          const realQuarters = Array.from(quarterMap.values()).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          this.logger.log(`${ticker.symbol}: ${realQuarters.length} FMP real quarters [${realQuarters.map(q => q.date).join(', ')}]`);
          realQuartersCount = realQuarters.length;

          // CAGR backward estimation for corporate pre-FMP quarters
          let quarterlyGrowthRate = 0.02;
          const sectorLower = (ticker.sector || '').toLowerCase();
          let annualRate = 0.08;
          if (sectorLower.includes('technology')) annualRate = 0.12;
          else if (sectorLower.includes('financial') || sectorLower.includes('energy')) annualRate = 0.06;
          quarterlyGrowthRate = Math.pow(1 + annualRate, 0.25) - 1;

          if (realQuarters.length >= 2) {
            const oldestReal = realQuarters[0];
            const newestReal = realQuarters[realQuarters.length - 1];
            const quartersSpan = (new Date(newestReal.date).getTime() - new Date(oldestReal.date).getTime()) / (90 * 24 * 60 * 60 * 1000);
            if (quartersSpan > 0 && oldestReal.epsDiluted > 0 && newestReal.epsDiluted > 0) {
              const calculatedGrowth = Math.pow(newestReal.epsDiluted / oldestReal.epsDiluted, 1 / quartersSpan) - 1;
              quarterlyGrowthRate = Math.max(-0.04, Math.min(0.08, calculatedGrowth));
            }
          }

          if (realQuarters.length > 0) {
            const oldestReal = realQuarters[0];
            const oldestRealDate = new Date(oldestReal.date);
            const startDate = new Date('1997-03-31');

            const estimatedDates: Date[] = [];
            let d = new Date(oldestRealDate);
            d.setMonth(d.getMonth() - 3);
            while (d >= startDate) {
              estimatedDates.push(new Date(d));
              d.setMonth(d.getMonth() - 3);
            }

            for (let i = 0; i < estimatedDates.length; i++) {
              const qDate = estimatedDates[i];
              const dateStr = qDate.toISOString().split('T')[0];
              if (!quarterMap.has(dateStr)) {
                const quartersBack = i + 1;
                const estimatedEpsDil = oldestReal.epsDiluted / Math.pow(1 + quarterlyGrowthRate, quartersBack);
                const estimatedEpsBas = oldestReal.eps / Math.pow(1 + quarterlyGrowthRate, quartersBack);
                const estimatedRev = oldestReal.revenue / Math.pow(1 + quarterlyGrowthRate, quartersBack);
                const estimatedNet = oldestReal.netIncome / Math.pow(1 + quarterlyGrowthRate, quartersBack);

                const month = qDate.getMonth() + 1;
                let period = 'Q4';
                if (month <= 3) period = 'Q1';
                else if (month <= 6) period = 'Q2';
                else if (month <= 9) period = 'Q3';

                if (estimatedEpsDil > 0 && isFinite(estimatedEpsDil)) {
                  quarterMap.set(dateStr, {
                    date: dateStr,
                    period,
                    fiscalYear: String(qDate.getFullYear()),
                    revenue: Math.round(estimatedRev),
                    netIncome: Math.round(estimatedNet),
                    eps: parseFloat(estimatedEpsBas.toFixed(4)),
                    epsDiluted: parseFloat(estimatedEpsDil.toFixed(4)),
                    sharesOutstanding: oldestReal.sharesOutstanding,
                    source: 'estimated',
                  });
                }
              }
            }
          }

          historicalEpsQuarterly = Array.from(quarterMap.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        }

        this.logger.log(`${ticker.symbol}: total quarters stored: ${historicalEpsQuarterly.length}`);

        // Keep historicalEps (annual) for backwards compatibility
        const historicalEps: Record<string, { value: number; source: 'real' | 'estimated' }> = {};
        if (realQuartersCount > 0) {
          // Build annual TTM EPS from quarterly data for recent years
          for (let yr = 1997; yr <= new Date().getFullYear(); yr++) {
            // TTM at Dec 31 of each year
            const targetDate = new Date(`${yr}-12-31`);
            const relevant = historicalEpsQuarterly
              .filter(q => new Date(q.date) <= targetDate)
              .slice(0, 4);
            if (relevant.length === 4) {
              const ttm = parseFloat(relevant.reduce((s, q) => s + q.epsDiluted, 0).toFixed(2));
              const allReal = relevant.every(q => q.source === 'real');
              historicalEps[String(yr)] = { value: ttm, source: allReal ? 'real' : 'estimated' };
            }
          }
        }

        const historicalDividends: Record<string, number> = {};
        if (historicalDividendsList && historicalDividendsList.length > 0) {
          for (const item of historicalDividendsList) {
            const dateStr = new Date(item.date).toISOString().split('T')[0];
            historicalDividends[dateStr] = parseFloat(item.dividends.toFixed(4));
          }
        }

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
          historicalEps,
          historicalDividends,
          historicalEpsQuarterly: (historicalEpsQuarterly && historicalEpsQuarterly.length > 0) 
            ? historicalEpsQuarterly 
            : (ticker.historicalEpsQuarterly as any[] || []),
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
