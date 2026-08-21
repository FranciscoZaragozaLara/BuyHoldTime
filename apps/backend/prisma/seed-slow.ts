import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function main(){
  const code='SCHILLER_TQQQ_5A_MAX_CASH_SLOW';
  const strat = await prisma.btStrategy.upsert({ where:{ code }, update:{ name:'Schiller 5A MAX_CASH SLOW', description:'Clon slow-out HOLD 1.35 SELL 1.40→5% ramp 0.05', paramsSchema:{ hold_high:1.35, sell_5a:'slow', ramp_sell:0.05 }}, create:{ code, name:'Schiller 5A MAX_CASH SLOW', description:'Clon slow-out HOLD 1.35 SELL 1.40→5% ramp 0.05', paramsSchema:{ hold_high:1.35 }}});
  console.log('strategy', strat.id, code);
  const base='/Users/zilphfanel/Documents/AgyApps/BackTesting';
  const metrics = JSON.parse(fs.readFileSync(`${base}/result_schiller_5a_max_cash_slow.json`,'utf8'));
  // delete old runs for this strategy
  const oldRuns = await prisma.btBacktestRun.findMany({ where:{ strategyId: strat.id }});
  for(const r of oldRuns){
    await prisma.btTrade.deleteMany({ where:{ runId: r.id }});
    await prisma.btAllocation.deleteMany({ where:{ runId: r.id }});
    await prisma.btEquityCurve.deleteMany({ where:{ runId: r.id }});
    await prisma.btBacktestMetrics.deleteMany({ where:{ runId: r.id }});
    await prisma.btBacktestRun.delete({ where:{ id: r.id }});
  }
  const trades = JSON.parse(fs.readFileSync(`${base}/result_schiller_5a_max_cash_slow_trades.json`,'utf8'));
  const monthly = JSON.parse(fs.readFileSync(`${base}/result_schiller_5a_max_cash_slow_allocations_monthly.json`,'utf8'));
  const equity = JSON.parse(fs.readFileSync(`${base}/result_schiller_5a_max_cash_slow_equity_full.json`,'utf8'));
  const run = await prisma.btBacktestRun.create({ data:{ strategyId: strat.id, startDate: new Date('2010-02-11'), endDate: new Date('2026-08-12'), initialCash: 100000, commission: 0.0005, paramsUsed: metrics }});
  await prisma.btBacktestMetrics.create({ data:{ runId: run.id, finalValue: metrics.final_value, totalReturn: metrics.total_return, cagr: metrics.cagr, sharpe: metrics.sharpe, maxDrawdown: metrics.max_drawdown, maxDdLength: metrics.max_dd_length, numTrades: metrics.num_trades, winRate: metrics.win_rate, sqn: metrics.sqn }});
  for(let i=0;i<trades.length;i+=200){
    await prisma.btTrade.createMany({ data: trades.slice(i,i+200).map((t:any)=>({ runId: run.id, ticker: t.ticker, side: t.side, size: t.size, price: t.price, value: t.value, commission: t.commission, datetime: new Date(t.datetime), targetPct: t.target_pct, indicators: t.indicators }))});
  }
  await prisma.btAllocation.createMany({ data: monthly.map((a:any)=>({ runId: run.id, date: new Date(a.date), tqqqPct: a.tqqq_pct, cashPct: a.cash_pct, tqqqValue: a.tqqq_value, cashValue: a.cash_value, portfolioValue: a.portfolio_value, targetPct: a.target_pct, indicators: a.indicators })), skipDuplicates:true });
  for(let i=0;i<equity.length;i+=500){
    await prisma.btEquityCurve.createMany({ data: equity.slice(i,i+500).map((e:any)=>({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolio_value })), skipDuplicates:true });
  }
  console.log('created run', run.id, 'final', metrics.final_value, 'cagr', metrics.cagr);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
