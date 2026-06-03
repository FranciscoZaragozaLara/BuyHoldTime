import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TickerModule } from './modules/ticker/infrastructure/ticker.module';
import { IndicatorModule } from './modules/indicator/infrastructure/indicator.module';
import { SubscriptionModule } from './modules/subscription/infrastructure/subscription.module';

@Module({
  imports: [
    PrismaModule,
    TickerModule,
    IndicatorModule,
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
