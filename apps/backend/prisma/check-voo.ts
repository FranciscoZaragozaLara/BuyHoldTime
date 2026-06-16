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

  console.log('Querying VOO ticker details...');
  const ticker = await prisma.ticker.findFirst({
    where: { symbol: 'VOO' }
  });

  if (!ticker) {
    console.log('VOO not found!');
  } else {
    console.log('VOO Symbol:', ticker.symbol);
    console.log('VOO Sector:', ticker.sector);
    console.log('VOO EPS:', ticker.eps);
    console.log('VOO P/E:', ticker.pe);
    console.log('VOO historicalEpsQuarterly Type:', typeof ticker.historicalEpsQuarterly);
    if (ticker.historicalEpsQuarterly) {
      const quarters = ticker.historicalEpsQuarterly as any[];
      console.log('Total Quarters:', quarters.length);
      console.log('First 5 Quarters:', JSON.stringify(quarters.slice(0, 5), null, 2));
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
