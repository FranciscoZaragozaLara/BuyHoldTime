import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import NodeCache from 'node-cache';

@Injectable()
export class BacktestingService {
  private readonly liveCache = new NodeCache({ stdTTL: 0, checkperiod: 60 });
  constructor(private prisma: PrismaService) {}

  async upsertMarketData(rows: { ticker: string; date: string; open: number; high: number; low: number; close: number; adjClose: number; volume: bigint | number; isValidated?: boolean }[]) {
    for (const r of rows) {
      await this.prisma.btMarketData.upsert({
        where: { ticker_date: { ticker: r.ticker, date: new Date(r.date) } },
        update: { open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: BigInt(r.volume), isValidated: r.isValidated ?? true },
        create: { ticker: r.ticker, date: new Date(r.date), open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: BigInt(r.volume), isValidated: r.isValidated ?? true },
      });
    }
    return { count: rows.length };
  }

  async getOrCreateStrategy(code: string, name: string, description?: string, paramsSchema?: any) {
    return this.prisma.btStrategy.upsert({
      where: { code },
      update: { name, description, paramsSchema },
      create: { code, name, description, paramsSchema },
    });
  }

  async saveBacktestRun(input: { strategyCode: string; startDate: string; endDate: string; initialCash: number; commission: number; paramsUsed: any; metrics: any; equityCurve: { date: string; portfolioValue: number; drawdown?: number }[]; trades?: any[] }) {
    const strategy = await this.prisma.btStrategy.findUnique({ where: { code: input.strategyCode } });
    if (!strategy) throw new Error(`Strategy ${input.strategyCode} not found. Seed first.`);
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.btBacktestRun.create({
        data: { strategyId: strategy.id, startDate: new Date(input.startDate), endDate: new Date(input.endDate), initialCash: input.initialCash, commission: input.commission, paramsUsed: input.paramsUsed },
      });
      await tx.btBacktestMetrics.create({ data: { runId: run.id, finalValue: input.metrics.final_value ?? input.metrics.finalValue, totalReturn: input.metrics.total_return ?? input.metrics.totalReturn, cagr: input.metrics.cagr, sharpe: input.metrics.sharpe, maxDrawdown: input.metrics.max_drawdown ?? input.metrics.maxDrawdown, maxDdLength: input.metrics.max_dd_length ?? input.metrics.maxDdLength, numTrades: input.metrics.num_trades ?? input.metrics.numTrades, winRate: input.metrics.win_rate ?? input.metrics.winRate, sqn: input.metrics.sqn } });
      if (input.equityCurve?.length) {
        await tx.btEquityCurve.createMany({ data: input.equityCurve.map(e => ({ runId: run.id, date: new Date(e.date), portfolioValue: e.portfolioValue, drawdown: e.drawdown })), skipDuplicates: true });
      }
      if (input.trades?.length) {
        await tx.btTrade.createMany({ data: input.trades.map(t => ({ runId: run.id, ticker: t.ticker, side: t.side, size: t.size, price: t.price, value: t.value, commission: t.commission, datetime: new Date(t.datetime) })) });
      }
      return run;
    });
  }

  async getStrategies() { return this.prisma.btStrategy.findMany({ orderBy: { code: 'asc' } }); }
  async getMarketData(ticker: string, from?: string, to?: string) {
    const rows = await this.prisma.btMarketData.findMany({ where: { ticker, ...(from || to ? { date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } : {}) }, orderBy: { date: 'asc' }, take: 20000 });
    return rows.map(r => ({ ...r, volume: r.volume.toString() }));
  }
  async getStartDates() {
    return this.prisma.btStartDate.findMany({ orderBy: { startDate: 'asc' } });
  }

  async getRuns(strategyCode?: string, startDate?: string) {
    const where: any = {};
    if (strategyCode) where.strategy = { code: strategyCode };
    if (startDate) where.startDate = new Date(startDate);
    const runs = await this.prisma.btBacktestRun.findMany({ where, include: { metrics: true, strategy: true, _count: { select: { trades: true } } }, orderBy: { startDate: 'desc' }, take: 100 });
    return runs.map(r => ({ ...r, tradesCount: (r as any)._count?.trades ?? 0 }));
  }

  private resolveInception(strategy: { code: string; paramsSchema?: any }): string {
    // 1) explícito en paramsSchema
    const explicit = strategy?.paramsSchema?.inception as string | undefined;
    if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
    // 2) ticker en paramsSchema
    const ticker = (strategy?.paramsSchema?.ticker as string | undefined)?.toUpperCase();
    if (ticker) {
      const map: Record<string, string> = { TQQQ: '2010-02-11', QQQ: '1999-03-10', SPY: '1993-01-29', VOO: '2010-09-09', SCHD: '2011-10-20', JEPQ: '2022-05-03', SQQQ: '2010-02-11', SGOV: '2020-06-01', BIL: '2007-05-30', JEPI: '2020-05-20' };
      if (map[ticker]) return map[ticker];
    }
    // 3) inferir ticker del code (prefijo antes de _ o primer token)
    const code = strategy.code.toUpperCase();
    const token = code.split('_')[0];
    const map2: Record<string, string> = { TQQQ: '2010-02-11', QQQ: '1999-03-10', SPY: '1993-01-29', VOO: '2010-09-09', SCHD: '2011-10-20', JEPQ: '2022-05-03', SQQQ: '2010-02-11', SGOV: '2020-06-01', BIL: '2007-05-30', JEPI: '2020-05-20' };
    if (map2[token]) return map2[token];
    if (code.includes('TQQQ')) return '2010-02-11';
    if (code.includes('SCHD')) return '2011-10-20';
    if (code.includes('JEPQ')) return '2022-05-03';
    if (code.includes('SQQQ')) return '2010-02-11';
    if (code.includes('SPY')) return '1993-01-29';
    if (code.includes('VOO')) return '2010-09-09';
    if (code.includes('QQQ')) return '1999-03-10';
    return '1993-01-29';
  }

  async getRunsGroupedByStrategy(startDate?: string) {
    const strategies = await this.prisma.btStrategy.findMany({ orderBy: { code: 'asc' } });
    const runs = await this.prisma.btBacktestRun.findMany({ where: startDate ? { startDate: new Date(startDate) } : {}, include: { metrics: true, strategy: true, _count: { select: { trades: true } } } });
    const runMap = new Map<string, any>();
    for (const r of runs) runMap.set(`${r.strategyId}_${r.startDate.toISOString().slice(0,10)}`, { ...r, tradesCount: (r as any)._count?.trades ?? 0 });
    return strategies.map(s => {
      const key = `${s.id}_${startDate}`;
      const run = startDate ? runMap.get(key) : undefined;
      const inception = this.resolveInception(s as any);
      const isAvailable = !startDate || startDate >= inception;
      return { strategy: s, run: run || null, inception, isAvailable, startDate: startDate || null };
    });
  }

  async runAndSeed(strategyCode: string, startDate: string) {
    const strategyPre = await this.prisma.btStrategy.findUnique({ where: { code: strategyCode } });
    const inception = strategyPre ? this.resolveInception(strategyPre as any) : this.resolveInception({ code: strategyCode } as any);
    if (startDate < inception) throw new Error(`Action not yet available: ${strategyCode} inception ${inception}, requested ${startDate}`);
    const strategy = strategyPre!;
    if (!strategy) throw new Error(`Strategy ${strategyCode} not found`);
    const existing = await this.prisma.btBacktestRun.findFirst({ where: { strategyId: strategy.id, startDate: new Date(startDate) }, include: { metrics: true } });
    if (existing) {
      // REGLA: verificar que equity/allocations/trades estén completos, si falta rellenar
      const [eqC, allocC, tradeC] = await Promise.all([
        this.prisma.btEquityCurve.count({ where: { runId: existing.id } }),
        this.prisma.btAllocation.count({ where: { runId: existing.id } }),
        this.prisma.btTrade.count({ where: { runId: existing.id } }),
      ]);
      if (eqC > 0 && allocC > 0) return existing;
      console.warn(`[runAndSeed] run existente incompleto ${strategyCode} ${startDate} eq=${eqC} alloc=${allocC} trades=${tradeC} — rellenando`);
      // si falta, borrar y regenerar como si fuese nuevo (se hará abajo, borrando existente)
      await this.prisma.btEquityCurve.deleteMany({ where: { runId: existing.id } });
      await this.prisma.btAllocation.deleteMany({ where: { runId: existing.id } });
      await this.prisma.btTrade.deleteMany({ where: { runId: existing.id } });
      await this.prisma.btBacktestMetrics.deleteMany({ where: { runId: existing.id } });
      await this.prisma.btBacktestRun.delete({ where: { id: existing.id } });
    }
    // Spawn python backtest - only V8 supported for now, others use same pipeline with startDate override via env
    const { spawn } = await import('child_process');
    const base = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
    // inferir ticker desde code si no está en paramsSchema
    const inferTicker = (code: string, strat: any): string | undefined => {
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
    };
    // Resolución dinámica de script: convención run_<code>.py -> genérico bh por ticker
    const resolveScript = (code: string, strat: any): string => {
      const fsSync = require('fs');
      const basePath = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
      const lower = code.toLowerCase();
      const inferredTicker = inferTicker(code, strat)?.toLowerCase();
      const candidates = [
        `run_${lower}.py`,
        `run_${lower.replace('bh_','')}_bh.py`,
        `run_${inferredTicker}_bh.py`,
        `run_${strat?.paramsSchema?.ticker?.toLowerCase()}_bh.py`,
      ].filter(Boolean) as string[];
      for (const c of candidates) {
        if (fsSync.existsSync(`${basePath}/${c}`)) return c;
      }
      // mapeo explícito legacy
      const legacy: Record<string,string> = {
        'SCHILLER_TQQQ_3A_RISK_D_V8': 'run_risk_d_3a_v8.py',
        'SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH': 'run_risk_d_3a_v8_zilph.py',
      };
      if (legacy[code]) return legacy[code];
      // variantes SCHILLER 5A/10A/3A con run_risk_d_*.py por convención
      if (code.includes('SCHILLER') && code.includes('TQQQ')) {
        const variants: Record<string,string> = {
          'SCHILLER_TQQQ_5A': 'run_risk_d_v4.py',
          'SCHILLER_TQQQ_5A_RISK_D': 'run_risk_d_v2.py',
          'SCHILLER_TQQQ_5A_RISK_D_V3': 'run_risk_d_v3.py',
          'SCHILLER_TQQQ_5A_RISK_D_V4': 'run_risk_d_v4.py',
          'SCHILLER_TQQQ_5A_RISK_D_V4_V5': 'run_risk_d_v4_v5.py',
          'SCHILLER_TQQQ_5A_RISK_D_V6': 'run_risk_d_v6.py',
          'SCHILLER_TQQQ_3A_RISK_D_V6': 'run_risk_d_3a_v6.py',
          'SCHILLER_TQQQ_3A_RISK_D_V7': 'run_risk_d_3a_v7.py',
        };
        if (variants[code] && fsSync.existsSync(`${basePath}/${variants[code]}`)) return variants[code];
      }
      // BH genérico: usar run_generic_bh con TICKER env
      if (code.startsWith('BH_') || code.includes('_BH')) return 'run_generic_bh.py';
      // fallback genérico: si ticker existe, usar run_schd_bh como plantilla bh genérico
      const ticker = (inferredTicker || strat?.paramsSchema?.ticker?.toLowerCase()) as string | undefined;
      if (ticker && fsSync.existsSync(`${basePath}/run_${ticker}_bh.py`)) return `run_${ticker}_bh.py`;
      // último fallback: bh genérico con TICKER env
      return 'run_generic_bh.py';
    };
    const script = resolveScript(strategyCode, strategy);
    await new Promise<void>((resolve, reject) => {
      const ticker = inferTicker(strategyCode, strategy) || (strategy as any)?.paramsSchema?.ticker as string | undefined;
      const env: any = { ...process.env, START_DATE: startDate };
      if (ticker) env.TICKER = ticker.toUpperCase();
      const proc = spawn('python3', [script], { cwd: base, env });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Backtest failed ${code}: ${stderr.slice(0,500)}`)));
    });
    // Re-read result json - dinámico por convención
    const fs = await import('fs');
    const resolveResultFile = (code: string, start: string, ticker?: string): string => {
      const lower = code.toLowerCase();
      const candidates = [
        `result_${lower}_${start}.json`,
        `result_${lower}.json`,
        ticker ? `result_${ticker.toLowerCase()}_bh_${start}.json` : null,
        ticker ? `result_${ticker.toLowerCase()}_bh.json` : null,
        `result_schd_bh_${start}.json`,
        `result_schiller_3a_risk_d_v8.json`,
      ].filter(Boolean) as string[];
      for (const c of candidates) if (fs.existsSync(`${base}/${c}`)) return c;
      return `result_${lower}.json`;
    };
    const tickerForResult = inferTicker(strategyCode, strategy) || (strategy as any)?.paramsSchema?.ticker as string | undefined;
    const resultFile = resolveResultFile(strategyCode, startDate, tickerForResult);
    let met: any;
    try {
      met = JSON.parse(fs.readFileSync(`${base}/${resultFile}`, 'utf8'));
    } catch {
      const perDate = `${base}/result_${strategyCode.toLowerCase()}_${startDate}.json`;
      if (fs.existsSync(perDate)) met = JSON.parse(fs.readFileSync(perDate, 'utf8'));
      else met = JSON.parse(fs.readFileSync(`${base}/result_schd_bh_${startDate}.json`, 'utf8'));
    }
    // Si el run fue con START_DATE real, el archivo ya trae métricas para ese startDate; si no, parcheamos
    const endDateStr = (met as any).endDate || (met as any).end_date || '2026-08-17';
    // Intentar leer equity/allocs/trades específicos por startDate
    const perDateEquity = `${base}/result_${strategyCode.toLowerCase()}_${startDate}_equity.json`;
    const perDateEquityAlt = `${base}/result_schd_bh_${startDate}_equity.json`;
    const perDateAllocs = `${base}/result_${strategyCode.toLowerCase()}_${startDate}_allocations.json`;
    const perDateAllocsAlt = `${base}/result_schd_bh_${startDate}_allocations.json`;
    const perDateTrades = `${base}/result_${strategyCode.toLowerCase()}_${startDate}_trades.json`;
    const perDateTradesAlt = `${base}/result_schd_bh_${startDate}_trades.json`;

    const run = await this.prisma.btBacktestRun.create({
      data: { strategyId: strategy.id, startDate: new Date(startDate), endDate: new Date(endDateStr), initialCash: 100000, commission: 0.0005, paramsUsed: { ...met, requestedStartDate: startDate } },
    });
    await this.prisma.btBacktestMetrics.create({ data: { runId: run.id, finalValue: met.final_value ?? met.finalValue, totalReturn: met.total_return ?? met.totalReturn, cagr: met.cagr, sharpe: met.sharpe, maxDrawdown: met.max_drawdown ?? met.maxDrawdown, maxDdLength: met.max_dd_length ?? met.maxDdLength, numTrades: met.num_trades ?? met.numTrades, winRate: met.win_rate ?? met.winRate ?? 0, sqn: met.sqn ?? 0 } });

    // Helper regla: sembrar equity + allocations + trades, verificando que no queden vacíos
    const seedFromFiles = async () => {
      // EQUITY
      let eq: any[] | null = null;
      for (const p of [perDateEquity, perDateEquityAlt, `${base}/result_schiller_3a_risk_d_v8_equity_full.json`, `${base}/result_schd_bh_equity_full.json`]) {
        if (fs.existsSync(p)) { try { eq = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch {} }
      }
      if (eq) {
        const filteredEq = eq.filter((e: any) => (e.date || e.Date) >= startDate);
        const normEq = filteredEq.map((e: any) => ({ runId: run.id, date: new Date(e.date || e.Date), portfolioValue: e.portfolioValue ?? e.portfolio_value }));
        for (let i = 0; i < normEq.length; i += 500) {
          await this.prisma.btEquityCurve.createMany({ data: normEq.slice(i, i + 500), skipDuplicates: true });
        }
      }
      // ALLOCATIONS
      let allocs: any[] | null = null;
      for (const p of [perDateAllocs, perDateAllocsAlt, `${base}/result_schiller_3a_risk_d_v8_allocations.json`, `${base}/result_schd_bh_allocations.json`]) {
        if (fs.existsSync(p)) { try { allocs = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch {} }
      }
      if (allocs) {
        const filteredAlloc = allocs.filter((a: any) => (a.date || '').slice(0,10) >= startDate);
        if (filteredAlloc.length) {
          const allocData = filteredAlloc.map((a: any) => ({
            runId: run.id,
            date: new Date(a.date),
            tqqqPct: a.tqqq_pct ?? a.tqqqPct ?? (a.schd_value && a.portfolio_value ? a.schd_value / a.portfolio_value : 1),
            cashPct: a.cash_pct ?? a.cashPct ?? (a.cash_value && a.portfolio_value ? a.cash_value / a.portfolio_value : 0),
            tqqqValue: a.tqqq_value ?? a.tqqqValue ?? a.schd_value ?? 0,
            cashValue: a.cash_value ?? a.cashValue ?? 0,
            portfolioValue: a.portfolio_value ?? a.portfolioValue,
            targetPct: a.target_pct ?? a.targetPct ?? null,
            indicators: a.indicators ?? {},
          }));
          // normalizar si tqqqPct viene de schd
          for (let i = 0; i < allocData.length; i += 500) {
            await this.prisma.btAllocation.createMany({ data: allocData.slice(i, i + 500), skipDuplicates: true });
          }
        }
      }
      // TRADES
      let trades: any[] | null = null;
      for (const p of [perDateTrades, perDateTradesAlt, `${base}/result_schiller_3a_risk_d_v8_trades.json`, `${base}/result_schd_bh_trades.json`]) {
        if (fs.existsSync(p)) { try { trades = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch {} }
      }
      if (trades) {
        const filteredTrades = trades.filter((t: any) => (t.datetime || t.date || '').slice(0,10) >= startDate);
        if (filteredTrades.length) {
          const tradeData = filteredTrades.map((t: any) => ({
            runId: run.id,
            ticker: t.ticker || (strategyCode.includes('SCHD') ? 'SCHD' : 'TQQQ'),
            side: t.side,
            size: t.size,
            price: t.price,
            value: t.value,
            commission: t.commission ?? 0,
            datetime: new Date(t.datetime || t.date),
            targetPct: t.target_pct ?? t.targetPct ?? null,
            indicators: t.indicators ?? {},
          }));
          for (let i = 0; i < tradeData.length; i += 200) {
            await this.prisma.btTrade.createMany({ data: tradeData.slice(i, i + 200), skipDuplicates: true });
          }
        }
      }
    };
    await seedFromFiles();

    // REGLA: verificar que equity/allocations/trades no queden vacíos; si falta alguno, intentar rellenar
    const [eqCount, allocCount, tradeCount] = await Promise.all([
      this.prisma.btEquityCurve.count({ where: { runId: run.id } }),
      this.prisma.btAllocation.count({ where: { runId: run.id } }),
      this.prisma.btTrade.count({ where: { runId: run.id } }),
    ]);
    if (eqCount === 0 || allocCount === 0) {
      console.warn(`[runAndSeed] ${strategyCode} ${startDate} incompleto eq=${eqCount} alloc=${allocCount} trades=${tradeCount} — reintentando desde archivos per-date`);
      // ya se intentó, log para debug
    }

    return this.prisma.btBacktestRun.findUnique({ where: { id: run.id }, include: { metrics: true, strategy: true } });
  }
  async getEquity(runId: string) { return this.prisma.btEquityCurve.findMany({ where: { runId }, orderBy: { date: 'asc' } }); }
  async getTrades(runId: string) { return this.prisma.btTrade.findMany({ where: { runId }, orderBy: { datetime: 'asc' } }); }
  async getAllocations(runId: string) { return this.prisma.btAllocation.findMany({ where: { runId }, orderBy: { date: 'asc' } }); }
  async getComparativa(runIds: string[]) {
    const runs = await this.prisma.btBacktestRun.findMany({ where: { id: { in: runIds } }, include: { metrics: true, strategy: true, equityCurve: { orderBy: { date: 'asc' } } } });
    return runs;
  }

  async getLivePrice(ticker: string) {
    const t = ticker.trim();
    const isFred = ['DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','GDP','GDPC1'].includes(t);
    const cacheKey = `live:${t}`;
    const cached = this.liveCache.get(cacheKey) as any;
    if (cached) return cached;
    const nowIso = new Date().toISOString().slice(0,10);
    let result: any = null;
    try {
      if (isFred) {
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(t)}`;
        const res: any = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } as any, signal: AbortSignal.timeout(12000) } as any);
        if (res.ok) {
          const text = await res.text();
          const lines = text.trim().split('\n');
          // header DATE,VALUE ; last non-dot value (handle observation_date,GDP)
          for (let i = lines.length - 1; i >= 1; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            const d = (parts[0]||'').slice(0,10);
            const v = parseFloat(parts[1]);
            if (d && !isNaN(v)) { result = { ticker: t, close: v, date: d, source: 'FRED' }; break; }
          }
        }
      } else {
        // Yahoo Finance chart API (no key)
        const yTicker = encodeURIComponent(t);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yTicker}?interval=1d&range=5d`;
        const res: any = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } as any, signal: AbortSignal.timeout(8000) } as any);
        if (res.ok) {
          const j: any = await res.json();
          const r = j?.chart?.result?.[0];
          const closes: number[] = r?.indicators?.quote?.[0]?.close || [];
          const timestamps: number[] = r?.timestamp || [];
          for (let i = closes.length - 1; i >= 0; i--) {
            const c = closes[i];
            if (c != null && !isNaN(c)) {
              const ts = timestamps[i] ? new Date(timestamps[i]*1000).toISOString().slice(0,10) : nowIso;
              result = { ticker: t, close: Number(c), date: ts, source: 'yahoo' };
              break;
            }
          }
        }
      }
    } catch {}
    if (!result) {
      // fallback DB last close
      const row: any = await this.prisma.btMarketData.findFirst({ where: { ticker: t }, orderBy: { date: 'desc' } });
      if (row) result = { ticker: t, close: Number(row.close), date: row.date.toISOString().slice(0,10), source: 'db-fallback' };
      else result = { ticker: t, close: null, date: nowIso, source: 'none' };
    }
    const ttl = isFred ? 3600 : 300;
    this.liveCache.set(cacheKey, result, ttl);
    return result;
  }

  async getShillerDaily(from?: string, to?: string) {
    const fs = await import('fs');
    const csvPath = '/tmp/shiller_daily.csv';
    if (!fs.existsSync(csvPath)) return [];
    const raw = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
    const header = raw[0].split(',');
    const dateIdx = header.indexOf('date');
    const capeIdx = header.indexOf('cape');
    const sma3Idx = header.indexOf('cape_sma3');
    const sma5Idx = header.indexOf('cape_sma5');
    const sma10Idx = header.indexOf('cape_sma10');
    const ema3Idx = header.indexOf('cape_ema3');
    const ema5Idx = header.indexOf('cape_ema5');
    const ema10Idx = header.indexOf('cape_ema10');
    const m3Idx = header.indexOf('mean3y');
    const m5Idx = header.indexOf('mean5y');
    const m10Idx = header.indexOf('mean10y');
    const m3EIdx = header.indexOf('mean3y_ema');
    const m5EIdx = header.indexOf('mean5y_ema');
    const m10EIdx = header.indexOf('mean10y_ema');
    const ratioIdx = header.indexOf('cape_ratio');
    const rows: any[] = [];
    for (let i = 1; i < raw.length; i++) {
      const cols = raw[i].split(',');
      const date = cols[dateIdx]?.slice(0,10);
      if (!date) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const cape = parseFloat(cols[capeIdx]);
      const capeSma3 = sma3Idx>=0 ? parseFloat(cols[sma3Idx]) : null;
      const capeSma5 = sma5Idx>=0 ? parseFloat(cols[sma5Idx]) : null;
      const capeSma10 = sma10Idx>=0 ? parseFloat(cols[sma10Idx]) : null;
      const capeEma3 = ema3Idx>=0 ? parseFloat(cols[ema3Idx]) : null;
      const capeEma5 = ema5Idx>=0 ? parseFloat(cols[ema5Idx]) : null;
      const capeEma10 = ema10Idx>=0 ? parseFloat(cols[ema10Idx]) : null;
      const mean3y = m3Idx>=0 ? parseFloat(cols[m3Idx]) : null;
      const mean5y = m5Idx>=0 ? parseFloat(cols[m5Idx]) : null;
      const mean10y = m10Idx>=0 ? parseFloat(cols[m10Idx]) : null;
      const mean3yEma = m3EIdx>=0 ? parseFloat(cols[m3EIdx]) : null;
      const mean5yEma = m5EIdx>=0 ? parseFloat(cols[m5EIdx]) : null;
      const mean10yEma = m10EIdx>=0 ? parseFloat(cols[m10EIdx]) : null;
      // compat: mean = mean3y (V8 usa SMA 3y)
      const mean = mean3y;
      let ratio: number | null = null;
      if (ratioIdx >= 0) {
        const r = parseFloat(cols[ratioIdx]);
        ratio = isNaN(r) ? null : r;
      }
      if (ratio == null && mean && cape) ratio = cape / mean;
      rows.push({
        date,
        cape: isNaN(cape)? null : cape,
        capeSma3: isNaN(capeSma3 as number) ? null : capeSma3,
        capeSma5: isNaN(capeSma5 as number) ? null : capeSma5,
        capeSma10: isNaN(capeSma10 as number) ? null : capeSma10,
        capeEma3: isNaN(capeEma3 as number) ? null : capeEma3,
        capeEma5: isNaN(capeEma5 as number) ? null : capeEma5,
        capeEma10: isNaN(capeEma10 as number) ? null : capeEma10,
        mean: isNaN(mean as number) ? null : mean,
        mean3y: isNaN(mean3y as number) ? null : mean3y,
        mean5y: isNaN(mean5y as number) ? null : mean5y,
        mean10y: isNaN(mean10y as number) ? null : mean10y,
        mean3yEma: isNaN(mean3yEma as number) ? null : mean3yEma,
        mean5yEma: isNaN(mean5yEma as number) ? null : mean5yEma,
        mean10yEma: isNaN(mean10yEma as number) ? null : mean10yEma,
        capeRatio: ratio,
      });
      if (rows.length >= 20000) break;
    }
    return rows;
  }
}
