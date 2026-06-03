/**
 * Diagnostic script: checks fundamentalsTimeSeries for annual EPS
 * Run: node prisma/test-eps2.mjs
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

const symbol = 'MSFT';

console.log('=== Testing fundamentalsTimeSeries for', symbol, '===\n');

try {
  // Try fundamentalsTimeSeries with annual EPS
  const fundamental = await yf.quoteSummary(symbol, {
    modules: ['fundamentalsTimeSeries'],
    fundamentalsTimeSeries: {
      type: 'annual',
      period1: '2018-01-01',
    }
  });

  console.log('fundamentalsTimeSeries keys:', Object.keys(fundamental?.fundamentalsTimeSeries || {}));
  const series = fundamental?.fundamentalsTimeSeries;
  if (series) {
    // Look for EPS related fields
    const epsFields = Object.keys(series).filter(k => k.toLowerCase().includes('eps') || k.toLowerCase().includes('diluted'));
    console.log('\nEPS-related fields:', epsFields);
    
    for (const field of epsFields.slice(0, 5)) {
      console.log(`\n${field}:`, JSON.stringify(series[field], null, 2));
    }
    
    // Also try annualDilutedEPS
    if (series.annualDilutedEPS) {
      console.log('\n=== annualDilutedEPS ===');
      series.annualDilutedEPS.forEach(item => {
        console.log(`  ${item.asOfDate}: ${item.reportedValue?.raw ?? item.reportedValue}`);
      });
    }
    
    if (series.annualBasicEPS) {
      console.log('\n=== annualBasicEPS ===');
      series.annualBasicEPS.forEach(item => {
        console.log(`  ${item.asOfDate}: ${item.reportedValue?.raw ?? item.reportedValue}`);
      });
    }
  }

} catch (err) {
  console.error('fundamentalsTimeSeries error:', err.message);
  
  // Try alternative: quoteSummary with financialData
  console.log('\n--- Trying financialData module ---');
  try {
    const fin = await yf.quoteSummary(symbol, {
      modules: ['financialData'],
    });
    console.log('financialData:', JSON.stringify(fin?.financialData, null, 2));
  } catch (err2) {
    console.error('financialData error:', err2.message);
  }
}

// Also test: yahooFinance2 `fundamentals` function if available
console.log('\n--- Testing quoteSummary earningsHistory ---');
try {
  const eh = await yf.quoteSummary(symbol, {
    modules: ['earningsHistory'],
  });
  const items = eh?.earningsHistory?.history || [];
  console.log('earningsHistory count:', items.length);
  items.slice(0, 8).forEach(item => {
    console.log(`  ${item.period} (${item.quarter?.fmt}): epsActual=${item.epsActual?.raw ?? item.epsActual}, epsDifference=${item.epsDifference?.raw}`);
  });
} catch (err) {
  console.error('earningsHistory error:', err.message);
}
