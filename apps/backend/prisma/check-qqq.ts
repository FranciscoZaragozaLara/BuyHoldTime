import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  
  const t = await prisma.ticker.findFirst({ where: { symbol: 'QQQ' } });
  console.log('QQQ ID:', t?.id, 'Symbol:', t?.symbol);
  
  const hp = await prisma.historicalPrice.findFirst({
    where: { tickerId: t?.id },
    orderBy: { date: 'desc' }
  });
  console.log('Latest Price Date:', hp?.date, 'Close:', hp?.close);
  
  const hpCount = await prisma.historicalPrice.count({ where: { tickerId: t?.id } });
  console.log('Total Price Records:', hpCount);
  
  if (t?.historicalEpsQuarterly) {
    const quarters = t.historicalEpsQuarterly as any[];
    console.log('Total Quarters:', quarters.length);
    console.log('First 5 Quarters:', JSON.stringify(quarters.slice(0, 5), null, 2));
  }
  
  await prisma.$disconnect();
  await pool.end();
}
run().catch(console.error);
