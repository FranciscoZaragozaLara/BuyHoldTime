import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey']
});

async function testExtract(symbol: string) {
  console.log(`\n==============================================`);
  console.log(`EXTRACTING REAL DATA FOR TICKER: ${symbol}`);
  console.log(`==============================================`);

  try {
    // 1. Fetch live metrics from Yahoo Finance
    console.log('-> Querying current quote and key statistics...');
    const quote = (await yahooFinance.quote(symbol)) as any;
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData'],
    })) as any;

    // Extract metrics mapping to our new schema
    const metrics = {
      price: quote.regularMarketPrice,
      changePercent: quote.regularMarketChangePercent,
      eps: quote.epsTrailingTwelveMonths,
      forwardPe: quote.forwardPE || summary.summaryDetail?.forwardPE,
      trailingPe: quote.trailingPE || summary.summaryDetail?.trailingPE,
      pegRatio: summary.defaultKeyStatistics?.pegRatio,
      enterpriseValue: summary.defaultKeyStatistics?.enterpriseValue,
      avgVolume: quote.averageDailyVolume3Month || summary.summaryDetail?.averageVolume,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      dividendRate: summary.summaryDetail?.dividendRate || quote.trailingAnnualDividendRate,
      bookValue: summary.defaultKeyStatistics?.bookValue,
    };

    console.log('✓ Successfully retrieved valuation metrics:');
    console.table(metrics);

    // 2. Fetch complete daily historical data since 1997
    console.log('\n-> Downloading daily historical chart since 1997...');
    const todayStr = new Date().toISOString().split('T')[0];
    const history = (await yahooFinance.historical(symbol, {
      period1: '1997-01-01',
      period2: todayStr,
    })) as any;

    const totalDays = history.length;
    console.log(`✓ Retried historical dataset: ${totalDays} daily candles.`);

    if (totalDays > 0) {
      const oldestRecord = history[0];
      const newestRecord = history[totalDays - 1];

      console.log('\nSample Historical Records:');
      console.log('Oldest available date in database query:');
      console.log({
        date: oldestRecord.date.toISOString().split('T')[0],
        open: oldestRecord.open,
        high: oldestRecord.high,
        low: oldestRecord.low,
        close: oldestRecord.close,
        adjClose: oldestRecord.adjClose,
        volume: oldestRecord.volume,
      });

      console.log('\nNewest record:');
      console.log({
        date: newestRecord.date.toISOString().split('T')[0],
        open: newestRecord.open,
        high: newestRecord.high,
        low: newestRecord.low,
        close: newestRecord.close,
        adjClose: newestRecord.adjClose,
        volume: newestRecord.volume,
      });

      // Split analysis: Show if there is adjustment differences between close and adjClose
      const splitDiffs = history.filter((h: any) => Math.abs(h.close - h.adjClose) > 0.01);
      console.log(`\nAnalysis: Split-adjusted days (close != adjClose): ${splitDiffs.length} / ${totalDays} days.`);
      if (splitDiffs.length > 0) {
        console.log('Example of split impact (unadjusted vs adjusted):');
        console.log({
          date: splitDiffs[0].date.toISOString().split('T')[0],
          rawClose: splitDiffs[0].close,
          adjustedClose: splitDiffs[0].adjClose,
          ratio: (splitDiffs[0].close / splitDiffs[0].adjClose).toFixed(4),
        });
      }
    }

  } catch (error) {
    console.error(`Error extracting data for ${symbol}:`, error);
  }
}

async function main() {
  await testExtract('AAPL');
  await testExtract('MSFT');
}

main().catch(console.error);
