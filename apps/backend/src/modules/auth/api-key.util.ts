import { Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

const logger = new Logger('ApiKey');
const MIN_KEY_LENGTH = 16;
let warned = false;

/**
 * Clave de servicio (cron, scripts Python) para endpoints de escritura.
 * Sin valor por defecto: si SYNC_API_KEY falta o es corta, ninguna clave
 * es válida (fail closed) y el acceso solo es posible con sesión ADMIN.
 */
function configuredKey(): string | null {
  const key = process.env.SYNC_API_KEY?.trim();
  if (!key || key.length < MIN_KEY_LENGTH) {
    if (!warned) {
      warned = true;
      logger.warn(
        `SYNC_API_KEY no está definida o tiene menos de ${MIN_KEY_LENGTH} caracteres: ` +
          'el acceso por x-api-key queda deshabilitado (solo sesión ADMIN).',
      );
    }
    return null;
  }
  return key;
}

export function isValidApiKey(provided: unknown): boolean {
  const expected = configuredKey();
  if (!expected || typeof provided !== 'string' || provided.length === 0) return false;
  // Se comparan hashes de igual longitud para evitar fugas por tiempo.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
