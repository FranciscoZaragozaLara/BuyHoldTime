import { Controller, Get, Query } from '@nestjs/common';
import { MarginDebtService } from './margin-debt.service';

@Controller('margin-debt')
export class MarginDebtController {
  constructor(private readonly marginDebtService: MarginDebtService) {}

  @Get('latest')
  async getLatest() {
    return this.marginDebtService.getLatest();
  }

  @Get('history')
  async getHistory(@Query('months') months?: string) {
    const limit = months ? parseInt(months, 10) : undefined;
    return this.marginDebtService.getHistory(limit);
  }

  @Get('risk-summary')
  async getRiskSummary() {
    return this.marginDebtService.getRiskSummary();
  }
}
