import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main(){
  for(const code of ["SCHILLER_TQQQ_5A_RISK_A","SCHILLER_TQQQ_5A_RISK_B","SCHILLER_TQQQ_5A_RISK_C"]){
    const s = await prisma.btStrategy.findUnique({ where:{ code }});
    if(!s){ console.log("no",code); continue; }
    const runs = await prisma.btBacktestRun.findMany({ where:{ strategyId: s.id }});
    for(const r of runs){
      await prisma.btTrade.deleteMany({ where:{ runId: r.id }});
      await prisma.btAllocation.deleteMany({ where:{ runId: r.id }});
      await prisma.btEquityCurve.deleteMany({ where:{ runId: r.id }});
      await prisma.btBacktestMetrics.deleteMany({ where:{ runId: r.id }});
      await prisma.btBacktestRun.delete({ where:{ id: r.id }});
    }
    await prisma.btStrategy.delete({ where:{ id: s.id }});
    console.log("borrado",code);
  }
  console.log("restantes", await prisma.btStrategy.count());
}
main().finally(()=>prisma.$disconnect());
