import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main(){
  const runs = await prisma.btBacktestRun.findMany({ include:{ strategy:true, equityCurve:{ orderBy:{date:'asc'}}}});
  for(const run of runs){
    if(!run.strategy.code.startsWith('BH_')) continue;
    const isTQQQ = run.strategy.code==='BH_TQQQ';
    const tqqqPct = isTQQQ ? 1.0 : 0.0;
    const cashPct = 0.0;
    console.log(`Seeding ${run.strategy.code} ${run.id} equity ${run.equityCurve.length}`);
    await prisma.btAllocation.deleteMany({ where:{ runId: run.id }});
    // resample equity to month-end (last point per YYYY-MM)
    const byMonth = new Map<string, typeof run.equityCurve[0]>();
    for(const e of run.equityCurve) {
      const d = new Date(e.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      byMonth.set(key, e); // last overwrites = month-end
    }
    const rows = Array.from(byMonth.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,e])=>{
      const total = e.portfolioValue;
      const tqqqValue = total * tqqqPct;
      const cashValue = total * cashPct;
      return {
        runId: run.id,
        date: new Date(e.date),
        tqqqPct,
        cashPct,
        tqqqValue,
        cashValue,
        portfolioValue: total,
        targetPct: tqqqPct,
        indicators: { regime: 'buy_and_hold', cape: null, mean: null, cape_ratio: null },
      };
    });
    // batch insert 200
    for(let i=0;i<rows.length;i+=200){
      await prisma.btAllocation.createMany({ data: rows.slice(i,i+200), skipDuplicates:true });
    }
    const cnt = await prisma.btAllocation.count({ where:{ runId: run.id }});
    console.log(`  -> ${cnt} allocations (mensual)`);
  }
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
