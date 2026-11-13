import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as path from 'path';
import { SyncTickersUseCase } from '../application/use-cases/sync-tickers.use-case';
import { PrismaService } from '../../../prisma/prisma.service';
import { logSourceRun } from '../../admin/data-source-runs';

/**
 * Sincronización diaria de precios históricos y métricas de los tickers (Yahoo).
 *
 * Antes solo se actualizaba al llamar a mano POST /tickers/sync, por lo que el
 * historial diario quedaba con huecos. Corre L-V a las 23:00 America/New_York:
 * después del cierre y de los crons de market-sync (22:05 daily_update, 22:35
 * amplitud ~10 min), para no solapar las peticiones a Yahoo.
 * Desactivar con TICKER_SYNC_CRON=off.
 */
@Injectable()
export class TickerSyncScheduler {
  private readonly logger = new Logger(TickerSyncScheduler.name);
  private running = false;
  private edgarRunning = false;

  constructor(private readonly syncTickers: SyncTickersUseCase, @Optional() private readonly prisma?: PrismaService) {}

  @Cron('0 23 * * 1-5', { timeZone: 'America/New_York' })
  async handleDailyTickerSync(): Promise<void> {
    if (process.env.TICKER_SYNC_CRON?.trim().toLowerCase() === 'off') {
      this.logger.log('Ticker sync diario desactivado (TICKER_SYNC_CRON=off)');
      return;
    }
    if (this.running) {
      this.logger.warn('Ticker sync ya en curso; se omite esta ejecución');
      return;
    }
    this.running = true;
    const t0 = Date.now();
    try {
      this.logger.log('Ticker sync diario: inicio');
      const result = await this.syncTickers.execute();
      const minutes = ((Date.now() - t0) / 60000).toFixed(1);
      this.logger.log(
        `Ticker sync diario: ${result.updatedCount} actualizados, ${result.errors.length} con error, ${minutes} min`,
      );
      if (result.errors.length > 0) {
        this.logger.warn(`Errores: ${result.errors.slice(0, 10).join(' | ')}`);
      }
    } catch (e: any) {
      this.logger.error(`Ticker sync diario falló: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Informes SEC EDGAR (EPS, utilidad neta, ingresos y acciones por trimestre).
   * Los 10-Q/10-K salen cuatro veces al año, por eso basta una pasada semanal:
   * domingo 03:00 America/New_York, sin cruzarse con los crons de lunes a viernes.
   * Desactivar con EDGAR_SYNC_CRON=off. Solo SEC (FMP no se mezcla en acciones con EDGAR).
   */
  @Cron('0 3 * * 0', { timeZone: 'America/New_York' })
  async handleWeeklyEdgarSync(): Promise<void> {
    if (process.env.EDGAR_SYNC_CRON?.trim().toLowerCase() === 'off') {
      this.logger.log('EDGAR sync semanal desactivado (EDGAR_SYNC_CRON=off)');
      return;
    }
    if (this.edgarRunning) {
      this.logger.warn('EDGAR sync ya en curso; se omite esta ejecución');
      return;
    }
    this.edgarRunning = true;
    const t0 = Date.now();
    try {
      this.logger.log('EDGAR sync semanal: inicio');
      await this.runTsScript('prisma/sync-all-stocks-edgar.ts', 2 * 60 * 60 * 1000);
      this.logger.log(`EDGAR sync semanal: terminado en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      if (this.prisma) await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-weekly', startedAt: new Date(t0), status: 'ok' });
    } catch (e: any) {
      this.logger.error(`EDGAR sync semanal falló: ${e.message}`);
      if (this.prisma) await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-weekly', startedAt: new Date(t0), status: 'error', message: e.message });
    } finally {
      this.edgarRunning = false;
    }
  }

  /** Lanza un script ts-node desde la raíz de apps/backend (src/ o dist/src/). */
  protected runTsScript(script: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let root = path.resolve(__dirname, '..', '..', '..', '..');
      if (path.basename(root) === 'dist') root = path.resolve(root, '..');
      const proc = spawn('npx', ['ts-node', script], { cwd: root, env: process.env });
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`${script} superó el tiempo límite de ${Math.round(timeoutMs / 60000)} min`));
      }, timeoutMs);
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => {
        const line = d.toString().trim();
        if (line) this.logger.log(line);
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0, 800)}`));
      });
    });
  }
}
