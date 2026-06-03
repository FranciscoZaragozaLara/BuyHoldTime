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
  console.log('Successfully connected!');

  const tickersCount = await prisma.ticker.count();
  console.log(`\nTotal Tickers in DB: ${tickersCount}`);

  const tickers = await prisma.ticker.findMany({
    take: 5,
    select: {
      symbol: true,
      name: true,
      price: true,
      buyHoldIndex: true,
      recommendation: true,
    }
  });

  console.log('\nTop 5 Tickers:');
  console.table(tickers);

  const indicators = await prisma.indicator.findMany({
    take: 5,
    select: {
      key: true,
      name: true,
      currentValue: true,
      status: true,
    }
  });

  console.log('\nTop 5 Indicators:');
  console.table(indicators);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error('Database connection test failed:', err);
});
