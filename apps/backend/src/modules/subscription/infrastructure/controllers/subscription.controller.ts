import { Controller, Post, Body } from '@nestjs/common';
import { CreateSubscriptionUseCase } from '../../application/use-cases/create-subscription.use-case';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SignupThrottle } from '../../../../config/rate-limit';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly createSubscriptionUseCase: CreateSubscriptionUseCase) {}

  @Post()
  @SignupThrottle()
  async createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.createSubscriptionUseCase.execute(dto.name, dto.email);
  }
}
