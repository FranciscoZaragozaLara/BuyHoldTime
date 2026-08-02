import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TickerModule } from './modules/ticker/infrastructure/ticker.module';
import { IndicatorModule } from './modules/indicator/infrastructure/indicator.module';
import { SubscriptionModule } from './modules/subscription/infrastructure/subscription.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { MarginDebtModule } from './modules/margin-debt/margin-debt.module';

@Module({
  imports: [
    PrismaModule,
    TickerModule,
    IndicatorModule,
    SubscriptionModule,
    AuthModule,
    AdminModule,
    MarginDebtModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

