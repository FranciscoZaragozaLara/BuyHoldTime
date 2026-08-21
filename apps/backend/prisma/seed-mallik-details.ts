import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const run = await prisma.btBacktestRun.findFirst({ where: { strategy: { code: 'MALLIK_TQQQ' } }, orderBy: { createdAt: 'desc' } });
  if (!run) throw new Error('MALLIK run not found');
  console.log('Run', run.id);

  const tradesPath = '/Users/zilphfanel/Documents/AgyApps/BackTesting/result_mallik_trades.json';
  const monthlyPath = '/Users/zilphfanel/Documents/AgyApps/BackTesting/result_mallik_allocations_monthly.json';
  const dailyAllocPath = '/Users/zilphfanel/Documents/AgyApps/BackTesting/result_mallik_allocations.json';

  const trades = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));
  const monthly = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));

  // clean existing
  await prisma.btTrade.deleteMany({ where: { runId: run.id } });
  await prisma.btAllocation.deleteMany({ where: { runId: run.id } });
  console.log('cleaned');

  // insert trades (batch 200)
  for (let i = 0; i < trades.length; i += 200) {
    const chunk = trades.slice(i, i + 200);
    await prisma.btTrade.createMany({
      data: chunk.map((t: any) => ({
        runId: run.id,
        ticker: t.ticker,
        side: t.side,
        size: t.size,
        price: t.price,
        value: t.value,
        commission: t.commission,
        datetime: new Date(t.datetime),
        targetPct: t.target_pct,
        indicators: t.indicators,
      })),
    });
  }
  console.log(`inserted ${trades.length} trades`);

  // insert allocations monthly (187)
  await prisma.btAllocation.createMany({
    data: monthly.map((a: any) => ({
      runId: run.id,
      date: new Date(a.date),
      tqqqPct: a.tqqq_pct,
      cashPct: a.cash_pct,
      tqqqValue: a.tqqq_value,
      cashValue: a.cash_value,
      portfolioValue: a.portfolio_value,
      targetPct: a.target_pct,
      indicators: a.indicators,
    })),
    skipDuplicates: true,
  });
  console.log(`inserted ${monthly.length} allocations`);

  const counts = await Promise.all([prisma.btTrade.count({ where: { runId: run.id } }), prisma.btAllocation.count({ where: { runId: run.id } })]);
  console.log('counts', counts);

  // also update equityCurve to full if currently only 200: replace with dailyAlloc equity
  const existingEq = await prisma.btEquityCurve.count({ where: { runId: run.id } });
  console.log('existing equity', existingEq);
  if (existingEq < 1000) {
    const dailyAllocs = JSON.parse(fs.readFileSync(dailyAllocPath, 'utf8'));
    // replace: delete and insert full 3901
    await prisma.btEquityCurve.deleteMany({ where: { runId: run.id } });
    const equityData = dailyAllocs.map((a: any) => ({ runId: run.id, date: new Date(a.date), portfolioValue: a.portfolio_value, drawdown: a.indicators.dd_portfolio_pct / 100 }));
    for (let i = 0; i < equityData.length; i += 500) {
      await prisma.btEquityCurve.createMany({ data: equityData.slice(i, i + 500), skipDuplicates: true });
    }
    console.log('replaced equityCurve with', equityData.length);
  }
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
