import { Indicator } from '../../domain/indicator.entity';
import { IndicatorHistory } from '../../domain/indicator-history.entity';
import type { ValuationDaily } from '../../../market-data/valuation-daily';

export interface IIndicatorRepository {
  findAll(): Promise<Indicator[]>;
  findByKey(key: string): Promise<Indicator | null>;
  findHistory(indicatorId: string, limit?: number): Promise<IndicatorHistory[]>;
  /** Historia con los meses recientes derivados de los datos diarios (sp500_price, schiller_pe, pe_ratio). */
  deriveHistory(key: string, stored: IndicatorHistory[], limit?: number): Promise<IndicatorHistory[]>;
  /** Serie diaria (1990 → hoy) de S&P 500, P/E registrado y CAPE para la gráfica de /indicators. */
  valuationDaily(): Promise<ValuationDaily>;
}

export const IIndicatorRepositorySymbol = Symbol('IIndicatorRepository');
