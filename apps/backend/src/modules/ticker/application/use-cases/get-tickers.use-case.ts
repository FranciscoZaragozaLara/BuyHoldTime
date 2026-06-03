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

  async execute(): Promise<Ticker[]> {
    return this.tickerRepository.findAll();
  }
}
