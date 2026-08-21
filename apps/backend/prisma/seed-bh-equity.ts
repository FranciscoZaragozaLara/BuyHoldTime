import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main(){
  const comp = JSON.parse(fs.readFileSync('/Users/zilphfanel/Documents/AgyApps/BackTesting/comparativa_equity.json','utf8'));
  for(const code of ['BH_QQQ','BH_TQQQ']){
    const run = await prisma.btBacktestRun.findFirst({ where:{ strategy:{ code }}, orderBy:{ createdAt:'desc'}});
    if(!run){ console.log('no run',code); continue; }
    await prisma.btEquityCurve.deleteMany({ where:{ runId: run.id }});
    const eq = comp[code] as [string, number][];
    const data = eq.map(([d,v])=>({ runId: run.id, date: new Date(d), portfolioValue: v }));
    for(let i=0;i<data.length;i+=500){
      await prisma.btEquityCurve.createMany({ data: data.slice(i,i+500), skipDuplicates:true });
    }
    console.log(`updated ${code} ${run.id} with ${data.length} pts`);
  }
  const c = await prisma.btEquityCurve.count();
  console.log('total equity',c);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
