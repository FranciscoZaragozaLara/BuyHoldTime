import { Controller, Post } from '@nestjs/common';
import { MarketSyncService } from './market-sync.service';

@Controller('api/market-sync')
export class MarketSyncController {
  constructor(private readonly svc: MarketSyncService) {}
  @Post('daily')
  runNow() {
    return this.svc.runNow();
  }
}
