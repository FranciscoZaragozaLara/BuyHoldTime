import { Controller, Post, Res, Header, UseGuards } from '@nestjs/common';
import { AdminOrApiKeyGuard } from '../auth/guards/admin-or-api-key.guard';
import { MarketSyncService } from './market-sync.service';

@Controller('api/market-sync')
export class MarketSyncController {
  constructor(private readonly svc: MarketSyncService) {}
  @Post('daily')
  @UseGuards(AdminOrApiKeyGuard)
  runNow() {
    return this.svc.runNow();
  }

  @Post('daily/stream')
  @UseGuards(AdminOrApiKeyGuard)
  async streamRefresh(@Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders?.();
    await this.svc.streamRefresh(res);
  }
}
