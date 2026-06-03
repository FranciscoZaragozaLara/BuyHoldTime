/**
 * Final verification: simulate the new EPS computation logic for MSFT
 * Run: node prisma/test-eps-final.mjs
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
const symbol = 'MSFT';

console.log('=== Simulating new EPS sync logic for', symbol, '===\n');

const quote = await yf.quote(symbol);
let summary = {};
try {
  summary = await yf.quoteSummary(symbol, {
    modules: ['defaultKeyStatistics', 'summaryDetail', 'earnings', 'incomeStatementHistory', 'earningsHistory'],
  });
} catch (e) {
  console.error('summaryError:', e.message);
}

const historicalEpsRaw = {};

// Source 1: earningsHistory — sum quarterly EPS by fiscal year
const earningsHistory = summary?.earningsHistory?.history || [];
console.log('earningsHistory entries:', earningsHistory.length);
const quarterlyByYear = {};
for (const q of earningsHistory) {
  if (q.epsActual !== null && q.epsActual !== undefined && typeof q.epsActual === 'number') {
    const qDate = q.quarter ? new Date(q.quarter) : null;
    if (!qDate) continue;
    const yr = String(qDate.getFullYear());
    if (!quarterlyByYear[yr]) quarterlyByYear[yr] = [];
    quarterlyByYear[yr].push(q.epsActual);
    console.log(`  Quarter ${q.quarter?.toISOString?.()?.substring(0,10)} → year=${yr}, epsActual=${q.epsActual}`);
  }
}
for (const [yr, quarters] of Object.entries(quarterlyByYear)) {
  if (quarters.length >= 3) {
    const annualEps = parseFloat(quarters.reduce((a, b) => a + b, 0).toFixed(2));
    historicalEpsRaw[yr] = { value: annualEps, source: 'real' };
    console.log(`  ✅ Aggregated ${yr}: $${annualEps} (from ${quarters.length} qtrs) [REAL]`);
  }
}

// Source 2: earnings.financialsChart.yearly
const yearlyEarnings = summary?.earnings?.financialsChart?.yearly || [];
const sharesOutstanding = summary?.defaultKeyStatistics?.sharesOutstanding || quote.sharesOutstanding;
console.log('\nearnings.financialsChart.yearly:', yearlyEarnings.length, 'entries');
console.log('sharesOutstanding:', sharesOutstanding?.toLocaleString());
for (const item of yearlyEarnings) {
  const year = String(item.date);
  if (!historicalEpsRaw[year] && item.earnings && sharesOutstanding > 0) {
    const calculatedEps = parseFloat((item.earnings / sharesOutstanding).toFixed(2));
    if (!isNaN(calculatedEps) && calculatedEps > 0) {
      historicalEpsRaw[year] = { value: calculatedEps, source: 'real' };
      console.log(`  ✅ ${year}: Net Income=${item.earnings.toLocaleString()}, EPS=$${calculatedEps} [REAL]`);
    }
  } else if (historicalEpsRaw[year]) {
    console.log(`  ⏭ ${year}: already set from earningsHistory`);
  }
}

// Source 3: TTM EPS
const currentYear = new Date().getFullYear();
const currentEps = quote.epsTrailingTwelveMonths ?? summary?.defaultKeyStatistics?.trailingEps ?? null;
console.log('\nTTM EPS:', currentEps, '→ year', currentYear);
if (currentEps && !historicalEpsRaw[String(currentYear)]) {
  historicalEpsRaw[String(currentYear)] = { value: parseFloat(currentEps.toFixed(2)), source: 'real' };
  console.log(`  ✅ ${currentYear}: $${currentEps} [REAL TTM]`);
}

// Final result
const realYears = Object.keys(historicalEpsRaw).map(Number).sort((a, b) => a - b);
console.log('\n=== RESULT ===');
console.log(`Real years found: [${realYears.join(', ')}]`);
console.log('');
for (const yr of realYears.reverse()) {
  const entry = historicalEpsRaw[String(yr)];
  console.log(`  ${yr}: $${entry.value} [${entry.source.toUpperCase()}]`);
}
