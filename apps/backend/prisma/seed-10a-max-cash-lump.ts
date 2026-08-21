import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main(){
  const code='SCHILLER_TQQQ_10A_MAX_CASH';
  const run = await prisma.btBacktestRun.findFirst({ where:{ strategy:{ code }}, orderBy:{ createdAt:'desc'}});
  if(!run){ console.log('no run', code); return; }
  console.log('Run', run.id);
  const base='/Users/zilphfanel/Documents/AgyApps/BackTesting';
  const metrics = JSON.parse(fs.readFileSync(`${base}/result_schiller_10a_max_cash.json`,'utf8'));
  const trades = JSON.parse(fs.readFileSync(`${base}/result_schiller_10a_max_cash_trades.json`,'utf8'));
  const monthly = JSON.parse(fs.readFileSync(`${base}/result_schiller_10a_max_cash_allocations_monthly.json`,'utf8'));
  const equity = JSON.parse(fs.readFileSync(`${base}/result_schiller_10a_max_cash_equity_full.json`,'utf8'));
  console.log('metrics', metrics.final_value, metrics.cagr, 'trades', trades.length, 'monthly', monthly.length, 'equity', equity.length);
  await prisma.btBacktestMetrics.update({ where:{ runId: run.id }, data:{
    finalValue: metrics.final_value,
    totalReturn: metrics.total_return,
    cagr: metrics.cagr,
    sharpe: metrics.sharpe,
    maxDrawdown: metrics.max_drawdown,
    maxDdLength: metrics.max_dd_length,
    numTrades: metrics.num_trades,
    winRate: metrics.win_rate,
    sqn: metrics.sqn,
  }});
  await prisma.btTrade.deleteMany({ where:{ runId: run.id }});
  for(let i=0;i<trades.length;i+=200){
    await prisma.btTrade.createMany({ data: trades.slice(i,i+200).map((t:any)=>({
      runId: run.id, ticker: t.ticker, side: t.side, size: t.size, price: t.price, value: t.value, commission: t.commission, datetime: new Date(t.datetime), targetPct: t.target_pct, indicators: t.indicators,
    }))});
  }
  await prisma.btAllocation.deleteMany({ where:{ runId: run.id }});
  await prisma.btAllocation.createMany({ data: monthly.map((a:any)=>({
    runId: run.id, date: new Date(a.date), tqqqPct: a.tqqq_pct, cashPct: a.cash_pct, tqqqValue: a.tqqq_value, cashValue: a.cash_value, portfolioValue: a.portfolio_value, targetPct: a.target_pct, indicators: a.indicators,
  })), skipDuplicates:true });
  await prisma.btEquityCurve.deleteMany({ where:{ runId: run.id }});
  for(let i=0;i<equity.length;i+=500){
    await prisma.btEquityCurve.createMany({ data: equity.slice(i,i+500).map((e:any)=>({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolio_value, drawdown: e.drawdown ? e.drawdown/100 : null })), skipDuplicates:true });
  }
  const counts=await Promise.all([prisma.btTrade.count({where:{runId:run.id}}), prisma.btAllocation.count({where:{runId:run.id}}), prisma.btEquityCurve.count({where:{runId:run.id}})]);
  console.log('counts', counts);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
