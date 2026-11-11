import { Module } from '@nestjs/common';
import { MarketSyncService } from './market-sync.service';
import { MarketSyncController } from './market-sync.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [MarketSyncService],
  controllers: [MarketSyncController],
  exports: [MarketSyncService],
})
export class MarketDataModule {}
