import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function main() {
  const symbol = 'AAPL';
  console.log(`=== FETCHING DATA FOR ${symbol} ===\n`);

  try {
    console.log('1. Fetching Quote (Basic market summary)...');
    const quote = (await yahooFinance.quote(symbol)) as any;
    
    console.log('Quote Keys available:', Object.keys(quote).slice(0, 15), '... (and more)');
    console.log('Sample quote values:');
    console.log({
      symbol: quote.symbol,
      shortName: quote.shortName,
      regularMarketPrice: quote.regularMarketPrice,
      regularMarketChangePercent: quote.regularMarketChangePercent,
      regularMarketVolume: quote.regularMarketVolume,
      averageDailyVolume3Month: quote.averageDailyVolume3Month,
      epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths,
      epsForward: quote.epsForward,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      trailingAnnualDividendYield: quote.trailingAnnualDividendYield,
      regularMarketOpen: quote.regularMarketOpen, // Apertura real
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    });

    console.log('\n2. Fetching QuoteSummary (Key Valuation Stats)...');
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData'],
    })) as any;

    console.log('Sample keyStatistics values:');
    console.log({
      enterpriseValue: summary.defaultKeyStatistics?.enterpriseValue,
      pegRatio: summary.defaultKeyStatistics?.pegRatio,
      bookValue: summary.defaultKeyStatistics?.bookValue,
      payoutRatio: summary.defaultKeyStatistics?.payoutRatio,
      trailingEps: summary.defaultKeyStatistics?.trailingEps,
    });

    console.log('Sample summaryDetail values:');
    console.log({
      dividendYield: summary.summaryDetail?.dividendYield,
      dividendRate: summary.summaryDetail?.dividendRate,
      trailingPE: summary.summaryDetail?.trailingPE,
      forwardPE: summary.summaryDetail?.forwardPE,
      priceToSalesTrailing12Months: summary.summaryDetail?.priceToSalesTrailing12Months,
    });

    console.log('\n3. Fetching Historical Prices (Short sample range)...');
    const history = (await yahooFinance.historical(symbol, {
      period1: '2026-05-20',
      period2: '2026-05-28',
    })) as any;

    console.log(`Historical prices returned: ${history.length} records`);
    if (history.length > 0) {
      console.log('Sample historical price record:', history[0]);
    }

  } catch (error) {
    console.error('Error fetching from Yahoo Finance:', error);
  }
}

main().catch(console.error);
