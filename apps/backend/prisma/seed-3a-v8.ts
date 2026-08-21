import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const a=new PrismaPg({connectionString:process.env.DATABASE_URL||"postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime"});
const p=new PrismaClient({adapter:a});
async function m(){
  const code="SCHILLER_TQQQ_3A_RISK_D_V8";
  const strat=await p.btStrategy.upsert({where:{code}, update:{name:"Schiller 3A RISK D V8 weekly (1d/sem)", description:"Clon V7 con batch semanal miercoles + excepcion movimiento fuerte"}, create:{code, name:"Schiller 3A RISK D V8 weekly (1d/sem)", description:"V8 weekly", paramsSchema:{weekly:true}}});
  const base="/Users/zilphfanel/Documents/AgyApps/BackTesting";
  const met=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8.json`,"utf8"));
  const olds=await p.btBacktestRun.findMany({where:{strategyId:strat.id}});
  for(const r of olds){ await p.btTrade.deleteMany({where:{runId:r.id}}); await p.btAllocation.deleteMany({where:{runId:r.id}}); await p.btEquityCurve.deleteMany({where:{runId:r.id}}); await p.btBacktestMetrics.deleteMany({where:{runId:r.id}}); await p.btBacktestRun.delete({where:{id:r.id}}); }
  const tr=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_trades.json`,"utf8"));
  const mo=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_allocations.json`,"utf8"));
  const eq=JSON.parse(fs.readFileSync(`${base}/result_schiller_3a_risk_d_v8_equity_full.json`,"utf8"));
  const run=await p.btBacktestRun.create({data:{strategyId:strat.id, startDate:new Date("2010-02-11"), endDate:new Date("2026-08-12"), initialCash:100000, commission:0.0005, paramsUsed:met}});
  await p.btBacktestMetrics.create({data:{runId:run.id, finalValue:met.final_value, totalReturn:met.total_return, cagr:met.cagr, sharpe:met.sharpe, maxDrawdown:met.max_drawdown}});
  for(let i=0;i<tr.length;i+=200) await p.btTrade.createMany({data:tr.slice(i,i+200).map((t:any)=>({runId:run.id,ticker:t.ticker,side:t.side,size:t.size,price:t.price,value:t.value,commission:t.commission,datetime:new Date(t.datetime),targetPct:t.target_pct,indicators:t.indicators}))});
  await p.btAllocation.createMany({data:mo.map((a:any)=>({runId:run.id,date:new Date(a.date),tqqqPct:a.tqqq_pct,cashPct:a.cash_pct,tqqqValue:a.tqqq_value,cashValue:a.cash_value,portfolioValue:a.portfolio_value,targetPct:a.target_pct,indicators:a.indicators})),skipDuplicates:true});
  for(let i=0;i<eq.length;i+=500) await p.btEquityCurve.createMany({data:eq.slice(i,i+500).map((e:any)=>({runId:run.id,date:new Date(e.date),portfolioValue:e.portfolio_value}))});
  console.log("seeded V8",run.id,met.final_value);
}
m().finally(()=>p.$disconnect());
