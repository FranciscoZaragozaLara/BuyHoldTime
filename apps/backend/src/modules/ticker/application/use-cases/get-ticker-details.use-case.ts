import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITickerRepositorySymbol } from '../ports/ticker-repository.interface';
import type { ITickerRepository } from '../ports/ticker-repository.interface';
import { Ticker } from '../../domain/ticker.entity';
import { HistoricalPrice } from '../../domain/historical-price.entity';
import { FastSyncTickersUseCase, LIVE_QUOTE_MAX_AGE_MS } from './fast-sync-tickers.use-case';
import { fundamentals, type Fundamentals, type QuarterFundamentals } from '../../domain/fundamentals-ttm';
import { publicSnapshot } from '../../domain/public-snapshot';

export interface TickerDetailsDto {
  ticker: Ticker;
  historicalPrices: HistoricalPrice[];
  /** Solo lo público del snapshot de GuruFocus (domain/public-snapshot.ts). */
  snapshot?: any;
  /** Fundamentales propios desde los trimestres de EDGAR (ingresos, EPS, EBIT, margen, P/E, P/S). */
  fundamentals?: Fundamentals | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Trimestres de historical_eps_quarterly → entrada de fundamentals() (EPS diluido si existe). */
export function quartersOf(raw: unknown): QuarterFundamentals[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return raw
    .filter((q: any) => q && typeof q.date === 'string')
    .map((q: any) => ({ date: q.date.slice(0, 10), revenue: num(q.revenue), eps: num(q.epsDiluted) ?? num(q.eps), operatingIncome: num(q.operatingIncome), netIncome: num(q.netIncome) }));
}

/** Cierre del último día con cotización hace al menos un año (precios en orden descendente o cualquiera). */
export function closeOneYearAgo(prices: Array<{ date: Date; close: number }>, today: string): number | null {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 864e5);
  let best: { date: Date; close: number } | null = null;
  for (const p of prices) if (p.date <= cutoff && (!best || p.date > best.date)) best = p;
  return best && best.close > 0 ? best.close : null;
}

@Injectable()
export class GetTickerDetailsUseCase {
  constructor(
    @Inject(ITickerRepositorySymbol)
    private readonly tickerRepository: ITickerRepository,
    private readonly fastSyncTickersUseCase: FastSyncTickersUseCase,
  ) {}

  async execute(symbol: string, limit?: number): Promise<TickerDetailsDto> {
    const cleanSymbol = symbol.toUpperCase();
    let ticker = await this.tickerRepository.findBySymbol(cleanSymbol);
    if (!ticker) {
      throw new NotFoundException(`Ticker with symbol ${symbol} not found`);
    }

    // Auto-refresh live price if stored updatedAt is older than 15 minutes
    const ageMs = Date.now() - new Date(ticker.updatedAt).getTime();
    if (ageMs > LIVE_QUOTE_MAX_AGE_MS) {
      const refreshed = await this.fastSyncTickersUseCase.executeSingle(cleanSymbol);
      if (refreshed) {
        ticker = refreshed;
      }
      // El resto de las cotizaciones en segundo plano (~3.5 s), e invalida la caché de la lista del frontend.
      this.fastSyncTickersUseCase.refreshAllInBackground();
    }

    const historicalPrices = await this.tickerRepository.findHistoricalPrices(ticker.id, limit);
    const snapshot = await this.tickerRepository.findLatestSnapshot(cleanSymbol);
    const today = isoDay(new Date());

    return {
      ticker,
      historicalPrices,
      snapshot: publicSnapshot(snapshot),
      fundamentals: fundamentals(
        quartersOf(ticker.historicalEpsQuarterly),
        today,
        ticker.price > 0 ? ticker.price : null,
        closeOneYearAgo(historicalPrices, today),
      ),
    };
  }

  /** Snapshot completo de GuruFocus: solo uso interno (admin / x-api-key). */
  async fullSnapshot(symbol: string) {
    return (await this.tickerRepository.findLatestSnapshot(symbol.toUpperCase())) ?? null;
  }
}
