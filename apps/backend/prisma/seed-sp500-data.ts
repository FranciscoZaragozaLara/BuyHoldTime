import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to database...');
  await prisma.$connect();

  // 1. Parse S&P 500 Earnings CSV
  const earningsPath = '/Users/zilphfanel/Documents/AgyApps/BestTimeToInvest/source/s-p-500-earnings-history.csv';
  const earningsContent = fs.readFileSync(earningsPath, 'utf-8');
  const earningsLines = earningsContent.split('\n');

  const earningsMap = new Map<string, { close: number; eps: number }>();
  for (const line of earningsLines) {
    const clean = line.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const parts = clean.split(',');
      if (parts.length >= 3) {
        const date = parts[0];
        const close = parseFloat(parts[1]);
        const eps = parseFloat(parts[2]);
        earningsMap.set(date, { close, eps });
      }
    }
  }
  console.log(`Parsed ${earningsMap.size} rows from S&P 500 Earnings CSV.`);

  // 2. Parse S&P 500 PE Ratio CSV
  const pePath = '/Users/zilphfanel/Documents/AgyApps/BestTimeToInvest/source/sp-500-pe-ratio-price-to-earnings-chart.csv';
  const peContent = fs.readFileSync(pePath, 'utf-8');
  const peLines = peContent.split('\n');

  const peMap = new Map<string, number>();
  for (const line of peLines) {
    const clean = line.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const parts = clean.split(',');
      if (parts.length >= 2) {
        const date = parts[0];
        const pe = parseFloat(parts[1]);
        peMap.set(date, pe);
      }
    }
  }
  console.log(`Parsed ${peMap.size} rows from S&P 500 PE Ratio CSV.`);

  // 3. Construct quarterly records from CSV data
  type QuarterEntry = {
    date: string;
    period: string;
    fiscalYear: string;
    revenue: number;
    netIncome: number;
    eps: number;
    epsDiluted: number;
    sharesOutstanding: number;
    peRatio: number | null;
    source: 'real';
  };

  const quarters: QuarterEntry[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  // We loop year by year, quarter by quarter
  const startYear = 1997;
  const currentYear = new Date().getFullYear();

  for (let yr = startYear; yr <= currentYear; yr++) {
    const qConfigs = [
      { period: 'Q1', csvMonth: '03', endStr: `${yr}-03-31` },
      { period: 'Q2', csvMonth: '06', endStr: `${yr}-06-30` },
      { period: 'Q3', csvMonth: '09', endStr: `${yr}-09-30` },
      { period: 'Q4', csvMonth: '12', endStr: `${yr}-12-31` }
    ];

    for (const q of qConfigs) {
      if (q.endStr > todayStr) continue;

      const csvDateStr = `${yr}-${q.csvMonth}-01`;
      const earnData = earningsMap.get(csvDateStr);
      const peVal = peMap.get(csvDateStr);

      if (earnData && peVal) {
        // Divide TTM EPS by 4 to populate individual quarter eps values
        // This ensures the frontend summation results in the correct TTM EPS
        const qEps = earnData.eps / 4;
        quarters.push({
          date: q.endStr,
          period: q.period,
          fiscalYear: String(yr),
          revenue: 0,
          netIncome: 0,
          eps: parseFloat(qEps.toFixed(4)),
          epsDiluted: parseFloat(qEps.toFixed(4)),
          sharesOutstanding: 0,
          peRatio: parseFloat(peVal.toFixed(4)),
          source: 'real',
        });
      }
    }
  }

  // Sort descending (newest first)
  quarters.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  console.log(`Generated ${quarters.length} quarters for S&P 500 benchmarks. Newer:`, quarters[0]);

  // 4. Update VOO and SPY in DB
  const targetSymbols = ['VOO', 'SPY'];
  for (const sym of targetSymbols) {
    const ticker = await prisma.ticker.findFirst({
      where: { symbol: sym }
    });

    if (ticker) {
      console.log(`Updating ${sym} in database with historical S&P 500 EPS & PE Ratio...`);
      
      const latestQuarter = quarters[0];
      const latestPe = latestQuarter.peRatio !== null ? latestQuarter.peRatio : ticker.pe;
      // Scale EPS to ETF share price: ETF Price / ETF PE ratio (e.g. 681.93 / 26.7 = $25.54 per share)
      const latestEps = (ticker.price && latestPe > 0) ? parseFloat((ticker.price / latestPe).toFixed(2)) : 25.52;

      await prisma.ticker.update({
        where: { id: ticker.id },
        data: {
          pe: latestPe,
          eps: latestEps,
          historicalEpsQuarterly: quarters as any,
        }
      });

      console.log(`Successfully updated ${sym}`);
    } else {
      console.log(`Symbol ${sym} not found in database.`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('Done.');
}

main().catch(console.error);
