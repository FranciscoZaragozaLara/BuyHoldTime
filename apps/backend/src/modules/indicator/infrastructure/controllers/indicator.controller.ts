import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetIndicatorsUseCase } from '../../application/use-cases/get-indicators.use-case';
import { GetIndicatorDetailsUseCase } from '../../application/use-cases/get-indicator-details.use-case';

@Controller('indicators')
export class IndicatorController {
  constructor(
    private readonly getIndicatorsUseCase: GetIndicatorsUseCase,
    private readonly getIndicatorDetailsUseCase: GetIndicatorDetailsUseCase,
  ) {}

  @Get()
  async getIndicators() {
    const indicators = await this.getIndicatorsUseCase.execute();
    return indicators;
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
