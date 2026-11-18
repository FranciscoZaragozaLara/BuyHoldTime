import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminOrApiKeyGuard } from '../../../auth/guards/admin-or-api-key.guard';
import { StockSyncService } from '../stock-sync.service';

// Sincronización de acciones del panel admin: GuruFocus + informes trimestrales (SEC EDGAR) en segundo plano.
@Controller('api/stock-sync')
@UseGuards(AdminOrApiKeyGuard)
export class StockSyncController {
  constructor(private readonly svc: StockSyncService) {}

  /** Lanza la sincronización y responde de inmediato (started=false si ya estaba corriendo). */
  @Post()
  @HttpCode(202)
  start() {
    return this.svc.start();
  }

  /** Avance por fase y resumen de la última corrida. */
  @Get('status')
  status() {
    return this.svc.status();
  }
}
