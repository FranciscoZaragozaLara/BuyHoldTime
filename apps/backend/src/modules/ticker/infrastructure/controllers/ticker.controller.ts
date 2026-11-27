import { isValidApiKey } from '../../../auth/api-key.util';
import { Controller, Get, Post, Param, Query, Headers, HttpCode, HttpStatus, UnauthorizedException, Body, UseGuards } from '@nestjs/common';
import { AdminOrApiKeyGuard } from '../../../auth/guards/admin-or-api-key.guard';
import { GetTickersUseCase } from '../../application/use-cases/get-tickers.use-case';
import { GetTickerDetailsUseCase } from '../../application/use-cases/get-ticker-details.use-case';
import { SyncTickersUseCase } from '../../application/use-cases/sync-tickers.use-case';
import { FastSyncTickersUseCase } from '../../application/use-cases/fast-sync-tickers.use-case';
import { HeavyThrottle } from '../../../../config/rate-limit';

@Controller('tickers')
export class TickerController {
  constructor(
    private readonly getTickersUseCase: GetTickersUseCase,
    private readonly getTickerDetailsUseCase: GetTickerDetailsUseCase,
    private readonly syncTickersUseCase: SyncTickersUseCase,
    private readonly fastSyncTickersUseCase: FastSyncTickersUseCase,
  ) {}

  @Get()
  async getTickers() {
    const tickers = await this.getTickersUseCase.execute();
    return tickers;
  }

  // Snapshot completo de GuruFocus (GF Score/Value, rankings, tablas, estimados): solo uso interno hasta tener licencia.
  @Get(':symbol/snapshot')
  @UseGuards(AdminOrApiKeyGuard)
  async getFullSnapshot(@Param('symbol') symbol: string) {
    return { snapshot: await this.getTickerDetailsUseCase.fullSnapshot(symbol) };
  }

  @Get(':symbol')
  @HeavyThrottle()
  async getTickerDetails(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const details = await this.getTickerDetailsUseCase.execute(symbol, parsedLimit);
    
    // Safely map BigInt volume to Number for JSON serialization compatibility
    return {
      ticker: details.ticker,
      historicalPrices: details.historicalPrices.map((price) => ({
        ...price,
        volume: Number(price.volume),
      })),
      snapshot: details.snapshot || null,
      fundamentals: details.fundamentals ?? null,
    };
  }

  @Post('fast-sync')
  @HttpCode(HttpStatus.OK)
  async fastSyncTickers(
    @Headers('x-api-key') apiKey?: string,
    @Body('symbols') symbols?: string[],
  ) {
    if (!isValidApiKey(apiKey)) {
      throw new UnauthorizedException('Invalid or missing x-api-key header');
    }
    return this.fastSyncTickersUseCase.executeAll(symbols);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncTickers(@Headers('x-api-key') apiKey?: string) {
    if (!isValidApiKey(apiKey)) {
      throw new UnauthorizedException('Invalid or missing x-api-key header');
    }
    return this.syncTickersUseCase.execute();
  }
}
