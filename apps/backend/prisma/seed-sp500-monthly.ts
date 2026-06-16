import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as http from 'https';

// Interface representing the parsed S&P 500 PE entries
interface PeDataEntry {
  date: string; // YYYY-MM-DD
  pe: number;
}

// Map month abbreviation to number
const monthMap: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to database...');
  await prisma.$connect();

  const url = 'https://www.multpl.com/s-p-500-pe-ratio/table/by-month';
  console.log(`Fetching S&P 500 PE table from ${url}...`);
  const html = await fetchHtml(url);

  console.log('Parsing HTML content...');
  // Regular expression to extract:
  // <td>[Month] [Day], [Year]</td>
  // <td>... [PE Value] ...</td>
  // Using a robust regex to iterate over matches
  const rowPattern = /<td>([a-zA-Z]{3})\s+(\d{1,2}),\s+(\d{4})<\/td>\s*<td>\s*(?:<abbr[^>]*>[^<]*<\/abbr>|&#x2002;|\s)*\s*([\d\.-]+)\s*<\/td>/gi;
  
  let match;
  const rawEntries: PeDataEntry[] = [];
  
  while ((match = rowPattern.exec(html)) !== null) {
    const monthName = match[1];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const peVal = parseFloat(match[4]);
    
    const month = monthMap[monthName];
    if (month) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayStr}`;
      rawEntries.push({ date: dateStr, pe: peVal });
    }
  }

  console.log(`Parsed ${rawEntries.length} entries from Multpl S&P 500 PE Table.`);
  if (rawEntries.length === 0) {
    console.error('No S&P 500 PE data parsed! Please check the parser.');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Convert raw entries to month-end format to align with front-end month-based lookup
  const monthlyArray = rawEntries.map(entry => {
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

  // Sort descending (newest first)
  monthlyArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  console.log(`Formatted ${monthlyArray.length} S&P 500 PE monthly entries. Latest:`, monthlyArray[0]);

  // Update SPY and VOO in database
  const targetSymbols = ['VOO', 'SPY'];
  for (const sym of targetSymbols) {
    const ticker = await prisma.ticker.findFirst({
      where: { symbol: sym }
    });

    if (ticker) {
      console.log(`Updating ${sym} in database with S&P 500 historical monthly PE ratios...`);
      const latestPe = monthlyArray[0].peRatio;
      
      await prisma.ticker.update({
        where: { id: ticker.id },
        data: {
          pe: latestPe,
          historicalEpsQuarterly: monthlyArray as any,
        }
      });
      console.log(`Successfully updated ${sym} with ${monthlyArray.length} monthly entries.`);
    } else {
      console.log(`Symbol ${sym} not found in database.`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('Done.');
}

main().catch(console.error);
