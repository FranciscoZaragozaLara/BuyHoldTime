import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IIndicatorRepositorySymbol } from '../ports/indicator-repository.interface';
import type { IIndicatorRepository } from '../ports/indicator-repository.interface';
import { Indicator } from '../../domain/indicator.entity';
import { IndicatorHistory } from '../../domain/indicator-history.entity';

export interface IndicatorDetailsDto {
  indicator: Indicator;
  history: IndicatorHistory[];
}

@Injectable()
export class GetIndicatorDetailsUseCase {
  constructor(
    @Inject(IIndicatorRepositorySymbol)
    private readonly indicatorRepository: IIndicatorRepository,
  ) {}

  async execute(key: string, limit?: number): Promise<IndicatorDetailsDto> {
    const indicator = await this.indicatorRepository.findByKey(key.toLowerCase());
    if (!indicator) {
      throw new NotFoundException(`Indicator with key ${key} not found`);
    }

    const history = await this.indicatorRepository.findHistory(indicator.id, limit);
    return {
      indicator,
      history,
    };
  }
}
