import { Inject, Injectable } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { FastSyncTickersUseCase, LIVE_QUOTE_MAX_AGE_MS } from './fast-sync-tickers.use-case';

@Injectable()
export class GetTickersUseCase {
  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
    private readonly fastSync?: FastSyncTickersUseCase,
  ) {}

  // Listado público (home, precios, sitemap): resumen sin series históricas. Si la cotización más reciente tiene más
  // de 15 minutos, responde con lo guardado y refresca todas en segundo plano (antes solo se refrescaban al abrir un
  // detalle, así que la lista podía mostrar el cambio del día de horas atrás aunque se recargara).
  async execute(now = Date.now()): Promise<Ticker[]> {
    const list = await this.tickerRepository.findAllSummary();
    const newest = list.reduce((m, t) => Math.max(m, t.updatedAt ? new Date(t.updatedAt).getTime() : 0), 0);
    if (this.fastSync && list.length > 0 && now - newest > LIVE_QUOTE_MAX_AGE_MS) this.fastSync.refreshAllInBackground();
    return list;
  }
}
