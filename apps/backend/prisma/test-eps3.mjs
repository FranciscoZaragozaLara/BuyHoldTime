/**
 * Diagnostic: earningsTrend + earningsHistory + incomeStatementHistoryQuarterly
 * Run: node prisma/test-eps3.mjs
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
const symbol = 'MSFT';

console.log('=== EPS Sources Deep Dive for', symbol, '===\n');

// Test earningsTrend (has annual EPS estimates)
console.log('--- earningsTrend ---');
try {
  const res = await yf.quoteSummary(symbol, { modules: ['earningsTrend'] });
  const trends = res?.earningsTrend?.trend || [];
  trends.forEach(t => {
    console.log(`  period=${t.period}, endDate=${t.endDate}`);
    console.log(`    epsActual=${t.earningsEstimate?.avg?.raw ?? t.earningsEstimate?.avg}`);
    console.log(`    epsEstimate=${t.earningsEstimate?.avg?.raw ?? t.earningsEstimate?.avg}`);
    if (t.earningsActual) {
      console.log(`    earningsActual=${JSON.stringify(t.earningsActual)}`);
    }
  });
} catch (e) { console.error('earningsTrend error:', e.message); }

// Test incomeStatementHistoryQuarterly
console.log('\n--- incomeStatementHistoryQuarterly ---');
try {
  const res = await yf.quoteSummary(symbol, { modules: ['incomeStatementHistoryQuarterly'] });
  const stmts = res?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  console.log('Count:', stmts.length);
  stmts.forEach(s => {
    const yr = s.endDate ? new Date(s.endDate).getFullYear() : '?';
    const mo = s.endDate ? new Date(s.endDate).getMonth()+1 : '?';
    console.log(`  ${yr}-Q(mo${mo}): dilutedEPS=${s.dilutedEPS}, basicEPS=${s.basicEPS}, netIncome=${s.netIncome?.toLocaleString()}`);
  });
} catch (e) { console.error('incomeStatementHistoryQuarterly error:', e.message); }

// Full earningsHistory details to see what quarter/year each belongs to
console.log('\n--- earningsHistory full ---');
try {
  const res = await yf.quoteSummary(symbol, { modules: ['earningsHistory'] });
  const history = res?.earningsHistory?.history || [];
  console.log('Full earningsHistory object:');
  history.forEach(h => {
    console.log(JSON.stringify(h, null, 2));
  });
} catch (e) { console.error('earningsHistory error:', e.message); }
