import { Module } from '@nestjs/common';
import { MarketSyncService } from './market-sync.service';
import { MarketSyncController } from './market-sync.controller';

@Module({
  providers: [MarketSyncService],
  controllers: [MarketSyncController],
  exports: [MarketSyncService],
})
export class MarketDataModule {}
