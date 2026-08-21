import { Module } from '@nestjs/common';
import { BacktestingService } from './backtesting.service';
import { BacktestingController } from './backtesting.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BacktestingController],
  providers: [BacktestingService],
  exports: [BacktestingService],
})
export class BacktestingModule {}
