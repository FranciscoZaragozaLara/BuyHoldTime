import { Controller, Get, Post, Body, UseGuards, Request, Headers, UnauthorizedException, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { FirebaseAuthGuard, AuthenticatedUser } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import type { UserRole } from './decorators/roles.decorator';
import { FirebaseAdminService } from './firebase-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Request() req: any) {
    const user: AuthenticatedUser = req.user;
    const dbUser = await this.prisma.user.findUnique({
      where: { firebaseUid: user.uid },
    });

    return {
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: dbUser ? dbUser.role : user.role,
      dbUser,
    };
  }

  @Post('sync')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncUser(
    @Request() req: any,
    @Body('firstName') firstName?: string,
    @Body('lastName') lastName?: string,
  ) {
    const user: AuthenticatedUser = req.user;
    if (!user.email) {
      throw new BadRequestException('User email is missing in Firebase Auth token');
    }

    let assignedRole: Role = Role.FREE_USER;

    // Bootstrap primer usuario Admin para zilph.zaragoza@gmail.com
    if (user.email.toLowerCase() === 'zilph.zaragoza@gmail.com') {
      assignedRole = Role.ADMIN;
    }

    // Comprobar si ya existe en la base de datos
    let dbUser = await this.prisma.user.findUnique({
      where: { firebaseUid: user.uid },
    });

    if (!dbUser) {
      // Extraer nombres si no vienen explícitamente en el body
      let parsedFirstName = firstName;
      let parsedLastName = lastName;
      if (!parsedFirstName && user.name) {
        const parts = user.name.split(' ');
        parsedFirstName = parts[0];
        parsedLastName = parts.slice(1).join(' ') || undefined;
      }

      dbUser = await this.prisma.user.create({
        data: {
          firebaseUid: user.uid,
          email: user.email.toLowerCase(),
          firstName: parsedFirstName,
          lastName: parsedLastName,
          role: assignedRole,
        },
      });

      if (assignedRole === Role.ADMIN) {
        try {
          await this.firebaseAdminService.getAuth().setCustomUserClaims(user.uid, { role: 'ADMIN' });
        } catch (err: any) {
          console.error('Error setting custom claims for initial admin:', err.message);
        }
      }
    } else if (user.email.toLowerCase() === 'zilph.zaragoza@gmail.com' && dbUser.role !== Role.ADMIN) {
      dbUser = await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { role: Role.ADMIN },
      });
      try {
        await this.firebaseAdminService.getAuth().setCustomUserClaims(user.uid, { role: 'ADMIN' });
      } catch (err: any) {
        console.error('Error setting custom claims for initial admin:', err.message);
      }
    }

    return {
      success: true,
      user: dbUser,
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
      await this.prisma.user.updateMany({
        where: { firebaseUid: uid },
        data: { role: role as Role },
      });
      return {
        success: true,
        message: `Successfully assigned role '${role}' to user ${uid}`,
      };
    } catch (err: any) {
      throw new BadRequestException(`Failed to set custom claims: ${err.message}`);
    }
  }
}

