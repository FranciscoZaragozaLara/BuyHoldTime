import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import { spawn } from 'child_process';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
const BASE = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
function inferTicker(code:string, strat:any){ return 'TQQQ'; }
function resolveScript(code:string){ return 'run_generic_bh.py'; }
async function runPython(script:string, startDate:string, ticker:string){
  return new Promise<void>((resolve,reject)=>{
    const env:any={...process.env, START_DATE:startDate, TICKER:ticker};
    const proc=spawn('python3',[script],{cwd:BASE, env});
    let stderr='';
    proc.stderr.on('data',d=>stderr+=d.toString());
    proc.on('close',c=>c===0?resolve():reject(new Error(`${script} ${startDate} ${stderr.slice(0,500)}`)));
  });
}
async function main(){
  const strat = await prisma.btStrategy.findUnique({where:{code:'BH_TQQQ'}});
  if(!strat) throw new Error('no strat');
  const startDates = await prisma.btStartDate.findMany({orderBy:{startDate:'asc'}});
  const all = startDates.map(d=>d.startDate.toISOString().slice(0,10));
  const viable = all.filter(d=> d >= '2010-02-11'); // inception BH_TQQQ
  const existing = await prisma.btBacktestRun.findMany({where:{strategyId:strat.id}});
  const exMap = new Map(existing.map(r=>[r.startDate.toISOString().slice(0,10), r]));
  console.log(`BH_TQQQ viable ${viable.length}, existing ${existing.length}`);
  let created=0;
  for(const ds of viable){
    if(exMap.has(ds)){
      console.log(`skip ${ds} exists`);
      continue;
    }
    console.log(`creating ${ds}...`);
    const script = 'run_generic_bh.py';
    const ticker='TQQQ';
    try{ await runPython(script, ds, ticker); }catch(e:any){ console.error(`fail ${ds} ${e.message}`); continue; }
    const metPath = `${BASE}/result_${ticker.toLowerCase()}_bh_${ds}.json`;
    if(!fs.existsSync(metPath)){ console.error(`no met ${metPath}`); continue; }
    const met = JSON.parse(fs.readFileSync(metPath,'utf8'));
    const eqPath = `${BASE}/result_${ticker.toLowerCase()}_bh_${ds}_equity.json`;
    let endDate = met.endDate || met.end_date || '2026-08-17';
    try{ const eq=JSON.parse(fs.readFileSync(eqPath,'utf8')); endDate=eq[eq.length-1].date; }catch{}
    const run = await prisma.btBacktestRun.create({data:{strategyId:strat.id, startDate:new Date(ds), endDate:new Date(endDate), initialCash:100000, commission:0.0005, paramsUsed:met}});
    await prisma.btBacktestMetrics.create({data:{runId:run.id, finalValue:met.final_value ?? met.finalValue, totalReturn:met.total_return ?? met.totalReturn, cagr:met.cagr, sharpe:met.sharpe, maxDrawdown:met.max_drawdown ?? met.maxDrawdown, maxDdLength:met.max_dd_length ?? 0, numTrades:met.num_trades ?? 0, winRate:met.win_rate ?? 0, sqn:met.sqn ?? 0}});
    // seed equity/allocs/trades
    const eq = JSON.parse(fs.readFileSync(eqPath,'utf8'));
    for(let i=0;i<eq.length;i+=500){
      await prisma.btEquityCurve.createMany({data:eq.slice(i,i+500).map((e:any)=>({runId:run.id, date:new Date(e.date), portfolioValue:e.portfolioValue ?? e.portfolio_value}))});
    }
    const allocPath = `${BASE}/result_${ticker.toLowerCase()}_bh_${ds}_allocations.json`;
    if(fs.existsSync(allocPath)){
      const allocs=JSON.parse(fs.readFileSync(allocPath,'utf8'));
      for(let i=0;i<allocs.length;i+=500){
        await prisma.btAllocation.createMany({data:allocs.slice(i,i+500).map((a:any)=>({runId:run.id, date:new Date(a.date), tqqqPct:a.tqqq_pct ??1, cashPct:a.cash_pct??0, tqqqValue:a.tqqq_value??0, cashValue:a.cash_value??0, portfolioValue:a.portfolio_value??a.portfolioValue, targetPct:a.target_pct??null, indicators:a.indicators??{}}))});
      }
    }
    const tradePath = `${BASE}/result_${ticker.toLowerCase()}_bh_${ds}_trades.json`;
    if(fs.existsSync(tradePath)){
      const trades=JSON.parse(fs.readFileSync(tradePath,'utf8'));
      const filtered=trades.filter((t:any)=>(t.datetime||'').slice(0,10)>=ds);
      for(let i=0;i<filtered.length;i+=200){
        await prisma.btTrade.createMany({data:filtered.slice(i,i+200).map((t:any)=>({runId:run.id, ticker:t.ticker||'TQQQ', side:t.side, size:t.size, price:t.price, value:t.value, commission:t.commission??0, datetime:new Date(t.datetime), targetPct:t.target_pct??null, indicators:t.indicators??{}}))});
      }
    }
    console.log(`  done ${ds} -> ${endDate} fv ${met.final_value}`);
    created++;
  }
  console.log(`created ${created}`);
  const cnt=await prisma.btBacktestRun.count({where:{strategyId:strat.id}});
  console.log(`total runs now ${cnt}`);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e); process.exit(1)});
