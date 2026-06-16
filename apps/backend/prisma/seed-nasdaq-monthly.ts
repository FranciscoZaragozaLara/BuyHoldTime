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
    
    // Construct UTC date as YYYY-MM-DD
    const month = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    rawEntries.push({ date: dateStr, pe: peVal });
  }

  console.log(`Parsed ${rawEntries.length} entries from nasdaq_100_pe.js`);
  if (rawEntries.length === 0) {
    console.error('No PE data parsed!');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Create a map for easy lookup
  const peMap = new Map<string, number>();
  for (const entry of rawEntries) {
    peMap.set(entry.date, entry.pe);
  }

  // Fetch QQQ and TQQQ to update them
  const targetSymbols = ['QQQ', 'TQQQ'];
  for (const sym of targetSymbols) {
    const ticker = await prisma.ticker.findFirst({
      where: { symbol: sym }
    });

    if (ticker) {
      console.log(`Updating ${sym} in database with monthly historical PE ratios...`);
      
      // Build monthly PE data record mapping from the rawEntries
      // Structure: { "2026-06-30": 32.671, "2026-05-31": 33.8101, ... }
      const historicalPeMonthly: Record<string, number> = {};
      
      for (const entry of rawEntries) {
        // Since entries are monthly, we can store them under the corresponding month-end date
        const parts = entry.date.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        
        // Find last day of the month
        const lastDay = new Date(y, m, 0).getDate();
        const monthEndStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        historicalPeMonthly[monthEndStr] = parseFloat(entry.pe.toFixed(4));
      }

      // We will save this under historicalEps (since it's a JSON field we can put any structured data there,
      // or we can add a new schema column if desired. However, keeping database schema changes minimal or
      // using an existing JSON field is safer.
      // Wait, let's see if we can use the historicalEpsQuarterly JSON field to store MONTHLY entries instead of QUARTERLY!
      // If we store monthly entries in historicalEpsQuarterly, the frontend can query it directly by date without estimation.
      // Structure of array elements: { date: "2026-06-30", period: "M", fiscalYear: "2026", eps: 0, epsDiluted: 0, peRatio: 32.6710, source: "real" }
      const monthlyQuartersArray = rawEntries.map(entry => {
        const parts = entry.date.split('-');
        const y = parts[0];
        const m = parts[1];
        const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
        const monthEndStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
        
        return {
          date: monthEndStr,
          period: `M${m}`,
          fiscalYear: y,
          revenue: 0,
          netIncome: 0,
          eps: 0,
          epsDiluted: 0,
          sharesOutstanding: 0,
          peRatio: parseFloat(entry.pe.toFixed(4)),
          source: 'real' as const
        };
      });

      // Sort newest first
      monthlyQuartersArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Update in DB
      const latestPe = monthlyQuartersArray[0].peRatio;
      
      await prisma.ticker.update({
        where: { id: ticker.id },
        data: {
          pe: latestPe,
          historicalEpsQuarterly: monthlyQuartersArray as any,
        }
      });
      console.log(`Successfully updated ${sym} with ${monthlyQuartersArray.length} monthly PE entries.`);
    } else {
      console.log(`Symbol ${sym} not found in database.`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('Done.');
}

main().catch(console.error);
