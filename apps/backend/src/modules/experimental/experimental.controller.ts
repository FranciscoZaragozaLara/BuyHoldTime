import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AdminOrApiKeyGuard } from '../auth/guards/admin-or-api-key.guard';
import { ExperimentalService } from './experimental.service';

// Laboratorio Canary & Phoenix: experimental, informativo. Cada respuesta lleva experimental: true.
@Controller('api/experimental')
export class ExperimentalController {
  constructor(private readonly svc: ExperimentalService) {}

  // Solo admin (o x-api-key de servicio): investigación en curso, no se expone a usuarios.
  @Get('summary')
  @UseGuards(AdminOrApiKeyGuard)
  summary() { return this.svc.summary(); }

  @Get('scores')
  @UseGuards(AdminOrApiKeyGuard)
  scores(@Query('key') key: string, @Query('from') from?: string) { return this.svc.scores(key, from); }

  @Post('run')
  @UseGuards(AdminOrApiKeyGuard)
  run(@Query('steps') steps?: string) { return this.svc.run(steps || undefined); }
}
