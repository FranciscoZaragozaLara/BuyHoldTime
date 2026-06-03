import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { ISubscriptionRepositorySymbol } from '../ports/subscription-repository.interface';
import type { ISubscriptionRepository } from '../ports/subscription-repository.interface';
import { Subscription } from '../../domain/subscription.entity';

@Injectable()
export class CreateSubscriptionUseCase {
  constructor(
    @Inject(ISubscriptionRepositorySymbol)
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  async execute(name: string, email: string): Promise<Subscription> {
    const existing = await this.subscriptionRepository.findByEmail(email.toLowerCase());
    if (existing) {
      throw new ConflictException(`Email ${email} is already subscribed`);
    }

    return this.subscriptionRepository.create(name, email.toLowerCase());
  }
}
