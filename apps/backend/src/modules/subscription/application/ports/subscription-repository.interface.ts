import { Subscription } from '../../domain/subscription.entity';

export interface ISubscriptionRepository {
  create(name: string, email: string): Promise<Subscription>;
  findByEmail(email: string): Promise<Subscription | null>;
}

export const ISubscriptionRepositorySymbol = Symbol('ISubscriptionRepository');
