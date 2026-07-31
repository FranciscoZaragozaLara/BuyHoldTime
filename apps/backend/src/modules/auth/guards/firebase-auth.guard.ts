import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase-admin.service';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  role: 'FREE_USER' | 'PRO_USER' | 'ADMIN';
  claims: Record<string, any>;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    try {
      const decodedToken = await this.firebaseAdminService.getAuth().verifyIdToken(token);
      
      let userRole = (decodedToken.role as 'FREE_USER' | 'PRO_USER' | 'ADMIN') || 'FREE_USER';

      if (decodedToken.email && decodedToken.email.toLowerCase() === 'zilph.zaragoza@gmail.com') {
        userRole = 'ADMIN';
      }


      request.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
        role: userRole,
        claims: decodedToken,
      } as AuthenticatedUser;

      return true;
    } catch (err: any) {
      this.logger.warn(`Firebase token verification failed: ${err.message}`);
      throw new UnauthorizedException(`Invalid authentication token: ${err.message}`);
    }
  }
}

