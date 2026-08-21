import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const code = 'SCHD_BH';
  const strat = await prisma.btStrategy.upsert({
    where: { code },
    update: { name: 'SCHD Buy&Hold (inception 2011-10-20)', description: 'SCHD Buy&Hold Total Return con dividendos reinvertidos, split 3:1 2024-10-11', paramsSchema: { ticker: 'SCHD', inception: '2011-10-20', split: '2024-10-11 3:1', auto_adjust: true } },
    create: { code, name: 'SCHD Buy&Hold (inception 2011-10-20)', description: 'SCHD Buy&Hold Total Return con dividendos reinvertidos, split 3:1 2024-10-11', paramsSchema: { ticker: 'SCHD', inception: '2011-10-20' } },
  });
  console.log(`Strategy ${code} -> ${strat.id}`);

  const base = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
  // Borrar runs previos de esta estrategia para re-sembrar
  const olds = await prisma.btBacktestRun.findMany({ where: { strategyId: strat.id } });
  for (const r of olds) {
    await prisma.btTrade.deleteMany({ where: { runId: r.id } });
    await prisma.btAllocation.deleteMany({ where: { runId: r.id } });
    await prisma.btEquityCurve.deleteMany({ where: { runId: r.id } });
    await prisma.btBacktestMetrics.deleteMany({ where: { runId: r.id } });
    await prisma.btBacktestRun.delete({ where: { id: r.id } });
  }
  console.log(`Borrados ${olds.length} runs previos`);

  // Fechas viables >= inception (las sembradas hoy)
  const dates = [
    "2011-10-20","2012-01-03","2013-01-02","2014-01-02","2015-01-02","2016-01-04","2017-01-03","2018-01-02","2019-01-02","2020-01-02","2020-03-23","2021-01-04","2022-01-03","2022-10-12","2023-01-03","2024-01-02","2025-01-02","2025-04-08","2026-01-02","2026-04-01"
  ];

  for (const ds of dates) {
    const metPath = `${base}/result_schd_bh_${ds}.json`;
    const eqPath = `${base}/result_schd_bh_${ds}_equity.json`;
    if (!fs.existsSync(metPath) || !fs.existsSync(eqPath)) {
      console.log(`skip ${ds} falta ${metPath}`);
      continue;
    }
    const met = JSON.parse(fs.readFileSync(metPath, 'utf8'));
    const equity: { date: string; portfolioValue: number }[] = JSON.parse(fs.readFileSync(eqPath, 'utf8'));
    if (!equity.length) { console.log(`skip ${ds} equity vacío`); continue; }
    const endDate = equity[equity.length - 1].date;
    const run = await prisma.btBacktestRun.create({
      data: {
        strategyId: strat.id,
        startDate: new Date(ds),
        endDate: new Date(endDate),
        initialCash: 100000,
        commission: 0.0005,
        paramsUsed: met,
      },
    });
    await prisma.btBacktestMetrics.create({
      data: {
        runId: run.id,
        finalValue: met.final_value,
        totalReturn: met.total_return,
        cagr: met.cagr,
        sharpe: met.sharpe,
        maxDrawdown: met.max_drawdown,
        maxDdLength: met.max_dd_length,
        numTrades: met.num_trades,
        winRate: met.win_rate ?? 0,
        sqn: met.sqn ?? 0,
      },
    });
    // equity (soporta snake_case de python)
    const eqData = equity.map((e: any) => ({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolioValue ?? e.portfolio_value }));
    // chunk insert 1000
    for (let i = 0; i < eqData.length; i += 1000) {
      await prisma.btEquityCurve.createMany({ data: eqData.slice(i, i + 1000) });
    }
    // allocations + trades (si existen)
    const allocPath = `${base}/result_schd_bh_${ds}_allocations.json`;
    const tradesPath = `${base}/result_schd_bh_${ds}_trades.json`;
    if (fs.existsSync(allocPath)) {
      const allocs: any[] = JSON.parse(fs.readFileSync(allocPath, 'utf8'));
      if (allocs.length) {
        // mapear SCHD_BH: schd_value -> tqqqValue (reuso columna tqqq para SCHD)
        const allocData = allocs.map((a: any) => ({
          runId: run.id,
          date: new Date(a.date),
          tqqqPct: a.schd_value && a.portfolio_value ? a.schd_value / a.portfolio_value : 1.0,
          cashPct: a.cash_value && a.portfolio_value ? a.cash_value / a.portfolio_value : 0,
          tqqqValue: a.schd_value ?? a.tqqq_value ?? 0,
          cashValue: a.cash_value ?? 0,
          portfolioValue: a.portfolio_value,
          targetPct: 1.0,
          indicators: {},
        }));
        for (let i = 0; i < allocData.length; i += 500) {
          await prisma.btAllocation.createMany({ data: allocData.slice(i, i + 500) });
        }
      }
    }
    if (fs.existsSync(tradesPath)) {
      const trades: any[] = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));
      if (trades.length) {
        const tradeData = trades.map((t: any) => ({
          runId: run.id,
          ticker: t.ticker || 'SCHD',
          side: t.side,
          size: t.size,
          price: t.price,
          value: t.value,
          commission: t.commission ?? 0,
          datetime: new Date(t.datetime || t.date),
          targetPct: 1.0,
          indicators: {},
        }));
        for (let i = 0; i < tradeData.length; i += 200) {
          await prisma.btTrade.createMany({ data: tradeData.slice(i, i + 200) });
        }
      }
    }
    console.log(`Seeded ${ds} -> ${endDate} Final ${met.final_value} CAGR ${(met.cagr*100).toFixed(2)}% (${equity.length} pts) run ${run.id}`);
  }
  const total = await prisma.btBacktestRun.count({ where: { strategyId: strat.id } });
  console.log(`Done SCHD_BH total runs ${total}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
