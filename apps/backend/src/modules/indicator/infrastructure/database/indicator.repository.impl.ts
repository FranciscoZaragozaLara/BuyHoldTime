import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IIndicatorRepository } from '../../application/ports/indicator-repository.interface';
import { Indicator } from '../../domain/indicator.entity';
import { IndicatorHistory } from '../../domain/indicator-history.entity';
import { monthlyLast, peMonthlyHistory, toMap, type HistoryPoint, type PriceMap } from '../../../market-data/indicator-sync';
import { buildValuationDaily, spliceSeries, type ValuationDaily } from '../../../market-data/valuation-daily';

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
      orderBy: { date: 'desc' },
      take: limit,
    });
    // Reverse to chronological order (ascending) for charting compatibility
    const reversed = [...history].reverse();
    return reversed.map(
      (h) =>
        new IndicatorHistory(
          h.id,
          h.indicatorId,
          h.date,
          h.value,
        ),
    );
  }

  // Meses posteriores a la serie mensual de Shiller (precio, CAPE) y P/E mensual completo, derivados al leer
  // de los datos diarios con las reglas del termómetro (no se guardan en indicator_histories).
  async deriveHistory(key: string, stored: IndicatorHistory[], limit?: number): Promise<IndicatorHistory[]> {
    if (key !== 'sp500_price' && key !== 'schiller_pe' && key !== 'pe_ratio') return stored;
    const today = new Date().toISOString().slice(0, 10);
    const daily = async (ticker: string, from: string): Promise<PriceMap> => {
      const rows = await this.prisma.btMarketData.findMany({ where: { ticker, date: { gte: new Date(`${from}T00:00:00Z`) } }, select: { date: true, close: true } });
      return toMap(rows.map((r) => ({ d: r.date.toISOString().slice(0, 10), v: r.close })));
    };
    const indicatorId = stored[0]?.indicatorId ?? key;
    const toEntities = (pts: HistoryPoint[]) => pts.map((p) => new IndicatorHistory(`derived-${key}-${p.date}`, indicatorId, new Date(`${p.date}T00:00:00Z`), p.value));
    const cut = (arr: IndicatorHistory[]) => (limit ? arr.slice(-limit) : arr);
    if (key === 'pe_ratio') {
      const hist = async (k: string) => toMap(await this.prisma.$queryRawUnsafe(
        `SELECT h.date::text AS d, h.value AS v FROM indicator_histories h JOIN indicators i ON i.id = h.indicator_id WHERE i.key = $1`, k) as Array<{ d: string; v: unknown }>);
      const [shillerPrice, shillerEarnings, spx, spxEps] = await Promise.all([hist('sp500_price'), hist('sp500_earnings'), daily('^GSPC', '1990-01-01'), daily('SPX_EPS', '1871-01-01')]);
      return cut(toEntities(peMonthlyHistory({ shillerPrice, shillerEarnings, spx, spxEps }, today)));
    }
    const lastMonth = stored.length ? stored[stored.length - 1].date.toISOString().slice(0, 7) : '';
    const from = lastMonth ? `${lastMonth}-01` : '1990-01-01';
    const src = key === 'sp500_price'
      ? await daily('^GSPC', from)
      : toMap(await this.prisma.$queryRawUnsafe(`SELECT date::text AS d, cape AS v FROM bt_shiller_daily WHERE cape IS NOT NULL AND date >= $1::date`, from) as Array<{ d: string; v: unknown }>);
    return cut([...stored, ...toEntities(monthlyLast(src, lastMonth, today))]);
  }

  // Serie diaria para la gráfica de /indicators (incluye el BHT del día).
  async valuationDaily(): Promise<ValuationDaily> {
    const daily = async (ticker: string, from: string): Promise<PriceMap> => {
      const rows = await this.prisma.btMarketData.findMany({ where: { ticker, date: { gte: new Date(`${from}T00:00:00Z`) } }, select: { date: true, close: true } });
      return toMap(rows.map((r) => ({ d: r.date.toISOString().slice(0, 10), v: r.close })));
    };
    const [spx, spxEps, cape, bht, qqqOld, qqq, tqqq, ndxPeOwn, trendRows] = await Promise.all([
      daily('^GSPC', '1990-01-01'),
      daily('SPX_EPS', '1871-01-01'),
      this.prisma.$queryRawUnsafe(`SELECT date::text AS d, cape AS v FROM bt_shiller_daily WHERE cape IS NOT NULL AND date >= '1990-01-01'`).then((r) => toMap(r as Array<{ d: string; v: unknown }>)),
      this.prisma.$queryRawUnsafe(`SELECT date::text AS d, value AS v FROM bt_thermo_history WHERE date >= '1990-01-01'`).then((r) => toMap(r as Array<{ d: string; v: unknown }>)),
      // QQQ antes de 2010 (bt_market_data empieza ahí): precios del listado de tickers desde su inicio (1999).
      this.prisma.$queryRawUnsafe(`SELECT h.date::text AS d, h.close AS v FROM historical_prices h JOIN tickers t ON t.id = h.ticker_id WHERE t.symbol = 'QQQ'`).then((r) => toMap(r as Array<{ d: string; v: unknown }>)),
      daily('QQQ', '1990-01-01'),
      daily('TQQQ', '1990-01-01'),
      daily('NDX_PE_EDGAR', '2011-01-01'),
      this.prisma.$queryRawUnsafe(`SELECT date::text AS d, trend_regime AS r FROM bt_thermo_history WHERE trend_regime IS NOT NULL AND date >= '1990-01-01'`) as Promise<Array<{ d: string; r: string }>>,
    ]);
    // P/E mensual propio del Nasdaq 100 (EDGAR, desde 2011; un dato por mes en su último día con precio, que es el ancla
    // del EPS implícito). Antes de 2011 no hay P/E: los datos de terceros (GuruFocus, WSJ/Birinyi) ya no se publican.
    const ndxMonthlyPe = new Map<string, number>();
    const ndxPeAnchors = new Map<string, string>();
    for (const d of [...ndxPeOwn.keys()].sort()) {
      const v = ndxPeOwn.get(d)!;
      if (v > 0) { ndxMonthlyPe.set(d.slice(0, 7), v); ndxPeAnchors.set(d.slice(0, 7), d); }
    }
    // historical_prices trae el cierre sin ajustar y bt_market_data el ajustado: se unen con el factor del primer día común.
    const qqqAll = spliceSeries(qqqOld, qqq);
    const trend = new Map(trendRows.map((x) => [x.d, x.r]));
    return buildValuationDaily(spx, spxEps, cape, bht, { qqq: qqqAll, tqqq, ndxMonthlyPe, ndxPeAnchors, trend });
  }
}
