import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';

// Interface representing the parsed nasdaq 100 pe entries
interface PeDataEntry {
  date: string; // YYYY-MM-DD
  pe: number;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to database...');
  await prisma.$connect();

  // 1. Read and parse the Nasdaq 100 PE js file
  const jsPath = '/Users/zilphfanel/Documents/AgyApps/BestTimeToInvest/source/nasdaq_100_pe.js';
  const rawContent = fs.readFileSync(jsPath, 'utf-8');
  
  // Extract all arrays of form: [Date.UTC(year, monthIndex, day), value]
  const pattern = /\[Date\.UTC\((\d+),\s*(\d+),\s*(\d+)\),\s*([\d\.-]+)\]/g;
  let match;
  const rawEntries: PeDataEntry[] = [];
  
  while ((match = pattern.exec(rawContent)) !== null) {
    const year = parseInt(match[1], 10);
    const monthIndex = parseInt(match[2], 10); // 0-indexed month
    const day = parseInt(match[3], 10);
    const peVal = parseFloat(match[4]);
    
    // Construct UTC date
    // format as YYYY-MM-DD
    const month = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    rawEntries.push({ date: dateStr, pe: peVal });
  }

  console.log(`Parsed ${rawEntries.length} entries from nasdaq_100_pe.js`);
  if (rawEntries.length === 0) {
    console.error('No PE data parsed! Please check the regex or javascript file structure.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Create a map for easy lookup
  const peMap = new Map<string, number>();
  for (const entry of rawEntries) {
    peMap.set(entry.date, entry.pe);
  }

  // 2. Fetch QQQ ID to get historical prices for exact quarters
  const qqqTicker = await prisma.ticker.findFirst({
    where: { symbol: 'QQQ' }
  });

  if (!qqqTicker) {
    console.error('QQQ Ticker not found in DB!');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Construct quarterly records from 1990 to present
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

  // We loop year by year, quarter by quarter starting from 1990 (which is the start date of the parsed data)
  const startYear = 1990;
  const currentYear = new Date().getFullYear();
  
  // Calculate threshold date (today + 30 days) to allow the current quarter
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 30);
  const limitStr = limitDate.toISOString().split('T')[0];

  for (let yr = startYear; yr <= currentYear; yr++) {
    const qConfigs = [
      { period: 'Q1', csvMonth: '03', endStr: `${yr}-03-31`, searchMonth: '03' },
      { period: 'Q2', csvMonth: '06', endStr: `${yr}-06-30`, searchMonth: '06' },
      { period: 'Q3', csvMonth: '09', endStr: `${yr}-09-30`, searchMonth: '09' },
      { period: 'Q4', csvMonth: '12', endStr: `${yr}-12-31`, searchMonth: '12' }
    ];

    for (const q of qConfigs) {
      if (q.endStr > limitStr) continue;

      const dateStr = `${yr}-${q.searchMonth}-01`;
      const peVal = peMap.get(dateStr);

      if (peVal !== undefined) {
        // Query the historical price closest to the quarter date to compute EPS
        // eps = price / peRatio. Since peRatio is TTM, this eps will be TTM EPS.
        // We then divide it by 4 so the sum of trailing 4 quarters matches the TTM EPS.
        const targetDate = new Date(q.endStr);
        
        const priceRecord = await prisma.historicalPrice.findFirst({
          where: {
            tickerId: qqqTicker.id,
            date: {
              lte: targetDate
            }
          },
          orderBy: {
            date: 'desc'
          }
        });

        if (priceRecord) {
          const price = priceRecord.close;
          const ttmEps = price / peVal;
          const qEps = ttmEps / 4;

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
            source: 'real'
          });
        } else {
          // If no price record exists (e.g. before QQQ inception in 1999)
          // we still store the peRatio but set eps to 0, or estimate it if needed.
          // Since QQQ didn't exist before March 1999, we'll store eps = 0.
          quarters.push({
            date: q.endStr,
            period: q.period,
            fiscalYear: String(yr),
            revenue: 0,
            netIncome: 0,
            eps: 0,
            epsDiluted: 0,
            sharesOutstanding: 0,
            peRatio: parseFloat(peVal.toFixed(4)),
            source: 'real'
          });
        }
      }
    }
  }

  // Sort descending (newest first)
  quarters.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  console.log(`Generated ${quarters.length} quarters for Nasdaq-100 benchmarks. Newer:`, quarters[0]);

  // Update QQQ and TQQQ in the database
  const targetSymbols = ['QQQ', 'TQQQ'];
  for (const sym of targetSymbols) {
    const ticker = await prisma.ticker.findFirst({
      where: { symbol: sym }
    });

    if (ticker) {
      console.log(`Updating ${sym} in database with historical Nasdaq-100 EPS & PE Ratio...`);
      
      const latestQuarter = quarters[0];
      const latestPe = latestQuarter.peRatio !== null ? latestQuarter.peRatio : ticker.pe;
      const latestEps = latestQuarter.eps * 4; // TTM EPS

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
