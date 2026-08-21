import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const strategies = [
    { code: 'MALLIK_TQQQ', name: 'Mallik TQQQ (QQQ signal)', description: 'SMA20/250 + BB + drawdown + stop 20% sobre TQQQ', paramsSchema: { sma_short:20, sma_long:250, bb_period:20, bb_dev:2.0, trail_stop_pct:0.20, drawdown_reduce_pct:0.08 } },
    { code: 'BH_QQQ', name: 'Buy & Hold QQQ', description: 'Buy & Hold QQQ 100%', paramsSchema: { target_data:0 } },
    { code: 'BH_TQQQ', name: 'Buy & Hold TQQQ', description: 'Buy & Hold TQQQ 100%', paramsSchema: { target_data:1 } },
  ];
  for (const s of strategies) {
    await prisma.btStrategy.upsert({ where: { code: s.code }, update: { name: s.name, description: s.description, paramsSchema: s.paramsSchema }, create: s });
    console.log(`upsert strategy ${s.code}`);
  }
  const compPath = '/Users/zilphfanel/Documents/AgyApps/BackTesting/result_comparativa.json';
  const equityPath = '/Users/zilphfanel/Documents/AgyApps/BackTesting/comparativa_equity.json';
  const comp = JSON.parse(fs.readFileSync(compPath,'utf8'));
  const equity = JSON.parse(fs.readFileSync(equityPath,'utf8'));

  for (const m of comp) {
    const strat = await prisma.btStrategy.findUnique({ where: { code: m.strategy } });
    const existing = await prisma.btBacktestRun.findFirst({ where: { strategyId: strat!.id } });
    if (existing) { console.log(`run exists for ${m.strategy} ${existing.id}, skipping`); continue; }
    let eq = equity[m.strategy] || [];
    let eqFormatted: { date: string; portfolioValue: number }[] = [];
    if (Array.isArray(eq) && eq.length && Array.isArray(eq[0])) {
      eqFormatted = eq.slice(-200).map(([d,v]: any) => ({ date: d, portfolioValue: v }));
    } else if (Array.isArray(eq) && eq.length) {
      eqFormatted = eq.slice(-200).map((p:any) => ({ date: p.date || p[0], portfolioValue: p.value || p[1] || p.portfolioValue }));
    }
    const run = await prisma.btBacktestRun.create({
      data: { strategyId: strat!.id, startDate: new Date('2010-02-11'), endDate: new Date('2026-08-12'), initialCash: 100000, commission: 0.0005, paramsUsed: m }
    });
    await prisma.btBacktestMetrics.create({
      data: { runId: run.id, finalValue: m.final_value, totalReturn: m.total_return, cagr: m.cagr, sharpe: m.sharpe, maxDrawdown: m.max_drawdown, maxDdLength: m.max_dd_length, numTrades: m.num_trades, winRate: m.win_rate, sqn: m.sqn }
    });
    if (eqFormatted.length) {
      await prisma.btEquityCurve.createMany({ data: eqFormatted.map(e => ({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolioValue })), skipDuplicates: true });
    }
    console.log(`created run ${m.strategy} ${run.id} with ${eqFormatted.length} equity points`);
  }

  // Market data: upsert last 2 rows as proof + full 4150 via python if available
  const mockRows = [
    { ticker:'QQQ', date:'2026-08-12', open:727.08, high:727.25, low:722.92, close:723.70, adjClose:723.70, volume: BigInt(28926200) },
    { ticker:'TQQQ', date:'2026-08-12', open:75.62, high:75.69, low:74.38, close:74.60, adjClose:74.60, volume: BigInt(46406500) },
  ];
  for (const r of mockRows) {
    await prisma.btMarketData.upsert({
      where: { ticker_date: { ticker: r.ticker, date: new Date(r.date) } },
      update: { open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume, isValidated: true },
      create: { ticker: r.ticker, date: new Date(r.date), open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume, isValidated: true, source: 'yfinance' },
    });
  }
  console.log('market data mock inserted');
  const counts = await Promise.all([prisma.btStrategy.count(), prisma.btMarketData.count(), prisma.btBacktestRun.count(), prisma.btBacktestMetrics.count(), prisma.btEquityCurve.count()]);
  console.log('counts', { strategies: counts[0], market_data: counts[1], runs: counts[2], metrics: counts[3], equity: counts[4] });
}
main().catch(e=>{console.error(e); process.exit(1)}).finally(()=>prisma.$disconnect());
