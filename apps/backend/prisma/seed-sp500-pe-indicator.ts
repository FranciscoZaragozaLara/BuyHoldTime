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

  console.log(`Parsed ${rawEntries.length} entries.`);
  if (rawEntries.length === 0) {
    console.error('No S&P 500 PE data parsed!');
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Find or create 'pe_ratio' indicator
  let peInd = await prisma.indicator.findUnique({
    where: { key: 'pe_ratio' }
  });

  if (!peInd) {
    console.log('Creating pe_ratio indicator...');
    peInd = await prisma.indicator.create({
      data: {
        key: 'pe_ratio',
        name: 'S&P 500 PE Ratio',
        currentValue: 0,
        unit: 'x',
        status: 'Normal',
        description: 'Múltiplo de ganancias tradicional del índice S&P 500 sin promedio de 10 años ni inflación.'
      }
    });
  }

  // Convert to database rows for indicatorHistory and deduplicate by date
  const seenDates = new Set<string>();
  const historyEntries: Array<{ indicatorId: string; date: Date; value: number }> = [];
  for (const entry of rawEntries) {
    const parts = entry.date.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const lastDay = new Date(y, m, 0).getDate();
    const fullDate = new Date(Date.UTC(y, m - 1, lastDay));
    const dateKey = fullDate.toISOString().split('T')[0];
    if (!seenDates.has(dateKey)) {
      seenDates.add(dateKey);
      historyEntries.push({
        indicatorId: peInd.id,
        date: fullDate,
        value: parseFloat(entry.pe.toFixed(4))
      });
    }
  }

  // Sort descending to get the newest value
  historyEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

  console.log('Clearing S&P 500 PE indicator history...');
  await prisma.indicatorHistory.deleteMany({
    where: { indicatorId: peInd.id }
  });

  console.log('Inserting S&P 500 PE historical values...');
  const chunkSize = 200;
  for (let k = 0; k < historyEntries.length; k += chunkSize) {
    const chunk = historyEntries.slice(k, k + chunkSize);
    await prisma.indicatorHistory.createMany({
      data: chunk as any
    });
  }

  const latest = historyEntries[0];
  console.log(`Updating current PE value to ${latest.value.toFixed(2)} (${latest.date.toISOString().split('T')[0]})`);

  let status = 'Normal';
  if (latest.value > 25) status = 'High';
  else if (latest.value < 15) status = 'Low';

  await prisma.indicator.update({
    where: { id: peInd.id },
    data: {
      currentValue: parseFloat(latest.value.toFixed(2)),
      status,
      updatedAt: new Date()
    }
  });

  await prisma.$disconnect();
  await pool.end();
  console.log('Done S&P 500 PE indicator history seeding.');
}

main().catch(console.error);
