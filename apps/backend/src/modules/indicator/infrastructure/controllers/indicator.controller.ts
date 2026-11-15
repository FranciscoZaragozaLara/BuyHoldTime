import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { IIndicatorRepositorySymbol } from '../../application/ports/indicator-repository.interface';
import type { IIndicatorRepository } from '../../application/ports/indicator-repository.interface';
import { GetIndicatorsUseCase } from '../../application/use-cases/get-indicators.use-case';
import { GetIndicatorDetailsUseCase } from '../../application/use-cases/get-indicator-details.use-case';

@Controller('indicators')
export class IndicatorController {
  constructor(
    private readonly getIndicatorsUseCase: GetIndicatorsUseCase,
    private readonly getIndicatorDetailsUseCase: GetIndicatorDetailsUseCase,
    @Inject(IIndicatorRepositorySymbol) private readonly indicatorRepository: IIndicatorRepository,
  ) {}

  @Get()
  async getIndicators() {
    const indicators = await this.getIndicatorsUseCase.execute();
    return indicators;
  }

  // Antes de :key, para que no se interprete como clave de indicador.
  @Get('valuation-daily')
  async getValuationDaily() {
    return this.indicatorRepository.valuationDaily();
  }

  @Get(':key')
  async getIndicatorDetails(
    @Param('key') key: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const details = await this.getIndicatorDetailsUseCase.execute(key, parsedLimit);
    return details;
  }
}
