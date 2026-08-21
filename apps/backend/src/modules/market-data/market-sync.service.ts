import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketSyncService {
  private readonly logger = new Logger(MarketSyncService.name);
  private readonly base = '/Users/zilphfanel/Documents/AgyApps/BackTesting';
  constructor(private readonly prisma: PrismaService) {}

  // L-V 22:05 America/New_York (tras cierre). Cambia a '0 30 8 * * *' si prefieres mañana.
  @Cron('5 22 * * 1-5', { timeZone: 'America/New_York' })
  async handleDailySync() {
    this.logger.log('Daily market sync start');
    try {
      await this.runPython('daily_update.py', []);
      await this.patchBHPerformance();
      this.logger.log('Daily market sync done');
    } catch (e: any) {
      this.logger.error(`Daily sync failed: ${e.message}`);
    }
  }

  // Endpoint manual para probar sin esperar al cron: POST /api/market-sync/daily
  async runNow(): Promise<{ ok: boolean; log: string }> {
    await this.runPython('daily_update.py', []);
    await this.patchBHPerformance();
    return { ok: true, log: 'sync ok' };
  }

  // Parchea btEquityCurve de BH para que Performance Daily llegue hasta hoy (sin re-seed completo)
  private async patchBHPerformance() {
    const bhMap: Record<string, { code: string; ticker: string; inception: string }> = {
      QQQ: { code: 'BH_QQQ', ticker: 'QQQ', inception: '1999-03-10' },
      TQQQ: { code: 'BH_TQQQ', ticker: 'TQQQ', inception: '2010-02-11' },
      SCHD: { code: 'SCHD_BH', ticker: 'SCHD', inception: '2011-10-20' },
      JEPQ: { code: 'JEPQ_BH', ticker: 'JEPQ', inception: '2022-05-03' },
    };
    for (const [ticker, meta] of Object.entries(bhMap)) {
      try {
        // Regenera equity BH hasta hoy (yfinance auto_adjust, 10-15s por ticker)
        await this.runPythonWithEnv('run_generic_bh.py', [], { TICKER: ticker, START_DATE: meta.inception });
        const eqPath = path.join(this.base, `result_${ticker.toLowerCase()}_bh_${meta.inception}_equity.json`);
        const altPath = path.join(this.base, `result_${ticker.toLowerCase()}_bh_equity_full.json`);
        const p = fs.existsSync(eqPath) ? eqPath : altPath;
        if (!fs.existsSync(p)) { this.logger.warn(`BH patch skip ${meta.code}: no file ${p}`); continue; }
        const eq: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
        // Busca el run más reciente de esa estrategia para esa inception (o el de mayor startDate)
        const strat = await this.prisma.btStrategy.findUnique({ where: { code: meta.code } });
        if (!strat) continue;
        const runs = await this.prisma.btBacktestRun.findMany({ where: { strategyId: strat.id }, orderBy: { startDate: 'desc' } });
        // Elige el run que tenga startDate == inception (el canonical) o el más antiguo si no existe
        let target = runs.find((r) => r.startDate.toISOString().slice(0, 10) === meta.inception) || runs[0];
        if (!target) continue;
        // Inserta solo fechas faltantes ( (...) >= maxDate existente )
        const maxRow = await this.prisma.btEquityCurve.findFirst({ where: { runId: target.id }, orderBy: { date: 'desc' } });
        const maxDate = maxRow ? maxRow.date.toISOString().slice(0, 10) : meta.inception;
        const missing = eq.filter((e: any) => (e.date || '').slice(0, 10) > maxDate);
        if (!missing.length) { this.logger.log(`BH patch ${meta.code}: ya al día (${maxDate})`); continue; }
        const allocPath = path.join(this.base, `result_${ticker.toLowerCase()}_bh_${meta.inception}_allocations.json`);
        const allocAlt = path.join(this.base, `result_${ticker.toLowerCase()}_bh_allocations.json`);
        const ap = fs.existsSync(allocPath) ? allocPath : allocAlt;
        const allocs: any[] = fs.existsSync(ap) ? JSON.parse(fs.readFileSync(ap, 'utf8')) : [];
        const allocByDate = new Map(allocs.map((a: any) => [(a.date || '').slice(0, 10), a]));
        for (const e of missing) {
          const d = (e.date || '').slice(0, 10);
          const a = allocByDate.get(d);
          await this.prisma.btEquityCurve.create({ data: { runId: target.id, date: new Date(d), portfolioValue: e.portfolioValue ?? e.portfolio_value } });
          if (a) {
            await this.prisma.btAllocation.create({
              data: {
                runId: target.id,
                date: new Date(d),
                tqqqPct: (a as any).tqqq_pct ?? (a as any).tqqqPct ?? 1,
                cashPct: (a as any).cash_pct ?? (a as any).cashPct ?? 0,
                tqqqValue: (a as any).tqqq_value ?? (a as any).tqqqValue ?? (a as any).schd_value ?? (a as any).jepq_value ?? 0,
                cashValue: (a as any).cash_value ?? (a as any).cashValue ?? 0,
                portfolioValue: (a as any).portfolio_value ?? (a as any).portfolioValue,
                targetPct: (a as any).target_pct ?? (a as any).targetPct ?? null,
                indicators: (a as any).indicators ?? {},
              },
            });
          }
        }
        // Actualiza endDate y métricas finalValue
        const last = eq[eq.length - 1];
        await this.prisma.btBacktestRun.update({ where: { id: target.id }, data: { endDate: new Date(last.date) } });
        if (last.portfolioValue) {
          await this.prisma.btBacktestMetrics.updateMany({ where: { runId: target.id }, data: { finalValue: last.portfolioValue } });
        }
        this.logger.log(`BH patch ${meta.code}: +${missing.length} días hasta ${last.date} (desde ${maxDate})`);
      } catch (e: any) {
        this.logger.error(`BH patch ${ticker} failed: ${e.message?.slice(0,300)}`);
      }
    }
  }

  private runPythonWithEnv(script: string, args: string[], extraEnv: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [path.join(this.base, script), ...args], {
        cwd: this.base,
        env: { ...process.env, ...extraEnv },
      });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => this.logger.log(d.toString().trim()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0,800)}`))));
    });
  }

  private runPython(script: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [path.join(this.base, script), ...args], {
        cwd: this.base,
        env: { ...process.env, TICKERS: process.env.TICKERS || 'TQQQ,QQQ,SCHD,JEPQ,SQQQ,VOO,SPY,^GSPC,^IXIC' },
      });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => this.logger.log(d.toString().trim()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0,800)}`))));
    });
  }
}
