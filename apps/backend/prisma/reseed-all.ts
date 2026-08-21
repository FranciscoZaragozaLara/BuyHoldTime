import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import { spawn } from 'child_process';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/buyholdtime' });
const prisma = new PrismaClient({ adapter });

const BASE = '/Users/zilphfanel/Documents/AgyApps/BackTesting';

function resolveInception(strategy: any): string {
  const explicit = strategy?.paramsSchema?.inception as string | undefined;
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const ticker = (strategy?.paramsSchema?.ticker as string | undefined)?.toUpperCase();
  const map: Record<string,string> = { TQQQ:'2010-02-11', QQQ:'1999-03-10', SPY:'1993-01-29', VOO:'2010-09-09', SCHD:'2011-10-20', JEPQ:'2022-05-03', SQQQ:'2010-02-11', SGOV:'2020-06-01', BIL:'2007-05-30', JEPI:'2020-05-20' };
  if (ticker && map[ticker]) return map[ticker];
  const code = strategy.code.toUpperCase();
  const token = code.split('_')[0];
  if (map[token]) return map[token];
  if (code.includes('TQQQ')) return '2010-02-11';
  if (code.includes('SCHD')) return '2011-10-20';
  if (code.includes('JEPQ')) return '2022-05-03';
  if (code.includes('SQQQ')) return '2010-02-11';
  if (code.includes('SPY')) return '1993-01-29';
  if (code.includes('VOO')) return '2010-09-09';
  if (code.includes('QQQ')) return '1999-03-10';
  return '1993-01-29';
}

function inferTicker(code: string, strat: any): string | undefined {
  const explicit = (strat?.paramsSchema?.ticker as string | undefined)?.toUpperCase();
  if (explicit) return explicit;
  const c = code.toUpperCase();
  if (c.includes('SCHD')) return 'SCHD';
  if (c.includes('JEPQ')) return 'JEPQ';
  if (c.includes('SQQQ')) return 'SQQQ';
  if (c.includes('TQQQ')) return 'TQQQ';
  if (c.includes('VOO')) return 'VOO';
  if (c.includes('SPY')) return 'SPY';
  if (c.includes('QQQ')) return 'QQQ';
  return undefined;
}
function resolveScript(code: string, strat: any): string {
  const lower = code.toLowerCase();
  const inferredTicker = inferTicker(code, strat)?.toLowerCase();
  const candidates = [`run_${lower}.py`, `run_${lower.replace('bh_','')}_bh.py`, inferredTicker ? `run_${inferredTicker}_bh.py` : null, strat?.paramsSchema?.ticker ? `run_${strat.paramsSchema.ticker.toLowerCase()}_bh.py` : null].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(`${BASE}/${c}`)) return c;
  const legacy: Record<string,string> = { 'SCHILLER_TQQQ_3A_RISK_D_V8':'run_risk_d_3a_v8.py', 'SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH':'run_risk_d_3a_v8_zilph.py' };
  if (legacy[code]) return legacy[code];
  if (code.includes('SCHILLER') && code.includes('TQQQ')) {
    const variants: Record<string,string> = { 'SCHILLER_TQQQ_5A':'run_risk_d_v4.py', 'SCHILLER_TQQQ_5A_RISK_D':'run_risk_d_v2.py', 'SCHILLER_TQQQ_5A_RISK_D_V3':'run_risk_d_v3.py', 'SCHILLER_TQQQ_5A_RISK_D_V4':'run_risk_d_v4.py', 'SCHILLER_TQQQ_5A_RISK_D_V4_V5':'run_risk_d_v4_v5.py', 'SCHILLER_TQQQ_5A_RISK_D_V6':'run_risk_d_v6.py', 'SCHILLER_TQQQ_3A_RISK_D_V6':'run_risk_d_3a_v6.py', 'SCHILLER_TQQQ_3A_RISK_D_V7':'run_risk_d_3a_v7.py' };
    if (variants[code] && fs.existsSync(`${BASE}/${variants[code]}`)) return variants[code];
  }
  if (code.startsWith('BH_') || code.includes('_BH')) return 'run_generic_bh.py';
  const ticker = inferredTicker || strat?.paramsSchema?.ticker?.toLowerCase();
  if (ticker && fs.existsSync(`${BASE}/run_${ticker}_bh.py`)) return `run_${ticker}_bh.py`;
  return 'run_generic_bh.py';
}

async function runPython(script: string, startDate: string, ticker?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const env: any = { ...process.env, START_DATE: startDate };
    if (ticker) env.TICKER = ticker.toUpperCase();
    const proc = spawn('python3', [script], { cwd: BASE, env });
    let stderr='';
    proc.stderr.on('data', d=> stderr+=d.toString());
    proc.on('close', code=> code===0 ? resolve() : reject(new Error(`Backtest ${script} ${startDate} failed ${code}: ${stderr.slice(0,800)}`)));
  });
}

async function seedRunFromFiles(strategy: any, startDate: string, runId: string) {
  // busca archivos per-date generados por python
  const lower = strategy.code.toLowerCase();
  const ticker = (inferTicker(strategy.code, strategy) || strategy.paramsSchema?.ticker?.toLowerCase())?.toLowerCase();
  const candidatesEquity = [
    `${BASE}/result_${lower}_${startDate}_equity.json`,
    ticker ? `${BASE}/result_${ticker}_bh_${startDate}_equity.json` : null,
    `${BASE}/result_${lower}_equity_full.json`,
    ticker ? `${BASE}/result_${ticker}_bh_equity_full.json` : null,
  ].filter(Boolean) as string[];
  const candidatesAllocs = [
    `${BASE}/result_${lower}_${startDate}_allocations.json`,
    ticker ? `${BASE}/result_${ticker}_bh_${startDate}_allocations.json` : null,
    `${BASE}/result_${lower}_allocations.json`,
  ].filter(Boolean) as string[];
  const candidatesTrades = [
    `${BASE}/result_${lower}_${startDate}_trades.json`,
    ticker ? `${BASE}/result_${ticker}_bh_${startDate}_trades.json` : null,
    `${BASE}/result_${lower}_trades.json`,
  ].filter(Boolean) as string[];
  const candidatesMetrics = [
    `${BASE}/result_${lower}_${startDate}.json`,
    ticker ? `${BASE}/result_${ticker}_bh_${startDate}.json` : null,
    `${BASE}/result_${lower}.json`,
  ].filter(Boolean) as string[];

  let met:any=null;
  for(const p of candidatesMetrics) if(fs.existsSync(p)){ try{ met=JSON.parse(fs.readFileSync(p,'utf8')); break;}catch{}}
  if(!met) throw new Error(`No metrics file for ${strategy.code} ${startDate}`);

  // equity
  let eq:any[]|null=null;
  for(const p of candidatesEquity) if(fs.existsSync(p)){ try{ eq=JSON.parse(fs.readFileSync(p,'utf8')); break;}catch{}}
  if(eq){
    const filtered = eq.filter((e:any)=>(e.date||'').slice(0,10) >= startDate);
    const norm = filtered.map((e:any)=>({ runId, date:new Date(e.date), portfolioValue:e.portfolioValue ?? e.portfolio_value }));
    for(let i=0;i<norm.length;i+=500) await prisma.btEquityCurve.createMany({data:norm.slice(i,i+500), skipDuplicates:true});
  }
  // allocations
  let allocs:any[]|null=null;
  for(const p of candidatesAllocs) if(fs.existsSync(p)){ try{ allocs=JSON.parse(fs.readFileSync(p,'utf8')); break;}catch{}}
  if(allocs){
    const filtered = allocs.filter((a:any)=>(a.date||'').slice(0,10) >= startDate);
    if(filtered.length){
      const allocData = filtered.map((a:any)=>({
        runId, date:new Date(a.date),
        tqqqPct: a.tqqq_pct ?? a.tqqqPct ?? (a.schd_value && a.portfolio_value ? a.schd_value/a.portfolio_value : (a.jepq_value && a.portfolio_value ? a.jepq_value/a.portfolio_value : 1)),
        cashPct: a.cash_pct ?? a.cashPct ?? (a.cash_value && a.portfolio_value ? a.cash_value/a.portfolio_value : 0),
        tqqqValue: a.tqqq_value ?? a.tqqqValue ?? a.schd_value ?? a.jepq_value ?? 0,
        cashValue: a.cash_value ?? a.cashValue ?? 0,
        portfolioValue: a.portfolio_value ?? a.portfolioValue,
        targetPct: a.target_pct ?? a.targetPct ?? null,
        indicators: a.indicators ?? {},
      }));
      for(let i=0;i<allocData.length;i+=500) await prisma.btAllocation.createMany({data:allocData.slice(i,i+500), skipDuplicates:true});
    }
  }
  // trades
  let trades:any[]|null=null;
  for(const p of candidatesTrades) if(fs.existsSync(p)){ try{ trades=JSON.parse(fs.readFileSync(p,'utf8')); break;}catch{}}
  if(trades){
    const filtered = trades.filter((t:any)=>(t.datetime||'').slice(0,10) >= startDate);
    if(filtered.length){
      const tradeData = filtered.map((t:any)=>({
        runId, ticker:t.ticker || ticker?.toUpperCase() || 'TQQQ',
        side:t.side, size:t.size, price:t.price, value:t.value, commission:t.commission??0,
        datetime:new Date(t.datetime), targetPct:t.target_pct ?? t.targetPct ?? null, indicators:t.indicators ?? {},
      }));
      for(let i=0;i<tradeData.length;i+=200) await prisma.btTrade.createMany({data:tradeData.slice(i,i+200), skipDuplicates:true});
    }
  }
}

async function main(){
  const strategies = await prisma.btStrategy.findMany({orderBy:{code:'asc'}});
  const startDates = await prisma.btStartDate.findMany({orderBy:{startDate:'asc'}});
  const allDatesStr = startDates.map(d=>d.startDate.toISOString().slice(0,10));
  console.log(`Strategies ${strategies.length}, dates ${allDatesStr.length}`);

  for(const strat of strategies){
    const isZilph = strat.code.includes('ZILPH');
    const inception = resolveInception(strat);
    const viable = allDatesStr.filter(d=> d >= inception);
    console.log(`\n=== ${strat.code} inception ${inception} viable ${viable.length} isZilph=${isZilph} ===`);
    const existingRuns = await prisma.btBacktestRun.findMany({where:{strategyId: strat.id}});
    const existingMap = new Map(existingRuns.map(r=>[r.startDate.toISOString().slice(0,10), r]));

    if(!isZilph){
      // borrar todos
      if(existingRuns.length){
        console.log(`  Borrando ${existingRuns.length} runs previos`);
        for(const r of existingRuns){
          await prisma.btTrade.deleteMany({where:{runId:r.id}});
          await prisma.btAllocation.deleteMany({where:{runId:r.id}});
          await prisma.btEquityCurve.deleteMany({where:{runId:r.id}});
          await prisma.btBacktestMetrics.deleteMany({where:{runId:r.id}});
        }
        await prisma.btBacktestRun.deleteMany({where:{strategyId: strat.id}});
      }
    } else {
      console.log(`  ZILPH: conservar ${existingRuns.length} runs, solo añadir faltantes`);
    }

    let created=0;
    for(const ds of viable){
      if(isZilph && existingMap.has(ds)){
        // verificar si tiene equity/allocs
        const r = existingMap.get(ds)!;
        const [eqC, allocC] = await Promise.all([
          prisma.btEquityCurve.count({where:{runId:r.id}}),
          prisma.btAllocation.count({where:{runId:r.id}}),
        ]);
        if(eqC>0 && allocC>0){
          console.log(`  skip ZILPH ${ds} ya completo eq=${eqC} alloc=${allocC}`);
          continue;
        } else {
          console.log(`  ZILPH ${ds} incompleto eq=${eqC} alloc=${allocC} -> resembrar`);
          await prisma.btTrade.deleteMany({where:{runId:r.id}});
          await prisma.btAllocation.deleteMany({where:{runId:r.id}});
          await prisma.btEquityCurve.deleteMany({where:{runId:r.id}});
          await prisma.btBacktestMetrics.deleteMany({where:{runId:r.id}});
          await prisma.btBacktestRun.delete({where:{id:r.id}});
        }
      }
      // si es Zilph y no existía, o no-Zilph (ya borrado), crear nuevo run vía python + seed
      const script = resolveScript(strat.code, strat);
      const ticker = inferTicker(strat.code, strat) || (strat as any).paramsSchema?.ticker as string | undefined;
      console.log(`  Run ${ds} via ${script} ${ticker||''}`);
      try{
        await runPython(script, ds, ticker);
      } catch(e:any){
        console.error(`    FAIL python ${ds}: ${e.message.slice(0,200)}`);
        continue;
      }
      // leer metrics del archivo recién generado (per-date)
      const lower = strat.code.toLowerCase();
      const tickerLower = ticker?.toLowerCase();
      let metPath = `${BASE}/result_${lower}_${ds}.json`;
      if(!fs.existsSync(metPath) && tickerLower) metPath = `${BASE}/result_${tickerLower}_bh_${ds}.json`;
      if(!fs.existsSync(metPath)) metPath = `${BASE}/result_${lower}.json`;
      if(!fs.existsSync(metPath) && tickerLower) metPath = `${BASE}/result_${tickerLower}_bh.json`;
      if(!fs.existsSync(metPath)){
        console.error(`    No metrics file ${metPath}`);
        continue;
      }
      const met = JSON.parse(fs.readFileSync(metPath,'utf8'));
      const endDate = (()=>{ try{ const eqPath = fs.existsSync(`${BASE}/result_${lower}_${ds}_equity.json`) ? `${BASE}/result_${lower}_${ds}_equity.json` : (tickerLower && fs.existsSync(`${BASE}/result_${tickerLower}_bh_${ds}_equity.json`) ? `${BASE}/result_${tickerLower}_bh_${ds}_equity.json` : `${BASE}/result_${lower}_equity_full.json`); const eq = JSON.parse(fs.readFileSync(eqPath,'utf8')); return eq[eq.length-1].date; }catch{ return met.endDate || met.end_date || '2026-08-17'; }})();
      const run = await prisma.btBacktestRun.create({
        data:{ strategyId: strat.id, startDate:new Date(ds), endDate:new Date(endDate), initialCash:100000, commission:0.0005, paramsUsed: met }
      });
      await prisma.btBacktestMetrics.create({
        data:{ runId: run.id, finalValue: met.final_value ?? met.finalValue, totalReturn: met.total_return ?? met.totalReturn, cagr: met.cagr, sharpe: met.sharpe, maxDrawdown: met.max_drawdown ?? met.maxDrawdown, maxDdLength: met.max_dd_length ?? met.maxDdLength ?? 0, numTrades: met.num_trades ?? met.numTrades ?? 0, winRate: met.win_rate ?? met.winRate ?? 0, sqn: met.sqn ?? 0 }
      });
      await seedRunFromFiles(strat, ds, run.id);
      // verificar
      const [eqC, allocC, tradeC] = await Promise.all([
        prisma.btEquityCurve.count({where:{runId:run.id}}),
        prisma.btAllocation.count({where:{runId:run.id}}),
        prisma.btTrade.count({where:{runId:run.id}}),
      ]);
      console.log(`    Seeded ${ds} eq=${eqC} alloc=${allocC} trades=${tradeC} Final ${met.final_value ?? met.finalValue}`);
      created++;
      if(created % 5 === 0) console.log(`  ... ${created}/${viable.length} hechos`);
    }
    const finalCount = await prisma.btBacktestRun.count({where:{strategyId: strat.id}});
    console.log(`Done ${strat.code} total runs ${finalCount} (viable ${viable.length})`);
  }
  console.log("\nRESEED ALL COMPLETADO");
}

main().catch(e=>{console.error(e); process.exit(1)}).finally(()=>prisma.$disconnect());
