import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExperimentalController } from './experimental.controller';
import { ExperimentalService } from './experimental.service';

@Module({ imports: [AuthModule], controllers: [ExperimentalController], providers: [ExperimentalService] })
export class ExperimentalModule {}
