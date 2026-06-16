import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  
  const pe = await prisma.indicator.findUnique({ where: { key: 'pe_ratio' } });
  console.log('SP500 PE:', pe);
  const peHistoryCount = await prisma.indicatorHistory.count({ where: { indicatorId: pe?.id } });
  console.log('SP500 PE History Count:', peHistoryCount);
  
  const schiller = await prisma.indicator.findUnique({ where: { key: 'schiller_pe' } });
  console.log('Shiller PE:', schiller);
  const schillerHistoryCount = await prisma.indicatorHistory.count({ where: { indicatorId: schiller?.id } });
  console.log('Shiller PE History Count:', schillerHistoryCount);
  
  await prisma.$disconnect();
  await pool.end();
}
run().catch(console.error);
