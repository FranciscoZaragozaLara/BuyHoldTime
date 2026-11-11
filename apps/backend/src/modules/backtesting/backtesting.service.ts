import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import NodeCache from 'node-cache';
import { getHyBonus, getHySigma24, getLiqBonus, getOilBonus, PriceMap } from './thermo-history';

// Día con mercado (lun–vie). Sáb/dom no operan y el BHT no se calcula.
export function isTradingDayIso(isoDate: string): boolean {
  const dow = new Date(isoDate.slice(0, 10) + 'T12:00:00Z').getUTCDay();
  return dow !== 0 && dow !== 6;
}

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
            indicators: t.indicators ?? (t.gatilho || t.gatillo || t.reason ? { gatilho: t.gatilho ?? t.gatillo ?? t.reason, reason: t.reason ?? t.gatilho ?? t.gatillo } : {}),
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
    const isFred = ['DFEDTARU','DGS2','DGS10','DGS30','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','GDP','GDPC1','MSACSR','VIXCLS'].includes(t);
    const isCnn = t === 'FEAR_GREED';
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
          // Guarda anti-basura: FRED a veces devuelve página HTML de error con 200
          // (se coló date:"<link href",close:400). Exigir header CSV y fecha ISO real.
          const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
          const header0 = (lines[0] || '').trim().toLowerCase();
          const looksCsv = header0.startsWith('observation_date') || header0.startsWith('date');
          if (looksCsv) {
            for (let i = lines.length - 1; i >= 1; i--) {
              const line = lines[i].trim();
              if (!line) continue;
              const parts = line.split(',');
              const d = (parts[0] || '').slice(0, 10);
              const v = parseFloat(parts[1]);
              if (isIsoDate(d) && !isNaN(v)) { result = { ticker: t, close: v, date: d, source: 'FRED' }; break; }
            }
          }
        }
      } else if (isCnn) {
        const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
        const res: any = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Accept': 'application/json', 'Referer': 'https://www.cnn.com/markets/fear-and-greed' } as any, signal: AbortSignal.timeout(12000) } as any);
        if (res.ok) {
          const cj: any = await res.json();
          const pts: any[] = cj?.fear_and_greed_historical?.data || [];
          for (let i = pts.length - 1; i >= 0; i--) {
            const v = Number(pts[i]?.y);
            if (isFinite(v)) {
              const d = new Date(Number(pts[i]?.x)).toISOString().slice(0, 10);
              result = { ticker: t, close: v, date: d, source: 'CNN' };
              break;
            }
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

  async streamRefreshRuns(res: any, strategyCodes: string[]) {
    const send = (obj: any) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} };
    let clientClosed = false;
    try { res.on('close', () => { clientClosed = true; }); } catch {}
    try {
    const { spawn } = await import('child_process');
    const fsSync = await import('fs');
    const pathMod = await import('path');
    const base = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
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
    const resolveScript = (code: string, strat: any): string => {
      const lower = code.toLowerCase();
      const baseLower = lower.replace(/_v\d+$/, '');
      const inferredTicker = inferTicker(code, strat)?.toLowerCase();
      const candidates = [`run_${lower}.py`, `run_${baseLower}.py`, `run_${inferredTicker}_bh.py`].filter(Boolean) as string[];
      for (const c of candidates) if (fsSync.existsSync(`${base}/${c}`)) return c;
      if (code.includes('SCHILLER') && code.includes('TQQQ')) {
        const variants: Record<string, string> = { SCHILLER_TQQQ_5A: 'run_risk_d_v4.py' };
        if (variants[code] && fsSync.existsSync(`${base}/${variants[code]}`)) return variants[code];
      }
      if (code.startsWith('BH_') || code.includes('_BH')) return 'run_generic_bh.py';
      const ticker = (inferredTicker || strat?.paramsSchema?.ticker?.toLowerCase()) as string | undefined;
      if (ticker && fsSync.existsSync(`${base}/run_${ticker}_bh.py`)) return `run_${ticker}_bh.py`;
      return 'run_generic_bh.py';
    };
    for (const code of strategyCodes) {
      const startTs = Date.now();
      send({ type: 'start', strategyCode: code, status: 'updating' });
      let totalDays = 0, newDays = 0, beforeDate: string | null = null, beforeValue: number | null = null, afterDate: string | null = null, afterValue: number | null = null, status: 'success' | 'error' = 'success', error: string | null = null;
      try {
        const strat: any = await this.prisma.btStrategy.findUnique({ where: { code } });
        if (!strat) throw new Error(`Strategy ${code} not found`);
        const inception = this.resolveInception(strat as any);
        const runs = await this.prisma.btBacktestRun.findMany({ where: { strategyId: strat.id }, orderBy: { startDate: 'desc' } });
        let target = runs.find((r) => r.startDate.toISOString().slice(0, 10) === inception) || runs[0];
        if (!target) throw new Error(`No run for ${code}`);
        // START_DATE dinámico: usa el startDate del run objetivo, no siempre inception (evita mezclar BH_QQQ 1999 vs 2026-04-01)
        const targetStart = target.startDate.toISOString().slice(0,10);
        if (targetStart !== inception) {
          console.warn(`[streamRefreshRuns] ${code} target ${targetStart} != inception ${inception}, usando targetStart para regenerar`); 
        }
        const beforeCount = await this.prisma.btEquityCurve.count({ where: { runId: target.id } });
        const lastBefore: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: target.id }, orderBy: { date: 'desc' } });
        if (lastBefore) { beforeDate = lastBefore.date.toISOString().slice(0, 10); beforeValue = Number(lastBefore.portfolioValue); totalDays = beforeCount; }
        // Run python to regenerate file up to today
        const script = resolveScript(code, strat);
        const ticker = inferTicker(code, strat);
        await new Promise<void>((resolve, reject) => {
          const env: any = { ...process.env, START_DATE: targetStart, STRATEGY_CODE: code };
          if (ticker) env.TICKER = ticker.toUpperCase();
          const proc = spawn('python3', [pathMod.join(base, script)], { cwd: base, env });
          let stderr = '';
          proc.stderr.on('data', (d) => (stderr += d.toString()));
          proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${script} exit ${c}: ${stderr.slice(0,500)}`))));
        });
        // Si se usó script base para variante _V*, copiar resultados al nombre esperado (dinámico para cualquier futura estrategia)
        try {
          const lowerBase = code.toLowerCase().replace(/_v\d+$/,'');
          const lowerExpect = code.toLowerCase();
          if (lowerBase !== lowerExpect) {
            const toCopy = ['.json','_trades.json','_allocations.json','_equity_full.json','_events.json',`_${targetStart}.json`,`_${targetStart}_trades.json`,`_${targetStart}_allocations.json`,`_${targetStart}_equity.json`,`_${targetStart}_events.json`];
            for (const suf of toCopy) {
              const src = pathMod.join(base, `result_${lowerBase}${suf}`);
              const dst = pathMod.join(base, `result_${lowerExpect}${suf}`);
              if (fsSync.existsSync(src) && !fsSync.existsSync(dst)) {
                try { fsSync.copyFileSync(src, dst); } catch {}
              } else if (fsSync.existsSync(src) && fsSync.existsSync(dst)) {
                // si ambos existen y el src es más reciente, propagar (evita stale V2)
                try {
                  const sStat = fsSync.statSync(src);
                  const dStat = fsSync.statSync(dst);
                  if (sStat.mtimeMs > dStat.mtimeMs) fsSync.copyFileSync(src, dst);
                } catch {}
              }
            }
          }
        } catch {}
        // Read equity file — for BH strategies prefer generic BH file (SPY_BH_ORIGIN maps to result_spy_bh_...)
        const lower = code.toLowerCase();
        const isBH = code.includes('_BH') || code.startsWith('BH_');
        const bhCandidates = isBH && ticker ? [`result_${ticker.toLowerCase()}_bh_${targetStart}_equity.json`, `result_${ticker.toLowerCase()}_bh_equity_full.json`] : [];
        const candidates = isBH ? [...bhCandidates, `result_${lower}_${targetStart}_equity.json`, `result_${lower}_equity_full.json`, `result_${lower}.json`] : [`result_${lower}_${targetStart}_equity.json`, `result_${lower}_equity_full.json`, `result_${lower}.json`];
        let eq: any[] | null = null;
        for (const c of candidates) { const p = pathMod.join(base, c); if (fsSync.existsSync(p)) { try { const raw = JSON.parse(fsSync.readFileSync(p, 'utf8')); eq = Array.isArray(raw) ? raw : raw.equity || null; if (eq && eq.length && eq[0].portfolioValue == null && eq[0].portfolio_value != null) eq = eq.map((e:any)=>({ date: e.date, portfolioValue: e.portfolio_value })); break; } catch {} } }
        // fallback: try reading generic bh file
        if (!eq) {
          const alt = pathMod.join(base, `result_${(ticker||'').toLowerCase()}_bh_${targetStart}_equity.json`);
          if (fsSync.existsSync(alt)) eq = JSON.parse(fsSync.readFileSync(alt, 'utf8'));
        }
        if (!eq || !eq.length) throw new Error('Equity file not found after python');
        const totalAfter = eq.length;
        const lastAfter = eq[eq.length - 1];
        afterDate = (lastAfter.date || lastAfter.Date || '').slice(0,10);
        afterValue = Number(lastAfter.portfolioValue ?? lastAfter.portfolio_value);
        totalDays = totalAfter;
        // Detect discontinuity: si la curva regenerada difiere de la DB en maxDate, forzar reseed completo (evita salto 62M->96M por cambio de lógica)
        const maxRow: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: target.id }, orderBy: { date: 'desc' } });
        const maxDate = maxRow ? maxRow.date.toISOString().slice(0,10) : inception;
        // valor de la curva regenerada en maxDate para comparar discontinuidad
        const eqByDate = new Map(eq.map((e:any)=>[(e.date||'').slice(0,10), Number(e.portfolioValue ?? e.portfolio_value)]));
        const regenAtMax = eqByDate.get(maxDate);
        const dbAtMax = maxRow ? Number(maxRow.portfolioValue) : null;
        const todayStr = new Date().toISOString().slice(0,10);
        // Verificar 10 días previos por si alguno quedó con corte parcial (intradía) y planchar a cierre final (sin límite 1.5% para intradía)
        const checkDays = 10;
        let intradayFixed = 0;
        for (let i=0;i<checkDays;i++) {
          const d = new Date(); d.setDate(d.getDate()-i);
          const ds = d.toISOString().slice(0,10);
          const dbVal: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: target.id, date: new Date(ds) } });
          if (!dbVal) continue;
          const regenVal = eqByDate.get(ds);
          if (regenVal==null || regenVal===Number(dbVal.portfolioValue)) continue;
          await this.prisma.btEquityCurve.updateMany({ where: { runId: target.id, date: new Date(ds) }, data: { portfolioValue: regenVal } });
          intradayFixed++;
        }
        // Si el dato más reciente es intradía (hoy) y no es final, actualizarlo en próximos días: si regenAtMax difiere y maxDate==today, hacer upsert aunque no haya missing
        const isIntradayUpdate = maxDate === todayStr && regenAtMax!=null && dbAtMax!=null && regenAtMax !== dbAtMax;
        const needsFullReseed = regenAtMax!=null && dbAtMax!=null && Math.abs(regenAtMax-dbAtMax)/Math.max(1,Math.abs(dbAtMax)) > 0.015;
        if ((isIntradayUpdate || intradayFixed>0) && !needsFullReseed) {
          if (isIntradayUpdate) {
            await this.prisma.btEquityCurve.updateMany({ where: { runId: target.id, date: new Date(maxDate) }, data: { portfolioValue: regenAtMax! } });
          }
          // also update allocation for that date if exists in file
          const allocForToday = eq.find((e:any)=> (e.date||'').slice(0,10)===maxDate);
          // allocations are per date, update if needed
          try{
            const allocMapToday = new Map(eq.map((e:any)=>[(e.date||'').slice(0,10), e]));
            // no-op, allocations will be handled via full reseed if needed, but at least equity is final
          }catch{}
          if (afterDate) await this.prisma.btBacktestRun.update({ where: { id: target.id }, data: { endDate: new Date(afterDate) } });
          if (afterValue != null) await this.prisma.btBacktestMetrics.updateMany({ where: { runId: target.id }, data: { finalValue: afterValue } });
          newDays = 1;
        } else if (needsFullReseed) {
          // cambio de lógica detectado: borrar y reinsertar toda la curva para evitar salto artificial
          await this.prisma.btEquityCurve.deleteMany({ where: { runId: target.id } });
          await this.prisma.btAllocation.deleteMany({ where: { runId: target.id } });
          await this.prisma.btTrade.deleteMany({ where: { runId: target.id } });
          const allocCandidatesFull = [`result_${lower}_${targetStart}_allocations.json`, `result_${lower}_allocations.json`];
          let allocsFull: any[] = [];
          for (const c of allocCandidatesFull) { const p = pathMod.join(base,c); if (fsSync.existsSync(p)) { try{ allocsFull = JSON.parse(fsSync.readFileSync(p,'utf8')); break;}catch{}} }
          const tradeCandidatesFull = [`result_${lower}_${targetStart}_trades.json`, `result_${lower}_trades.json`];
          let tradesFull: any[] = [];
          for (const c of tradeCandidatesFull) { const p = pathMod.join(base,c); if (fsSync.existsSync(p)) { try{ tradesFull = JSON.parse(fsSync.readFileSync(p,'utf8')); break;}catch{}} }
          for (let i=0;i<eq.length;i+=500){
            const chunk = eq.slice(i,i+500);
            await this.prisma.btEquityCurve.createMany({ data: chunk.map((e:any)=>({ runId: target.id, date: new Date((e.date||'').slice(0,10)), portfolioValue: Number(e.portfolioValue ?? e.portfolio_value) })), skipDuplicates: true });
          }
          for (let i=0;i<allocsFull.length;i+=500){
            const ch = allocsFull.slice(i,i+500);
            await this.prisma.btAllocation.createMany({ data: ch.map((a:any)=>({
              runId: target.id, date: new Date(a.date), tqqqPct: a.tqqq_pct ?? a.tqqqPct ?? 1, cashPct: a.cash_pct ?? a.cashPct ?? 0,
              tqqqValue: a.tqqq_value ?? a.tqqqValue ?? a.schd_value ?? 0, cashValue: a.cash_value ?? a.cashValue ?? 0,
              portfolioValue: a.portfolio_value ?? a.portfolioValue, targetPct: a.target_pct ?? a.targetPct ?? null, indicators: a.indicators ?? {},
            })), skipDuplicates: true });
          }
          if (tradesFull.length) {
            for (let i=0;i<tradesFull.length;i+=200){
              const ch = tradesFull.slice(i,i+200);
              await this.prisma.btTrade.createMany({ data: ch.map((t:any)=>({
                runId: target.id, ticker: t.ticker || (code.includes('SCHD') ? 'SCHD' : (code.includes('SPY') ? 'SPY' : 'TQQQ')),
                side: t.side, size: t.size, price: t.price, value: t.value, commission: t.commission ?? 0,
                datetime: new Date(t.datetime || t.date), targetPct: t.target_pct ?? t.targetPct ?? null,
                indicators: t.indicators ?? (t.gatilho || t.gatillo || t.reason ? { gatilho: t.gatilho ?? t.gatillo ?? t.reason, reason: t.reason ?? t.gatilho ?? t.gatillo } : {}),
              })), skipDuplicates: true });
            }
          }
          if (afterDate) await this.prisma.btBacktestRun.update({ where: { id: target.id }, data: { endDate: new Date(afterDate) } });
          if (afterValue != null) await this.prisma.btBacktestMetrics.updateMany({ where: { runId: target.id }, data: { finalValue: afterValue } });
          newDays = eq.length;
        } else {
        const missing = eq.filter((e:any) => (e.date||'').slice(0,10) > maxDate);
        newDays = missing.length;
        if (missing.length) {
          // allocations patch
          const allocCandidates = [`result_${lower}_${targetStart}_allocations.json`, `result_${lower}_allocations.json`];
          let allocs: any[] = [];
          for (const c of allocCandidates) { const p = pathMod.join(base,c); if (fsSync.existsSync(p)) { try{ allocs = JSON.parse(fsSync.readFileSync(p,'utf8')); break;}catch{}} }
          const allocByDate = new Map(allocs.map((a:any)=>[(a.date||'').slice(0,10), a]));
          for (let i=0;i<missing.length;i+=500){
            const chunk = missing.slice(i,i+500);
            await this.prisma.btEquityCurve.createMany({ data: chunk.map((e:any)=>({ runId: target.id, date: new Date((e.date||'').slice(0,10)), portfolioValue: Number(e.portfolioValue ?? e.portfolio_value) })), skipDuplicates: true });
          }
          // allocations for missing
          const missingAllocs = missing.map((e:any)=> allocByDate.get((e.date||'').slice(0,10))).filter(Boolean);
          for (let i=0;i<missingAllocs.length;i+=500){
            const ch = missingAllocs.slice(i,i+500);
            await this.prisma.btAllocation.createMany({ data: ch.map((a:any)=>({
              runId: target.id, date: new Date(a.date), tqqqPct: a.tqqq_pct ?? a.tqqqPct ?? 1, cashPct: a.cash_pct ?? a.cashPct ?? 0,
              tqqqValue: a.tqqq_value ?? a.tqqqValue ?? a.schd_value ?? 0, cashValue: a.cash_value ?? a.cashValue ?? 0,
              portfolioValue: a.portfolio_value ?? a.portfolioValue, targetPct: a.target_pct ?? a.targetPct ?? null, indicators: a.indicators ?? {},
            })), skipDuplicates: true });
          }
          if (afterDate) await this.prisma.btBacktestRun.update({ where: { id: target.id }, data: { endDate: new Date(afterDate) } });
          if (afterValue != null) await this.prisma.btBacktestMetrics.updateMany({ where: { runId: target.id }, data: { finalValue: afterValue } });
        }
        }
      } catch (e:any) { status='error'; error = e.message?.slice(0,400) || String(e); }
      const nominal = beforeValue!=null && afterValue!=null ? afterValue - beforeValue : null;
      const pct = beforeValue!=null && afterValue!=null && beforeValue!==0 ? (afterValue/beforeValue-1)*100 : null;
      send({ type: 'progress', strategyCode: code, totalDays, newDays, beforeDate, beforeValue, afterDate, afterValue, nominal, pct, status, error, durationMs: Date.now()-startTs });
      if (clientClosed) break;
      await new Promise(r=>setTimeout(r,120));
    }
    } catch(e:any){ try{ send({ type: 'progress', strategyCode: 'SYSTEM', status: 'error', error: String(e?.message||e).slice(0,400)}); }catch{} }
    try{ send({ type: 'done' }); }catch{}
    try{ res.end(); }catch{}
  }

  async getThermoHistory(from?: string, to?: string) {
    const rows = await this.prisma.btThermoHistory.findMany({
      where: { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } },
      orderBy: { date: 'asc' },
      select: { date: true, value: true, numerator: true, denominator: true, coverage: true, bonus: true, bonusLabel: true, liqBonus: true, liqBonusLabel: true, oilBonus: true, oilBonusLabel: true },
    });
    return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), value: r.value, numerator: r.numerator, denominator: r.denominator, coverage: r.coverage, bonus: r.bonus, bonusLabel: r.bonusLabel, liqBonus: (r as any).liqBonus ?? 0, liqBonusLabel: (r as any).liqBonusLabel ?? null, oilBonus: (r as any).oilBonus ?? 0, oilBonusLabel: (r as any).oilBonusLabel ?? null }));
  }

  async getBhtForward(from?: string, to?: string) {
    const rows = await this.prisma.btBhtForward.findMany({
      where: { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } },
      orderBy: { date: 'asc' },
    });
    // Últimos cierres para el "a hoy" de horizontes no maduros.
    const latest = await Promise.all(
      ['^GSPC', '^IXIC', 'TQQQ'].map((t) => this.prisma.btMarketData.findFirst({ where: { ticker: t }, orderBy: { date: 'desc' } })),
    );
    const L = {
      spx: latest[0]?.close != null ? Number(latest[0]?.close) : null,
      ndx: latest[1]?.close != null ? Number(latest[1]?.close) : null,
      tqqq: latest[2]?.close != null ? Number(latest[2]?.close) : null,
    };
    const tt = (base: any, now: number | null) => {
      const b = base != null ? Number(base) : null;
      return b != null && b !== 0 && now != null ? (now / b - 1) * 100 : null;
    };
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10), bhtValue: r.bhtValue, spx: r.spx, ndx: r.ndx, tqqq: r.tqqq,
      spx1y: r.spx1y, spx2y: r.spx2y, spx3y: r.spx3y, spx5y: r.spx5y,
      ndx1y: r.ndx1y, ndx2y: r.ndx2y, ndx3y: r.ndx3y, ndx5y: r.ndx5y,
      tqqq1y: r.tqqq1y, tqqq2y: r.tqqq2y, tqqq3y: r.tqqq3y, tqqq5y: r.tqqq5y,
      spxTt: tt(r.spx, L.spx), ndxTt: tt(r.ndx, L.ndx), tqqqTt: tt(r.tqqq, L.tqqq),
    }));
  }

  async getBhtForwardDetail(date: string) {
    if (!date) return { error: 'date required' };
    const r = await this.prisma.btBhtForward.findUnique({ where: { date: new Date(date) } });
    if (!r) return { error: 'not found' };
    const parts = (r.parts as any[]) ?? [];
    const numerator = parts.reduce((m, p) => m + Number(p.score) * Number(p.weight), 0);
    const denominator = parts.reduce((m, p) => m + Number(p.weight), 0);
    const th = await this.prisma.btThermoHistory.findUnique({ where: { date: r.date }, select: { bonus: true, bonusLabel: true, liqBonus: true, liqBonusLabel: true, oilBonus: true, oilBonusLabel: true } });
    // Insumos del trigger del bonus HY (valor, Δ1M, z y σ24) para transparentar el disparo en el hover.
    let bonusHy: number | null = null, bonusD1: number | null = null, bonusZ: number | null = null, bonusSigma: number | null = null, bonusFed: number | null = null;
    try {
      const iso = r.date.toISOString().slice(0, 10);
      const hyRows = await this.prisma.btMarketData.findMany({ where: { ticker: { in: ['BAMLH0A0HYM2', 'DFEDTARU'] }, date: { lte: r.date } }, orderBy: { date: 'desc' }, take: 2200 });
      const hyMap: PriceMap = new Map(hyRows.filter((x: any) => x.ticker === 'BAMLH0A0HYM2').map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const fedMap: PriceMap = new Map(hyRows.filter((x: any) => x.ticker === 'DFEDTARU').map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const hb = getHyBonus(hyMap, iso, fedMap);
      bonusHy = hb.hy; bonusD1 = hb.d1; bonusZ = hb.z; bonusFed = hb.fed;
      bonusSigma = getHySigma24(hyMap, iso);
    } catch {}
    // Insumos del bonus de liquidez M2/M0 para transparentar el disparo en el hover.
    let liqYoy: number | null = null, liqM0d3: number | null = null, liqDrop: number | null = null;
    try {
      const iso = r.date.toISOString().slice(0, 10);
      const liqRows = await this.prisma.btMarketData.findMany({ where: { ticker: { in: ['M2SL', 'BOGMBASE', 'CPIAUCSL'] }, date: { lte: r.date } }, orderBy: { date: 'desc' }, take: 600 });
      const m2Map: PriceMap = new Map(liqRows.filter((x: any) => x.ticker === 'M2SL').map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const m0Map: PriceMap = new Map(liqRows.filter((x: any) => x.ticker === 'BOGMBASE').map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const cpiMap: PriceMap = new Map(liqRows.filter((x: any) => x.ticker === 'CPIAUCSL').map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const lb = getLiqBonus(m2Map, m0Map, iso, cpiMap);
      liqYoy = lb.yoy; liqM0d3 = lb.m0d3; liqDrop = lb.drop;
    } catch {}
    // Insumos del bonus de petróleo WTI (precio y ratio vs SMA36M) para el hover.
    let oilPrice: number | null = null, oilRatio: number | null = null;
    try {
      const iso = r.date.toISOString().slice(0, 10);
      const oilRows = await this.prisma.btMarketData.findMany({ where: { ticker: 'DCOILWTICO', date: { lte: r.date } }, orderBy: { date: 'desc' }, take: 1300 });
      const oilMap: PriceMap = new Map(oilRows.map((x: any) => [x.date.toISOString().slice(0, 10), Number(x.close)]));
      const ob = getOilBonus(oilMap, iso);
      oilPrice = ob.price; oilRatio = ob.ratio;
    } catch {}
    return {
      date: r.date.toISOString().slice(0, 10), value: r.bhtValue, numerator, denominator, coverage: parts.length,
      bonus: th?.bonus ?? 0, bonusLabel: th?.bonusLabel ?? null, bonusHy, bonusD1, bonusZ, bonusSigma, bonusFed,
      liqBonus: (th as any)?.liqBonus ?? 0, liqBonusLabel: (th as any)?.liqBonusLabel ?? null, liqYoy, liqM0d3, liqDrop,
      oilBonus: (th as any)?.oilBonus ?? 0, oilBonusLabel: (th as any)?.oilBonusLabel ?? null, oilPrice, oilRatio,
      parts: parts.map((p) => ({ key: p.key, value: p.value, score: p.score, weight: p.weight, aporte: denominator ? (p.score * p.weight) / denominator : null })),
    };
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
      // Sin fines de semana: el mercado no opera y el BHT no se calcula esos días.
      if (!isTradingDayIso(date)) continue;
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
