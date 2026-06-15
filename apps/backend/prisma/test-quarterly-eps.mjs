/**
 * Diagnostic: get all quarterly EPS data available for MSFT to verify TTM calculation
 * node prisma/test-quarterly-eps.mjs
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
const symbol = 'MSFT';

console.log('=== Quarterly EPS data sources for', symbol, '===\n');

const quote = await yf.quote(symbol);
const summary = await yf.quoteSummary(symbol, {
  modules: ['defaultKeyStatistics', 'earnings', 'earningsHistory'],
});

// 1. earningsHistory (real quarterly EPS)
console.log('1) earningsHistory (real quarters):');
const history = summary?.earningsHistory?.history || [];
history.forEach(q => {
  const d = new Date(q.quarter);
  console.log(`   ${d.toISOString().substring(0,10)}: epsActual=$${q.epsActual} (period=${q.period})`);
});

// 2. earnings.financialsChart.quarterly (Net Income per quarter)
console.log('\n2) earnings.financialsChart.quarterly:');
const quarterly = summary?.earnings?.financialsChart?.quarterly || [];
const shares = summary?.defaultKeyStatistics?.sharesOutstanding;
console.log(`   sharesOutstanding: ${shares?.toLocaleString()}`);
quarterly.forEach(q => {
  const calcEps = shares ? (q.earnings / shares).toFixed(2) : 'N/A';
  console.log(`   ${q.date}: netIncome=${q.earnings?.toLocaleString()}, calcEPS=$${calcEps}`);
});

// 3. Verify user's example TTM calculation
console.log('\n3) Verify user examples:');
// From earningsHistory we know last 4 quarters
const allQuarters = history.map(q => ({ date: new Date(q.quarter), eps: q.epsActual }));
console.log('   Available quarters for TTM calc:');
allQuarters.forEach(q => console.log(`     ${q.date.toISOString().substring(0,10)}: $${q.eps}`));

// TTM for Dec 31, 2025: quarters ending on or before Dec 31, 2025
const dec2025 = new Date('2025-12-31');
const before_dec2025 = allQuarters.filter(q => q.date <= dec2025).sort((a,b) => b.date - a.date).slice(0,4);
const ttm_dec2025 = before_dec2025.reduce((s,q) => s + q.eps, 0);
console.log(`\n   TTM at Dec-2025: ${before_dec2025.map(q => `$${q.eps}`).join(' + ')} = $${ttm_dec2025.toFixed(2)}`);
console.log(`   User expected: $15.99 (missing Mar-2025 quarter)`);

// We need Mar-2025 quarter! Check financialsChart.quarterly for it
console.log('\n   → We need Q ended Mar-2025 to compute Dec-2025 TTM correctly');
console.log('   → financialsChart.quarterly might have it:');
quarterly.forEach(q => {
  const calcEps = shares ? (q.earnings / shares).toFixed(2) : '?';
  console.log(`     ${q.date}: estimated EPS=$${calcEps}`);
});
