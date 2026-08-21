import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { BacktestingService } from './backtesting.service';

@Controller('api/backtesting')
export class BacktestingController {
  constructor(private svc: BacktestingService) {}

  @Get('strategies')
  getStrategies() { return this.svc.getStrategies(); }

  @Get('market-data')
  getMarketData(@Query('ticker') ticker: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getMarketData(ticker, from, to);
  }

  @Post('market-data/bulk')
  upsertMarketData(@Body() body: { rows: any[] }) { return this.svc.upsertMarketData(body.rows); }

  @Post('strategies')
  createStrategy(@Body() body: { code: string; name: string; description?: string; paramsSchema?: any }) {
    return this.svc.getOrCreateStrategy(body.code, body.name, body.description, body.paramsSchema);
  }

  @Get('start-dates')
  getStartDates() { return this.svc.getStartDates(); }

  @Get('runs')
  getRuns(@Query('strategyCode') strategyCode?: string, @Query('startDate') startDate?: string) { return this.svc.getRuns(strategyCode, startDate); }

  @Get('runs/grouped')
  getGrouped(@Query('startDate') startDate?: string) { return this.svc.getRunsGroupedByStrategy(startDate); }

  @Post('runs/run-and-seed')
  runAndSeed(@Body() body: { strategyCode: string; startDate: string }) { return this.svc.runAndSeed(body.strategyCode, body.startDate); }

  @Get('runs/:id/equity')
  getEquity(@Param('id') id: string) { return this.svc.getEquity(id); }

  @Get('runs/:id/trades')
  getTrades(@Param('id') id: string) { return this.svc.getTrades(id); }

  @Get('runs/:id/allocations')
  getAllocations(@Param('id') id: string) { return this.svc.getAllocations(id); }

  @Get('comparativa')
  getComparativa(@Query('runIds') runIds: string) { return this.svc.getComparativa(runIds.split(',')); }

  @Get('shiller-daily')
  getShillerDaily(@Query('from') from?: string, @Query('to') to?: string) { return this.svc.getShillerDaily(from, to); }

  @Get('market-data/live')
  getLive(@Query('ticker') ticker: string) {
    if (!ticker) return { error: 'ticker required' };
    return this.svc.getLivePrice(ticker);
  }

  @Post('runs')
  saveRun(@Body() body: any) { return this.svc.saveBacktestRun(body); }
}
