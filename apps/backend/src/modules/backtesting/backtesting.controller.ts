import { Controller, Get, Post, Body, Query, Param, Res, UseGuards } from '@nestjs/common';
import { AdminOrApiKeyGuard } from '../auth/guards/admin-or-api-key.guard';
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
  @UseGuards(AdminOrApiKeyGuard)
  upsertMarketData(@Body() body: { rows: any[] }) { return this.svc.upsertMarketData(body.rows); }

  @Post('strategies')
  @UseGuards(AdminOrApiKeyGuard)
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
  @UseGuards(AdminOrApiKeyGuard)
  runAndSeed(@Body() body: { strategyCode: string; startDate: string }) { return this.svc.runAndSeed(body.strategyCode, body.startDate); }

  @Post('runs/refresh-stream')
  @UseGuards(AdminOrApiKeyGuard)
  async refreshRunsStream(@Body() body: { strategyCodes: string[] }, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders?.();
    const codes = Array.isArray(body.strategyCodes) ? body.strategyCodes.filter(Boolean) : [];
    await this.svc.streamRefreshRuns(res, codes);
  }

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

  @Get('thermo-history')
  getThermoHistory(@Query('from') from?: string, @Query('to') to?: string) { return this.svc.getThermoHistory(from, to); }

  @Get('bht-forward')
  getBhtForward(@Query('from') from?: string, @Query('to') to?: string) { return this.svc.getBhtForward(from, to); }

  // Termómetro de hoy con datos en vivo (BHT + bonus HY/LIQ/Oil). Fuente única para el frontend;
  // usa computeThermoDay, la misma función que guarda bt_thermo_history.
  @Get('thermo-live')
  getThermoLive() { return this.svc.getThermoLive(); }

  @Get('bht-forward/detail')
  getBhtForwardDetail(@Query('date') date: string) { return this.svc.getBhtForwardDetail(date); }

  @Get('market-data/live')
  getLive(@Query('ticker') ticker: string) {
    if (!ticker) return { error: 'ticker required' };
    return this.svc.getLivePrice(ticker);
  }

  @Post('runs')
  @UseGuards(AdminOrApiKeyGuard)
  saveRun(@Body() body: any) { return this.svc.saveBacktestRun(body); }
}
