import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarginDebtService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatest() {
    return this.prisma.marginDebt.findFirst({
      orderBy: { date: 'desc' },
    });
  }

  async getHistory(limitMonths?: number) {
    const records = await this.prisma.marginDebt.findMany({
      orderBy: { date: 'desc' },
      take: limitMonths ? Number(limitMonths) : undefined,
    });
    return records.reverse();
  }

  async getRiskSummary() {
    const latest = await this.getLatest();
    if (!latest) {
      return { status: 'NO_DATA', message: 'No hay datos de Margin Debt disponibles.' };
    }

    const previous = await this.prisma.marginDebt.findFirst({
      where: { date: { lt: latest.date } },
      orderBy: { date: 'desc' },
    });

    const debitChangeMoM = previous
      ? Number((((latest.debitBalances - previous.debitBalances) / previous.debitBalances) * 100).toFixed(2))
      : 0;

    return {
      latestDate: latest.date,
      debitBalances: latest.debitBalances,
      freeCreditCash: latest.freeCreditCash,
      freeCreditMargin: latest.freeCreditMargin,
      netCreditBalance: latest.netCreditBalance,
      sp500Price: latest.sp500Price,
      currencyInCirculation: latest.currencyInCirculation,
      marginCurrencyRatio: latest.marginCurrencyRatio,
      marginDebtRatio: latest.marginDebtRatio,
      marginDebtYoY: latest.marginDebtYoY,
      sp500YoY: latest.sp500YoY,
      divergence: latest.divergence,
      riskScore: latest.riskScore,
      riskLevel: latest.riskLevel,
      debitChangeMoM,
      source: latest.source,
      updatedAt: latest.updatedAt,
    };
  }
}

