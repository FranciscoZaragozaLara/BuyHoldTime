import { Controller, Post, Body } from '@nestjs/common';
import { CreateSubscriptionUseCase } from '../../application/use-cases/create-subscription.use-case';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly createSubscriptionUseCase: CreateSubscriptionUseCase) {}

  @Post()
  async createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.createSubscriptionUseCase.execute(dto.name, dto.email);
  }
}
