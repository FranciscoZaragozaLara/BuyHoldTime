import { Inject, Injectable } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';

@Injectable()
export class GetTickersUseCase {
  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
  ) {}

  // Listado público (home, precios, sitemap): resumen sin series históricas.
  async execute(): Promise<Ticker[]> {
    return this.tickerRepository.findAllSummary();
  }
}
