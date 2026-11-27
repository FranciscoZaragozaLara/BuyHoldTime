// Límite de peticiones por IP (@nestjs/throttler, guard global en AppModule).
//
// IP real del cliente: en producción la cadena es navegador → Traefik → Next (rewrite /backend) → backend. Traefik pone
// X-Forwarded-For con la IP del cliente (y descarta el que mande el cliente) y Next lo reenvía; con `trust proxy` en
// las redes privadas (TRUST_PROXY, main.ts) Express toma como req.ip la última dirección pública de la cadena.
//
// Sin límite: peticiones desde la red interna (render del servidor de Next, cron y scripts en la VPS, GuruFocus
// Scrapper) y las que traen una x-api-key válida. En desarrollo todo llega por loopback y por eso no se limita nada.
//
// Los contadores van por ruta e IP (la página de Indicadores pide ~36 series de market-data al cargar; el popover del
// BHT pide una fecha por cada movimiento del mouse), más un tope global por IP sobre todas las rutas.
import type { ExecutionContext } from '@nestjs/common';
import { Throttle, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { isValidApiKey } from '../modules/auth/api-key.util';

/** Proxies de confianza para Express (`app.set('trust proxy', …)`): loopback y redes privadas (Docker, Traefik). */
export const TRUST_PROXY = 'loopback, linklocal, uniquelocal';

const MIN = 60_000;

/** Límites por ruta e IP: `short` frena ráfagas, `long` el uso sostenido. */
export const RATE_LIMITS = {
  /** Cualquier ruta sin límite propio. */
  default: { short: { ttl: 10_000, limit: 120 }, long: { ttl: 10 * MIN, limit: 1200 } },
  /** Respuestas de varios MB (series completas desde 1990): shiller-daily, thermo-history, bht-forward, historia de una acción. */
  heavy: { short: { ttl: MIN, limit: 30 }, long: { ttl: 10 * MIN, limit: 120 } },
  /** Consulta a una fuente externa (Yahoo, FRED, CNN) si el ticker no está en caché: evita que nos bloqueen por abuso ajeno. */
  external: { short: { ttl: MIN, limit: 120 }, long: { ttl: 10 * MIN, limit: 600 } },
  /** Formularios públicos (suscripción por correo). */
  signup: { short: { ttl: MIN, limit: 3 }, long: { ttl: 60 * MIN, limit: 10 } },
} as const;

/** Tope por IP sumando todas las rutas. */
export const GLOBAL_LIMIT = { ttl: 10 * MIN, limit: 3000 } as const;

export const HeavyThrottle = () => Throttle(RATE_LIMITS.heavy);
export const ExternalThrottle = () => Throttle(RATE_LIMITS.external);
export const SignupThrottle = () => Throttle(RATE_LIMITS.signup);

function ipv4Octets(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/** ¿Dirección de loopback, enlace local o red privada (IPv4 o IPv6)? */
export function isInternalIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  let a = ip.trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4 mapeada en IPv6
  const o = ipv4Octets(a);
  if (o) {
    return o[0] === 127 || o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254);
  }
  if (!a.includes(':')) return false;
  if (a === '::1') return true;
  const first = parseInt(a.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 /* fc00::/7 */ || (first & 0xffc0) === 0xfe80; /* fe80::/10 */
}

/** Peticiones que no se limitan: red interna o clave de servicio válida. */
export function skipRateLimit(req: { ip?: string; headers?: Record<string, unknown> }): boolean {
  return isInternalIp(req?.ip) || isValidApiKey(req?.headers?.['x-api-key']);
}

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'short', ...RATE_LIMITS.default.short },
    { name: 'long', ...RATE_LIMITS.default.long },
    // Misma clave para todas las rutas: solo la IP.
    { name: 'global', ...GLOBAL_LIMIT, generateKey: (_ctx: ExecutionContext, tracker: string) => `global-${tracker}` },
  ],
  skipIf: (ctx: ExecutionContext) => skipRateLimit(ctx.switchToHttp().getRequest()),
  errorMessage: 'Demasiadas peticiones; intenta de nuevo en unos minutos.',
};
