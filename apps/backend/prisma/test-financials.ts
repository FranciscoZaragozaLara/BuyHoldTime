import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey']
});

async function main() {
  const symbol = 'AAPL';
  console.log(`=== FETCHING HISTORICAL FINANCIALS FOR ${symbol} ===\n`);

  try {
    // 1. Fetch historical dividends since 1997
    console.log('-> Querying historical dividends since 1997...');
    const dividends = (await yahooFinance.historical(symbol, {
      period1: '1997-01-01',
      period2: new Date().toISOString().split('T')[0],
      events: 'dividends',
    })) as any;

    console.log(`✓ Retrieved ${dividends.length} historical dividend payments.`);
    if (dividends.length > 0) {
      console.log('Raw sample of oldest dividend payment:', dividends[0]);
    }

    // 2. Fetch income statement / earnings histories
    console.log('\n-> Querying quoteSummary for quarterly financials & earnings...');
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: ['incomeStatementHistoryQuarterly', 'earningsHistory', 'earnings'],
    })) as any;

    // Check earningsHistory
    console.log('\n✓ Earnings History (last 4 quarters of EPS data):');
    const earningsHistory = summary.earningsHistory?.history || [];
    console.table(earningsHistory.map((e: any) => ({
      Quarter: e.quarter.toISOString().split('T')[0],
      EPS_Estimate: e.estimate,
      EPS_Actual: e.actual,
      Surprise_Percent: (e.percent || 0) * 100
    })));

    // Check incomeStatementHistoryQuarterly (last 4 quarters of revenue and net income)
    console.log('\n✓ Income Statement History Quarterly (last 4 periods):');
    const incomeStatement = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    console.table(incomeStatement.map((period: any) => ({
      EndDate: period.endDate.toISOString().split('T')[0],
      TotalRevenue: period.totalRevenue,
      NetIncome: period.netIncome
    })));

  } catch (error) {
    console.error('Error fetching historical financials:', error);
  }
}

main().catch(console.error);
