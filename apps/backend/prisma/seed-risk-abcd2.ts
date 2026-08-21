import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });
async function seedOne(code:string, name:string, suffix:string){
  const strat = await prisma.btStrategy.upsert({ where:{ code }, update:{ name, description: suffix, paramsSchema:{ suffix }}, create:{ code, name, description: suffix, paramsSchema:{ suffix }}});
  const base='/Users/zilphfanel/Documents/AgyApps/BackTesting';
  const metrics = JSON.parse(fs.readFileSync(`${base}/result_${suffix}.json`,'utf8'));
  const oldRuns = await prisma.btBacktestRun.findMany({ where:{ strategyId: strat.id }});
  for(const r of oldRuns){
    await prisma.btTrade.deleteMany({ where:{ runId: r.id }});
    await prisma.btAllocation.deleteMany({ where:{ runId: r.id }});
    await prisma.btEquityCurve.deleteMany({ where:{ runId: r.id }});
    await prisma.btBacktestMetrics.deleteMany({ where:{ runId: r.id }});
    await prisma.btBacktestRun.delete({ where:{ id: r.id }});
  }
  const trades = JSON.parse(fs.readFileSync(`${base}/result_${suffix}_trades.json`,'utf8'));
  const monthly = JSON.parse(fs.readFileSync(`${base}/result_${suffix}_allocations_monthly.json`,'utf8'));
  const equity = JSON.parse(fs.readFileSync(`${base}/result_${suffix}_equity_full.json`,'utf8'));
  const run = await prisma.btBacktestRun.create({ data:{ strategyId: strat.id, startDate: new Date('2010-02-11'), endDate: new Date('2026-08-12'), initialCash: 100000, commission: 0.0005, paramsUsed: metrics }});
  await prisma.btBacktestMetrics.create({ data:{ runId: run.id, finalValue: metrics.final_value, totalReturn: metrics.total_return, cagr: metrics.cagr, sharpe: metrics.sharpe, maxDrawdown: metrics.max_drawdown, maxDdLength: metrics.max_dd_length, numTrades: metrics.num_trades, winRate: metrics.win_rate, sqn: metrics.sqn }});
  for(let i=0;i<trades.length;i+=200) await prisma.btTrade.createMany({ data: trades.slice(i,i+200).map((t:any)=>({ runId: run.id, ticker: t.ticker, side: t.side, size: t.size, price: t.price, value: t.value, commission: t.commission, datetime: new Date(t.datetime), targetPct: t.target_pct, indicators: t.indicators }))});
  await prisma.btAllocation.createMany({ data: monthly.map((a:any)=>({ runId: run.id, date: new Date(a.date), tqqqPct: a.tqqq_pct, cashPct: a.cash_pct, tqqqValue: a.tqqq_value, cashValue: a.cash_value, portfolioValue: a.portfolio_value, targetPct: a.target_pct, indicators: a.indicators })), skipDuplicates:true });
  for(let i=0;i<equity.length;i+=500) await prisma.btEquityCurve.createMany({ data: equity.slice(i,i+500).map((e:any)=>({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolio_value })), skipDuplicates:true });
  console.log('seeded',code, run.id, metrics.final_value);
}
async function main(){
  await seedOne('SCHILLER_TQQQ_5A_RISK_A','Schiller 5A RISK A (alto riesgo 0.70)','schiller_5a_risk_a');
  await seedOne('SCHILLER_TQQQ_5A_RISK_B','Schiller 5A RISK B (QQQ dist>25%)','schiller_5a_risk_b');
  await seedOne('SCHILLER_TQQQ_5A_RISK_C','Schiller 5A RISK C (QQQ peak -4%)','schiller_5a_risk_c');
  await seedOne('SCHILLER_TQQQ_5A_RISK_D','Schiller 5A RISK D (BIL yield >1.5%)','schiller_5a_risk_d');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
