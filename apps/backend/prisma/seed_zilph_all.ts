import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import { spawn } from 'child_process';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function runBacktest(startDate: string){
  const base='/Users/zilphfanel/Documents/AgyApps/BackTesting';
  return new Promise<void>((resolve, reject)=>{
    const proc=spawn('python3',['run_risk_d_3a_v8_zilph.py'],{cwd:base, env:{...process.env, START_DATE:startDate}});
    let stderr='';
    proc.stderr.on('data', d=>stderr+=d.toString());
    proc.on('close', code=> code===0? resolve(): reject(new Error(`Failed ${startDate} ${stderr.slice(0,500)}`)));
  });
}
async function main(){
  const code='SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH';
  const strat=await prisma.btStrategy.findUnique({where:{code}});
  if(!strat) throw new Error('not found');
  const dates=await prisma.btStartDate.findMany({orderBy:{startDate:'asc'}});
  const inception='2010-02-11';
  for(const d of dates){
    const ds=d.startDate.toISOString().slice(0,10);
    if(ds < inception){ console.log(`Skip ${ds}`); continue; }
    const existing=await prisma.btBacktestRun.findFirst({where:{strategyId: strat.id, startDate: new Date(ds)}});
    if(existing){ console.log(`Exists ${ds} skip`); continue; }
    console.log(`Running ZILPH ${ds} ...`);
    await runBacktest(ds);
    const base='/Users/zilphfanel/Documents/AgyApps/BackTesting';
    const met=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_zilph.json`,'utf8'));
    const tr=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_zilph_trades.json`,'utf8'));
    const mo=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_zilph_allocations.json`,'utf8'));
    const eq=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_zilph_equity_full.json`,'utf8'));
    const run=await prisma.btBacktestRun.create({data:{strategyId: strat.id, startDate: new Date(ds), endDate: new Date(eq[eq.length-1]?.date||'2026-08-12'), initialCash:100000, commission:0.0005, paramsUsed: met}});
    await prisma.btBacktestMetrics.create({data:{runId:run.id, finalValue: met.final_value, totalReturn: met.total_return, cagr: met.cagr, sharpe: met.sharpe, maxDrawdown: met.max_drawdown, numTrades: met.num_trades, maxDdLength: met.max_dd_length, winRate: met.win_rate, sqn: met.sqn}});
    for(let i=0;i<tr.length;i+=200) await prisma.btTrade.createMany({data: tr.slice(i,i+200).map((t:any)=>({runId:run.id,ticker:t.ticker,side:t.side,size:t.size,price:t.price,value:t.value,commission:t.commission,datetime:new Date(t.datetime),targetPct:t.target_pct,indicators:t.indicators}))});
    await prisma.btAllocation.createMany({data: mo.map((a:any)=>({runId:run.id,date:new Date(a.date),tqqqPct:a.tqqq_pct,cashPct:a.cash_pct,tqqqValue:a.tqqq_value,cashValue:a.cash_value,portfolioValue:a.portfolio_value,targetPct:a.target_pct,indicators:a.indicators})), skipDuplicates:true});
    for(let i=0;i<eq.length;i+=500) await prisma.btEquityCurve.createMany({data: eq.slice(i,i+500).map((e:any)=>({runId:run.id,date:new Date(e.date),portfolioValue:e.portfolio_value ?? e.portfolioValue}))});
    console.log(`Seeded ZILPH ${ds} final ${met.final_value}`);
  }
  console.log('Done ZILPH all');
}
main().finally(()=>prisma.$disconnect());
