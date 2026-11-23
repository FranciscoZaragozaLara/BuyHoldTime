import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncTickersUseCase } from '../application/use-cases/sync-tickers.use-case';
import { PrismaService } from '../../../prisma/prisma.service';
import { logSourceRun } from '../../admin/data-source-runs';
import { runTsScript } from './stock-sync.service';
import { EDGAR_UA, fetchLatestFilings, symbolsToSync } from './edgar-new-filings';

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

  /**
   * Chequeo diario de reportes nuevos (L-V 21:30 ET): revisa en la SEC el último 10-Q/10-K de cada acción con EDGAR y
   * sincroniza solo las que presentaron algo después de lo guardado, sin esperar al sync semanal del domingo (en
   * temporada de reportes la espera llegaba a 7 días). Antes de market-sync (22:05) y del sync de tickers (23:00).
   * Se desactiva junto con el semanal (EDGAR_SYNC_CRON=off).
   */
  @Cron('30 21 * * 1-5', { timeZone: 'America/New_York' })
  async handleDailyEdgarNewFilings(): Promise<void> {
    if (process.env.EDGAR_SYNC_CRON?.trim().toLowerCase() === 'off' || !this.prisma) return;
    if (this.edgarRunning) { this.logger.warn('EDGAR sync en curso; se omite el chequeo diario'); return; }
    this.edgarRunning = true;
    const t0 = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ symbol: string; filed: string | null }>>(
        `SELECT t.symbol, max(e->>'date') AS filed FROM tickers t, jsonb_array_elements(COALESCE(t.historical_eps_quarterly::jsonb, '[]'::jsonb)) e
         WHERE e->>'source' = 'EDGAR' GROUP BY t.symbol`);
      const stored = new Map(rows.map((r) => [r.symbol.toUpperCase(), r.filed] as [string, string | null]));
      const map = (await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': EDGAR_UA } })).json()) as Record<string, { ticker: string; cik_str: number }>;
      const ciks = new Map<string, string>();
      for (const v of Object.values(map)) { const sym = String(v.ticker).toUpperCase(); if (stored.has(sym)) ciks.set(sym, String(v.cik_str).padStart(10, '0')); }
      const todo = symbolsToSync(stored, await fetchLatestFilings(ciks));
      if (todo.length) {
        this.logger.log(`EDGAR diario: reportes nuevos de ${todo.join(', ')}`);
        await this.runTsScript('prisma/sync-all-stocks-edgar.ts', 30 * 60 * 1000, { SYMBOLS: todo.join(',') });
      }
      await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-daily', startedAt: new Date(t0), status: 'ok', rows: todo.length, message: todo.length ? todo.join(',') : null });
    } catch (e: any) {
      this.logger.error(`EDGAR diario falló: ${e.message}`);
      await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-daily', startedAt: new Date(t0), status: 'error', message: e.message });
    } finally {
      this.edgarRunning = false;
    }
  }

  /** Lanza un script ts-node desde la raíz de apps/backend (src/ o dist/src/). */
  protected runTsScript(script: string, timeoutMs: number, extraEnv: Record<string, string> = {}): Promise<void> {
    return runTsScript(script, timeoutMs, (line) => this.logger.log(line), extraEnv);
  }
}
