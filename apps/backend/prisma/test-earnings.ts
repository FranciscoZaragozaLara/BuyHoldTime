import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey']
});

async function main() {
  const symbol = 'MSFT';
  try {
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: ['incomeStatementHistory', 'defaultKeyStatistics'],
    })) as any;

    console.log('=== INCOME STATEMENT HISTORY ===');
    console.log(JSON.stringify(summary.incomeStatementHistory, null, 2));

    console.log('\n=== DEFAULT KEY STATISTICS ===');
    console.log(JSON.stringify(summary.defaultKeyStatistics, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
