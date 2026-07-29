import { Controller, Get, Post, Body, UseGuards, Request, Headers, UnauthorizedException, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { FirebaseAuthGuard, AuthenticatedUser } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import type { UserRole } from './decorators/roles.decorator';
import { FirebaseAdminService } from './firebase-admin.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Request() req: any) {
    const user: AuthenticatedUser = req.user;
    return {
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    };
  }

  @Post('set-role')
  @HttpCode(HttpStatus.OK)
  async setUserRole(
    @Body('uid') uid: string,
    @Body('role') role: UserRole,
    @Headers('x-api-key') apiKey?: string,
  ) {
    const expectedApiKey = process.env.SYNC_API_KEY || 'test-sync-key';
    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing x-api-key header for role management');
    }

    if (!uid || !role || !['FREE_USER', 'PRO_USER', 'ADMIN'].includes(role)) {
      throw new BadRequestException('Invalid payload. Require valid uid and role (FREE_USER, PRO_USER, ADMIN)');
    }

    try {
      await this.firebaseAdminService.getAuth().setCustomUserClaims(uid, { role });
      return {
        success: true,
        message: `Successfully assigned role '${role}' to user ${uid}`,
      };
    } catch (err: any) {
      throw new BadRequestException(`Failed to set custom claims: ${err.message}`);
    }
  }
}
