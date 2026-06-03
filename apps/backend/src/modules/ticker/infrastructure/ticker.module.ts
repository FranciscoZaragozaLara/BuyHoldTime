import { Module } from '@nestjs/common';
import { TickerController } from './controllers/ticker.controller';
import { GetTickersUseCase } from '../application/use-cases/get-tickers.use-case';
import { GetTickerDetailsUseCase } from '../application/use-cases/get-ticker-details.use-case';
import { SyncTickersUseCase } from '../application/use-cases/sync-tickers.use-case';
import { ITickerRepositorySymbol } from '../application/ports/ticker-repository.interface';
import { TickerRepositoryImpl } from './database/ticker.repository.impl';

@Module({
  controllers: [TickerController],
  providers: [
    GetTickersUseCase,
    GetTickerDetailsUseCase,
    SyncTickersUseCase,
    {
      provide: ITickerRepositorySymbol,
      useClass: TickerRepositoryImpl,
    },
  ],
  exports: [GetTickersUseCase, GetTickerDetailsUseCase, SyncTickersUseCase],
})
export class TickerModule {}
