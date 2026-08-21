import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TickerModule } from './modules/ticker/infrastructure/ticker.module';
import { IndicatorModule } from './modules/indicator/infrastructure/indicator.module';
import { SubscriptionModule } from './modules/subscription/infrastructure/subscription.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { MarginDebtModule } from './modules/margin-debt/margin-debt.module';
import { BacktestingModule } from './modules/backtesting/backtesting.module';
import { MarketDataModule } from './modules/market-data/market-data.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TickerModule,
    IndicatorModule,
    SubscriptionModule,
    AuthModule,
    AdminModule,
    MarginDebtModule,
    BacktestingModule,
    MarketDataModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

