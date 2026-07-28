import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ITickerRepository } from '../../application/ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';

@Injectable()
export class TickerRepositoryImpl implements ITickerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Ticker[]> {
    const tickers = await this.prisma.ticker.findMany({
      orderBy: { symbol: 'asc' },
    });
    return tickers.map(
      (t) =>
        new Ticker(
          t.id,
          t.symbol,
          t.name,
          t.price,
          t.changePercent,
          t.sector,
          t.buyHoldIndex,
          t.recommendation,
          t.pe,
          t.dy,
          t.cap,
          t.createdAt,
          t.updatedAt,
          t.eps,
          t.forwardPe,
          t.trailingPe,
          t.pegRatio,
          t.enterpriseValue,
          t.avgVolume,
          t.fiftyTwoWeekHigh,
          t.fiftyTwoWeekLow,
          t.dividendRate,
          t.bookValue,
          t.historicalEps,
          t.historicalDividends,
          t.historicalEpsQuarterly as any,
        ),
    );
  }

  async findBySymbol(symbol: string): Promise<Ticker | null> {
    const t = await this.prisma.ticker.findUnique({
      where: { symbol },
    });
    if (!t) return null;
    return new Ticker(
      t.id,
      t.symbol,
      t.name,
      t.price,
      t.changePercent,
      t.sector,
      t.buyHoldIndex,
      t.recommendation,
      t.pe,
      t.dy,
      t.cap,
      t.createdAt,
      t.updatedAt,
      t.eps,
      t.forwardPe,
      t.trailingPe,
      t.pegRatio,
      t.enterpriseValue,
      t.avgVolume,
      t.fiftyTwoWeekHigh,
      t.fiftyTwoWeekLow,
      t.dividendRate,
      t.bookValue,
      t.historicalEps,
      t.historicalDividends,
      t.historicalEpsQuarterly as any,
    );
  }

  async findHistoricalPrices(tickerId: string, limit?: number): Promise<HistoricalPrice[]> {
    const prices = await this.prisma.historicalPrice.findMany({
      where: { tickerId },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return prices
      .map(
        (p) =>
          new HistoricalPrice(
            p.id,
            p.tickerId,
            p.date,
            p.open,
            p.high,
            p.low,
            p.close,
            p.adjClose,
            p.volume,
          ),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async updateValuationMetrics(tickerId: string, data: Partial<Ticker>): Promise<void> {
    const updateData: any = {};
    if (data.price !== undefined) updateData.price = data.price;
    if (data.changePercent !== undefined) updateData.changePercent = data.changePercent;
    if (data.buyHoldIndex !== undefined) updateData.buyHoldIndex = data.buyHoldIndex;
    if (data.recommendation !== undefined) updateData.recommendation = data.recommendation;
    if (data.pe !== undefined) updateData.pe = data.pe;
    if (data.dy !== undefined) updateData.dy = data.dy;
    if (data.cap !== undefined) updateData.cap = data.cap;
    if (data.eps !== undefined) updateData.eps = data.eps;
    if (data.forwardPe !== undefined) updateData.forwardPe = data.forwardPe;
    if (data.trailingPe !== undefined) updateData.trailingPe = data.trailingPe;
    if (data.pegRatio !== undefined) updateData.pegRatio = data.pegRatio;
    if (data.enterpriseValue !== undefined) updateData.enterpriseValue = data.enterpriseValue;
    if (data.avgVolume !== undefined) updateData.avgVolume = data.avgVolume;
    if (data.fiftyTwoWeekHigh !== undefined) updateData.fiftyTwoWeekHigh = data.fiftyTwoWeekHigh;
    if (data.fiftyTwoWeekLow !== undefined) updateData.fiftyTwoWeekLow = data.fiftyTwoWeekLow;
    if (data.dividendRate !== undefined) updateData.dividendRate = data.dividendRate;
    if (data.bookValue !== undefined) updateData.bookValue = data.bookValue;
    if (data.historicalEps !== undefined) updateData.historicalEps = data.historicalEps;
    if (data.historicalDividends !== undefined) updateData.historicalDividends = data.historicalDividends;
    if (data.historicalEpsQuarterly !== undefined) updateData.historicalEpsQuarterly = data.historicalEpsQuarterly;

    await this.prisma.ticker.update({
      where: { id: tickerId },
      data: updateData,
    });
  }

  async saveHistoricalPrices(
    tickerId: string,
    prices: { date: Date; open: number; high: number; low: number; close: number; adjClose: number; volume: bigint }[],
  ): Promise<void> {
    await this.prisma.historicalPrice.createMany({
      data: prices.map((p) => ({
        tickerId,
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        adjClose: p.adjClose,
        volume: p.volume,
      })),
      skipDuplicates: true,
    });
  }

  async clearHistoricalPrices(tickerId: string): Promise<void> {
    await this.prisma.historicalPrice.deleteMany({
      where: { tickerId },
    });
  }

  async findLatestSnapshot(symbol: string): Promise<any | null> {
    const stock = await this.prisma.stock.findFirst({
      where: { ticker: { equals: symbol, mode: 'insensitive' } },
    });
    if (!stock) return null;

    const snapshot = await this.prisma.snapshot.findFirst({
      where: { stockId: stock.id },
      orderBy: { scrapeDate: 'desc' },
    });

    if (!snapshot) return null;

    return {
      ...snapshot,
      price: snapshot.price ? Number(snapshot.price) : null,
      gfValue: snapshot.gfValue ? Number(snapshot.gfValue) : null,
      pe: snapshot.pe ? Number(snapshot.pe) : null,
      pb: snapshot.pb ? Number(snapshot.pb) : null,
      forwardPe: snapshot.forwardPe ? Number(snapshot.forwardPe) : null,
      pegRatio: snapshot.pegRatio ? Number(snapshot.pegRatio) : null,
      psRatio: snapshot.psRatio ? Number(snapshot.psRatio) : null,
      shillerPe: snapshot.shillerPe ? Number(snapshot.shillerPe) : null,
      dividendYield: snapshot.dividendYield ? Number(snapshot.dividendYield) : null,
      earningsYield: snapshot.earningsYield ? Number(snapshot.earningsYield) : null,
      evToEbitda: snapshot.evToEbitda ? Number(snapshot.evToEbitda) : null,
    };
  }
}
