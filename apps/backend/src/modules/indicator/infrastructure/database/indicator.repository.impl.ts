import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IIndicatorRepository } from '../../application/ports/indicator-repository.interface';
import { Indicator } from '../../domain/indicator.entity';
import { IndicatorHistory } from '../../domain/indicator-history.entity';

@Injectable()
export class IndicatorRepositoryImpl implements IIndicatorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Indicator[]> {
    const indicators = await this.prisma.indicator.findMany({
      orderBy: { key: 'asc' },
    });
    return indicators.map(
      (ind) =>
        new Indicator(
          ind.id,
          ind.key,
          ind.name,
          ind.currentValue,
          ind.unit,
          ind.status,
          ind.description,
          ind.createdAt,
          ind.updatedAt,
        ),
    );
  }

  async findByKey(key: string): Promise<Indicator | null> {
    const ind = await this.prisma.indicator.findUnique({
      where: { key },
    });
    if (!ind) return null;
    return new Indicator(
      ind.id,
      ind.key,
      ind.name,
      ind.currentValue,
      ind.unit,
      ind.status,
      ind.description,
      ind.createdAt,
      ind.updatedAt,
    );
  }

  async findHistory(indicatorId: string, limit?: number): Promise<IndicatorHistory[]> {
    const history = await this.prisma.indicatorHistory.findMany({
      where: { indicatorId },
      orderBy: { date: 'asc' },
      take: limit,
    });
    return history.map(
      (h) =>
        new IndicatorHistory(
          h.id,
          h.indicatorId,
          h.date,
          h.value,
        ),
    );
  }
}
