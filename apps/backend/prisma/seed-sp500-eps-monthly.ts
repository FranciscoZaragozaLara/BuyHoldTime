import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './db-url';

const adapter = new PrismaPg({ connectionString: databaseUrl() });
const prisma = new PrismaClient({ adapter });

// EPS TTM mensual del S&P 500 (multpl) -> ticker SPX_EPS en bt_market_data.
// Re-ejecutable: hace upsert por (ticker, date). Re-correr cada mes para extender.
const URL = 'https://www.multpl.com/s-p-500-earnings/table/by-month';
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

async function main() {
  console.log(`Fetching S&P 500 earnings from ${URL}...`);
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const pat = /<td>([a-zA-Z]{3})\s+(\d{1,2}),\s+(\d{4})<\/td>\s*<td>\s*(?:<abbr[^>]*>[^<]*<\/abbr>|&#x2002;|\s)*\s*([\d\.,-]+)\s*<\/td>/gi;
  const byMonth = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = pat.exec(html)) !== null) {
    const mo = MONTHS[m[1]];
    if (!mo) continue;
    const v = parseFloat(m[4].replace(/,/g, ''));
    if (!isFinite(v) || v <= 0) continue;
    const lastDay = new Date(parseInt(m[3], 10), parseInt(mo, 10), 0).getDate();
    const key = `${m[3]}-${mo}-${String(lastDay).padStart(2, '0')}`;
    if (!byMonth.has(key)) byMonth.set(key, parseFloat(v.toFixed(4))); // la tabla lista lo más reciente primero
  }
  const rows = [...byMonth.entries()].sort();
  console.log(`Parsed ${rows.length} monthly entries ${rows[0][0]} -> ${rows[rows.length - 1][0]}`);
  if (rows.length === 0) throw new Error('No earnings parsed');
  let done = 0;
  for (const [date, eps] of rows) {
    await prisma.btMarketData.upsert({
      where: { ticker_date: { ticker: 'SPX_EPS', date: new Date(date) } },
      update: { open: eps, high: eps, low: eps, close: eps, adjClose: eps, isValidated: true },
      create: { ticker: 'SPX_EPS', date: new Date(date), open: eps, high: eps, low: eps, close: eps, adjClose: eps, volume: BigInt(0), isValidated: true, source: 'multpl' },
    });
    if (++done % 300 === 0) console.log(done);
  }
  console.log(`done ${done} SPX_EPS rows`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
