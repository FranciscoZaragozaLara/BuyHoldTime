import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncTickersUseCase } from '../application/use-cases/sync-tickers.use-case';

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

  constructor(private readonly syncTickers: SyncTickersUseCase) {}

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
}
