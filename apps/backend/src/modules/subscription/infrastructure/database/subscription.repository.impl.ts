import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ISubscriptionRepository } from '../../application/ports/subscription-repository.interface';
import { Subscription } from '../../domain/subscription.entity';

@Injectable()
export class SubscriptionRepositoryImpl implements ISubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, email: string): Promise<Subscription> {
    const s = await this.prisma.subscription.create({
      data: { name, email },
    });
    return new Subscription(s.id, s.name, s.email, s.createdAt);
  }

  async findByEmail(email: string): Promise<Subscription | null> {
    const s = await this.prisma.subscription.findUnique({
      where: { email },
    });
    if (!s) return null;
    return new Subscription(s.id, s.name, s.email, s.createdAt);
  }
}
