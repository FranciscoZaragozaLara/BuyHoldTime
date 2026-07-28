import { Controller, Get, Post, Param, Query, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { GetTickersUseCase } from '../../application/use-cases/get-tickers.use-case';
import { GetTickerDetailsUseCase } from '../../application/use-cases/get-ticker-details.use-case';
import { SyncTickersUseCase } from '../../application/use-cases/sync-tickers.use-case';

@Controller('tickers')
export class TickerController {
  constructor(
    private readonly getTickersUseCase: GetTickersUseCase,
    private readonly getTickerDetailsUseCase: GetTickerDetailsUseCase,
    private readonly syncTickersUseCase: SyncTickersUseCase,
  ) {}

  @Get()
  async getTickers() {
    const tickers = await this.getTickersUseCase.execute();
    return tickers;
  }

  @Get(':symbol')
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
    };
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncTickers(@Headers('x-api-key') apiKey?: string) {
    const expectedApiKey = process.env.SYNC_API_KEY || 'test-sync-key';
    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing x-api-key header');
    }
    return this.syncTickersUseCase.execute();
  }
}
