import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main() {
  const equity = JSON.parse(fs.readFileSync('/Users/zilphfanel/Documents/AgyApps/BackTesting/comparativa_equity.json','utf8'));
  // Delete existing equity
  await prisma.btEquityCurve.deleteMany({});
  console.log('deleted old equity');
  const strategies = await prisma.btStrategy.findMany();
  for (const s of strategies) {
    const eq = equity[s.code] || [];
    console.log(`inserting ${s.code} ${eq.length} points from ${eq[0]?.[0]} to ${eq[eq.length-1]?.[0]}`);
    const run = await prisma.btBacktestRun.findFirst({ where: { strategyId: s.id } });
    if (!run) { console.log(`no run for ${s.code}`); continue; }
    // eq is [[date, value], ...]
    const rows = eq.map(([d,v]: any) => ({ runId: run.id, date: new Date(d), portfolioValue: Number(v) }));
    // Chunk inserts to avoid large payload
    const chunkSize = 500;
    for (let i=0; i<rows.length; i+=chunkSize) {
      await prisma.btEquityCurve.createMany({ data: rows.slice(i, i+chunkSize), skipDuplicates: true });
      console.log(`  ${Math.min(i+chunkSize, rows.length)}/${rows.length}`);
    }
  }
  const counts = await prisma.btEquityCurve.groupBy({ by: ['runId'], _count: { _all: true } });
  console.log('counts by run', counts);
  const total = await prisma.btEquityCurve.count();
  console.log('total equity', total);
}
main().catch(e=>{console.error(e); process.exit(1)}).finally(()=>prisma.$disconnect());
