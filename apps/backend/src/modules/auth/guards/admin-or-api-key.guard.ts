import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { isValidApiKey } from '../api-key.util';

/**
 * Permite el acceso con:
 *  - header `x-api-key` válido (procesos de servicio: scripts, cron), o
 *  - sesión Firebase (Bearer) con rol ADMIN (botones del frontend).
 * Si llega x-api-key y es inválida se rechaza sin probar la sesión.
 */
@Injectable()
export class AdminOrApiKeyGuard implements CanActivate {
  constructor(private readonly firebaseAuthGuard: FirebaseAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (apiKey !== undefined) {
      if (isValidApiKey(apiKey)) return true;
      throw new UnauthorizedException('Invalid x-api-key');
    }

    await this.firebaseAuthGuard.canActivate(context); // lanza 401 si no hay token válido
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Se requiere rol ADMIN');
    }
    return true;
  }
}
