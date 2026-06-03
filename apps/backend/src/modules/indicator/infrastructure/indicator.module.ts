import { Module } from '@nestjs/common';
import { IndicatorController } from './controllers/indicator.controller';
import { GetIndicatorsUseCase } from '../application/use-cases/get-indicators.use-case';
import { GetIndicatorDetailsUseCase } from '../application/use-cases/get-indicator-details.use-case';
import { IIndicatorRepositorySymbol } from '../application/ports/indicator-repository.interface';
import { IndicatorRepositoryImpl } from './database/indicator.repository.impl';

@Module({
  controllers: [IndicatorController],
  providers: [
    GetIndicatorsUseCase,
    GetIndicatorDetailsUseCase,
    {
      provide: IIndicatorRepositorySymbol,
      useClass: IndicatorRepositoryImpl,
    },
  ],
  exports: [GetIndicatorsUseCase, GetIndicatorDetailsUseCase],
})
export class IndicatorModule {}
