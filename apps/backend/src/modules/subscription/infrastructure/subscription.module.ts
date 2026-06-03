import { Module } from '@nestjs/common';
import { SubscriptionController } from './controllers/subscription.controller';
import { CreateSubscriptionUseCase } from '../application/use-cases/create-subscription.use-case';
import { ISubscriptionRepositorySymbol } from '../application/ports/subscription-repository.interface';
import { SubscriptionRepositoryImpl } from './database/subscription.repository.impl';

@Module({
  controllers: [SubscriptionController],
  providers: [
    CreateSubscriptionUseCase,
    {
      provide: ISubscriptionRepositorySymbol,
      useClass: SubscriptionRepositoryImpl,
    },
  ],
  exports: [CreateSubscriptionUseCase],
})
export class SubscriptionModule {}
