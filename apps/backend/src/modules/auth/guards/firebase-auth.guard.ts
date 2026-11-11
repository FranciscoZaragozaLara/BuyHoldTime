import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase-admin.service';
import { PrismaService } from '../../../prisma/prisma.service';

export type AppRole = 'FREE_USER' | 'PRO_USER' | 'ADMIN';
const VALID_ROLES: AppRole[] = ['FREE_USER', 'PRO_USER', 'ADMIN'];

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  role: AppRole;
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

    let decodedToken: Awaited<ReturnType<ReturnType<FirebaseAdminService['getAuth']>['verifyIdToken']>>;
    try {
      decodedToken = await this.firebaseAdminService.getAuth().verifyIdToken(token);
    } catch (err: any) {
      this.logger.warn(`Firebase token verification failed: ${err.message}`);
      throw new UnauthorizedException(`Invalid authentication token: ${err.message}`);
    }

    // La base de datos es la fuente de verdad del rol (la actualizan /auth/sync
    // y /admin/users/:id/role); el claim del token puede ir desfasado hasta 1 h.
    // Un usuario que aún no existe en BD (primer login, antes del sync) usa el claim.
    // Un fallo de BD se propaga como 500: no se degrada a un rol por defecto.
    const dbUser = await this.prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      select: { role: true },
    });
    const claimRole: AppRole = VALID_ROLES.includes(decodedToken.role) ? decodedToken.role : 'FREE_USER';
    const userRole: AppRole = (dbUser?.role as AppRole | undefined) ?? claimRole;

    request.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
      role: userRole,
      claims: decodedToken,
    } as AuthenticatedUser;

    return true;
  }
}
