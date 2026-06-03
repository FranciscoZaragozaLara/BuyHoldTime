import YahooFinance from 'yahoo-finance2';
import * as XLSX from 'xlsx';
import * as path from 'path';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey']
});

async function main() {
  const symbols = ['AAPL', 'MSFT'];
  const workbook = XLSX.utils.book_new();

  // 1. Create Overview Sheet
  console.log('Fetching Overview Metrics for AAPL and MSFT...');
  const overviewRows = [];

  for (const symbol of symbols) {
    const quote = (await yahooFinance.quote(symbol)) as any;
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: ['defaultKeyStatistics', 'summaryDetail'],
    })) as any;

    overviewRows.push({
      Symbol: symbol,
      Name: quote.shortName,
      Price: quote.regularMarketPrice,
      'Change %': quote.regularMarketChangePercent,
      'EPS (TTM)': quote.epsTrailingTwelveMonths,
      'Trailing PE': quote.trailingPE || summary.summaryDetail?.trailingPE,
      'Forward PE': quote.forwardPE || summary.summaryDetail?.forwardPE,
      'PEG Ratio': summary.defaultKeyStatistics?.pegRatio,
      'Enterprise Value': summary.defaultKeyStatistics?.enterpriseValue,
      'Avg Volume': quote.averageDailyVolume3Month,
      '52W High': quote.fiftyTwoWeekHigh,
      '52W Low': quote.fiftyTwoWeekLow,
      'Dividend Rate': summary.summaryDetail?.dividendRate,
      'Book Value': summary.defaultKeyStatistics?.bookValue,
    });
  }

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  // 2. Create Historical Sheets
  for (const symbol of symbols) {
    console.log(`Fetching historical prices for ${symbol}...`);
    const todayStr = new Date().toISOString().split('T')[0];
    const history = (await yahooFinance.historical(symbol, {
      period1: '1997-01-01',
      period2: todayStr,
    })) as any;

    const historyRows = history.map((h: any) => ({
      Date: h.date.toISOString().split('T')[0],
      Open: h.open,
      High: h.high,
      Low: h.low,
      Close: h.close,
      'Adj Close': h.adjClose,
      Volume: Number(h.volume),
    }));

    const historySheet = XLSX.utils.json_to_sheet(historyRows);
    XLSX.utils.book_append_sheet(workbook, historySheet, `${symbol}_History`);
  }

  // 3. Save Excel Workbook to Root Workspace
  const destPath = path.resolve(__dirname, '../../../BestTimeToInvest_Test_Data.xlsx');
  console.log(`Writing workbook to: ${destPath}`);
  XLSX.writeFile(workbook, destPath);
  console.log('Workbook created successfully!');
}

main().catch(console.error);
