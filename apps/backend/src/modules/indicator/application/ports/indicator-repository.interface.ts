import { Indicator } from '../../domain/indicator.entity';
import { IndicatorHistory } from '../../domain/indicator-history.entity';

export interface IIndicatorRepository {
  findAll(): Promise<Indicator[]>;
  findByKey(key: string): Promise<Indicator | null>;
  findHistory(indicatorId: string, limit?: number): Promise<IndicatorHistory[]>;
}

export const IIndicatorRepositorySymbol = Symbol('IIndicatorRepository');
