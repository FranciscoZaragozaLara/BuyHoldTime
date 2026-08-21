import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const a=new PrismaPg({connectionString:process.env.DATABASE_URL||"postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime"});
const p=new PrismaClient({adapter:a});
async function seed(code:string, name:string, file:string, start:string){
  const strat=await p.btStrategy.upsert({where:{code}, update:{name, description:name}, create:{code, name, description:name, paramsSchema:{}}});
  const met=JSON.parse(fs.readFileSync(`/Users/zilphfanel/Documents/AgyApps/BackTesting/${file}`,"utf8"));
  const base=file.replace(".json","");
  const tradesFile=`/Users/zilphfanel/Documents/AgyApps/BackTesting/${base}_trades.json`;
  const allocsFile=`/Users/zilphfanel/Documents/AgyApps/BackTesting/${base}_allocations.json`;
  const allocsMonthlyFile=`/Users/zilphfanel/Documents/AgyApps/BackTesting/${base}_allocations_monthly.json`;
  const equityFile=`/Users/zilphfanel/Documents/AgyApps/BackTesting/${base}_equity_full.json`;
  const olds=await p.btBacktestRun.findMany({where:{strategyId:strat.id}});
  for(const r of olds){ await p.btTrade.deleteMany({where:{runId:r.id}}); await p.btAllocation.deleteMany({where:{runId:r.id}}); await p.btEquityCurve.deleteMany({where:{runId:r.id}}); await p.btBacktestMetrics.deleteMany({where:{runId:r.id}}); await p.btBacktestRun.delete({where:{id:r.id}}); }
  const run=await p.btBacktestRun.create({data:{strategyId:strat.id, startDate:new Date(start), endDate:new Date("2026-08-12"), initialCash:100000, commission:0.0005, paramsUsed:met}});
  await p.btBacktestMetrics.create({data:{runId:run.id, finalValue:met.final_value, totalReturn:met.total_return ?? 0, cagr:met.cagr, sharpe:met.sharpe ?? 0, maxDrawdown:met.max_drawdown}});
  // trades
  if(fs.existsSync(tradesFile)){
    const tr=JSON.parse(fs.readFileSync(tradesFile,"utf8"));
    for(let i=0;i<tr.length;i+=200) await p.btTrade.createMany({data:tr.slice(i,i+200).map((t:any)=>({runId:run.id,ticker:t.ticker,side:t.side,size:t.size,price:t.price,value:t.value,commission:t.commission,datetime:new Date(t.datetime),targetPct:t.target_pct,indicators:t.indicators}))});
  }
  // allocations - prefer daily, fallback monthly
  let allocFileToUse = fs.existsSync(allocsFile) ? allocsFile : (fs.existsSync(allocsMonthlyFile) ? allocsMonthlyFile : null);
  if(allocFileToUse){
    const mo=JSON.parse(fs.readFileSync(allocFileToUse,"utf8"));
    // allocations may be daily (4151) or monthly (187) - use as is, but for daily we sample monthly for DB to keep size? For equity curves we need daily. For now store all daily if exists else monthly
    const toStore = mo.length>500 ? mo.filter((_:any,i:number)=> i%5===0).slice(0,2000) : mo; // sample if too large to avoid huge DB, keep ~800 points
    // Actually for BH we have no allocations, skip
    if(toStore.length && toStore[0].tqqq_pct!==undefined){
      await p.btAllocation.createMany({data:toStore.map((a:any)=>({runId:run.id,date:new Date(a.date),tqqqPct:a.tqqq_pct ?? a.tqqqPct ?? 0,cashPct:a.cash_pct ?? a.cashPct ?? 0,tqqqValue:a.tqqq_value ?? a.tqqqValue ?? 0,cashValue:a.cash_value ?? a.cashValue ?? 0,portfolioValue:a.portfolio_value ?? a.portfolioValue ?? 0,targetPct:a.target_pct ?? a.targetPct ?? null,indicators:a.indicators})),skipDuplicates:true});
    }
  }
  // equity
  if(fs.existsSync(equityFile)){
    const eq=JSON.parse(fs.readFileSync(equityFile,"utf8"));
    for(let i=0;i<eq.length;i+=500) await p.btEquityCurve.createMany({data:eq.slice(i,i+500).map((e:any)=>({runId:run.id,date:new Date(e.date),portfolioValue:e.portfolio_value ?? e.portfolioValue ?? e.value}))});
  }
  console.log("seeded",code,met.final_value);
}
async function m(){
  await seed("VOO_BH_2010","VOO BuyHold 2010","result_voo_bh_2010.json","2010-09-09");
  await seed("VOO_SGOV_V8_2010","VOO SGOV V8 3y 2010","result_voo_sgov_2010.json","2010-09-09");
  await seed("SPY_BH_2010","SPY BuyHold 2010","result_spy_bh_2010.json","2010-09-09");
  await seed("SPY_SGOV_V8_2010","SPY SGOV V8 3y 2010","result_spy_sgov_2010.json","2010-09-09");
  await seed("SPY_BH_ORIGIN","SPY BuyHold Origen 1993","result_spy_bh_origin.json","1993-01-29");
  await seed("SPY_SGOV_ORIGIN","SPY SGOV Origen 1993","result_spy_sgov_origin.json","1993-01-29");
}
m().finally(()=>p.$disconnect());
