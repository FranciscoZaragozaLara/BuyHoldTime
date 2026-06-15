import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to database...');
  await prisma.$connect();

  const sampleSymbols = ['AAPL', 'MSFT', 'NVDA'];
  
  for (const symbol of sampleSymbols) {
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      include: {
        historicalPrices: {
          orderBy: { date: 'desc' },
          take: 5,
        }
      }
    });

    if (!ticker) {
      console.log(`Ticker ${symbol} not found.`);
      continue;
    }

    console.log(`\n=== Latest 5 Prices for ${symbol} ===`);
    console.table(ticker.historicalPrices.map(p => ({
      date: p.date.toISOString().split('T')[0],
      close: p.close,
      volume: Number(p.volume)
    })));
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
