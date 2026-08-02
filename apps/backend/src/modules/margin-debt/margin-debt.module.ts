import { Module } from '@nestjs/common';
import { MarginDebtController } from './margin-debt.controller';
import { MarginDebtService } from './margin-debt.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarginDebtController],
  providers: [MarginDebtService],
  exports: [MarginDebtService],
})
export class MarginDebtModule {}
