/**
 * Diagnostic script: checks what real EPS data Yahoo Finance returns for MSFT
 * Run: node prisma/test-eps.mjs
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

const symbol = 'MSFT';

console.log('=== Fetching Yahoo Finance data for', symbol, '===\n');

try {
  // 1. Quote
  const quote = await yf.quote(symbol);
  console.log('1) Quote EPS (TTM):', quote.epsTrailingTwelveMonths);
  console.log('   Forward EPS:    ', quote.epsForward);
  console.log('');

  // 2. Summary with incomeStatementHistory
  const summary = await yf.quoteSummary(symbol, {
    modules: ['defaultKeyStatistics', 'summaryDetail', 'earnings', 'incomeStatementHistory'],
  });

  console.log('2) earnings.financialsChart.yearly:');
  const yearly = summary?.earnings?.financialsChart?.yearly || [];
  if (yearly.length > 0) {
    const shares = summary?.defaultKeyStatistics?.sharesOutstanding || quote.sharesOutstanding;
    yearly.forEach(item => {
      const calcEps = shares ? (item.earnings / shares).toFixed(2) : 'N/A';
      console.log(`   ${item.date}: earnings=${item.earnings?.toLocaleString()}, sharesOut=${shares?.toLocaleString()}, calcEPS=${calcEps}`);
    });
  } else {
    console.log('   (no data)');
  }

  console.log('');
  console.log('3) incomeStatementHistory.incomeStatementHistory:');
  const stmts = summary?.incomeStatementHistory?.incomeStatementHistory || [];
  if (stmts.length > 0) {
    stmts.forEach(stmt => {
      const year = stmt.endDate ? new Date(stmt.endDate).getFullYear() : '?';
      console.log(`   ${year} (endDate: ${stmt.endDate})`);
      console.log(`      dilutedEPS: ${stmt.dilutedEPS}`);
      console.log(`      basicEPS:   ${stmt.basicEPS}`);
      console.log(`      netIncome:  ${stmt.netIncome?.toLocaleString()}`);
    });
  } else {
    console.log('   (no data)');
  }

  console.log('');
  console.log('4) defaultKeyStatistics:');
  console.log('   sharesOutstanding:', summary?.defaultKeyStatistics?.sharesOutstanding?.toLocaleString());
  console.log('   trailingEps:      ', summary?.defaultKeyStatistics?.trailingEps);
  console.log('   forwardEps:       ', summary?.defaultKeyStatistics?.forwardEps);

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
