import { Controller, Get, Patch, Param, Body, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { Role } from '@prisma/client';
import { DATA_SOURCES, evaluateSource, summarize } from './data-freshness';

@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  /** Frescura de datos por fuente (último dato en la BD y estatus según su ritmo de publicación). */
  @Get('data-freshness')
  async getDataFreshness() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const sources = await Promise.all(DATA_SOURCES.map(async (cfg) => {
      try {
        const rows = await this.prisma.$queryRawUnsafe<{ series: string; d: string | null }[]>(cfg.sql);
        return evaluateSource(cfg, rows, today);
      } catch (e: any) {
        return evaluateSource(cfg, [], today, String(e?.message ?? e).slice(0, 200));
      }
    }));
    return { today, generatedAt: new Date().toISOString(), summary: summarize(sources), sources };
  }

  @Get('tickers')
  async getTickers() {
    const tickers = await this.prisma.ticker.findMany({
      select: {
        id: true,
        symbol: true,
        name: true,
        price: true,
        buyHoldIndex: true,
        recommendation: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { symbol: 'asc' },
    });

    return {
      success: true,
      count: tickers.length,
      tickers,
    };
  }

  @Get('users')
  async getUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      count: users.length,
      users,
    };
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Body('role') role: Role,
  ) {
    if (!role || !['FREE_USER', 'PRO_USER', 'ADMIN'].includes(role)) {
      throw new BadRequestException('Invalid role. Must be FREE_USER, PRO_USER, or ADMIN.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { role },
    });

    try {
      await this.firebaseAdminService.getAuth().setCustomUserClaims(user.firebaseUid, { role });
    } catch (err: any) {
      console.error(`Failed to update Firebase custom claims for ${user.email}:`, err.message);
    }

    return {
      success: true,
      user: updatedUser,
    };
  }
}
