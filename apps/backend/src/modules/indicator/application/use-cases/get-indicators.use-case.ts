import { Inject, Injectable } from '@nestjs/common';
import { IIndicatorRepositorySymbol } from '../ports/indicator-repository.interface';
import type { IIndicatorRepository } from '../ports/indicator-repository.interface';
import { Indicator } from '../../domain/indicator.entity';

@Injectable()
export class GetIndicatorsUseCase {
  constructor(
    @Inject(IIndicatorRepositorySymbol)
    private readonly indicatorRepository: IIndicatorRepository,
  ) {}

  async execute(): Promise<Indicator[]> {
    return this.indicatorRepository.findAll();
  }
}
