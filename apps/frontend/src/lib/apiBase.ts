/**
 * Base URL del backend NestJS.
 *
 * - Navegador: ruta relativa `/backend`, que Next.js reenvía al backend
 *   (ver `rewrites` en next.config.ts). Mismo origen => sin CORS, funciona
 *   desde LAN/HTTPS sin exponer el puerto 4000.
 * - Servidor (SSR/ISR/route handlers): URL absoluta interna, porque fetch en
 *   Node no resuelve rutas relativas.
 */
export const BACKEND_PREFIX = '/backend';

export function getBackendInternalUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000'
  );
}

export function getApiBase(): string {
  if (typeof window !== 'undefined') return BACKEND_PREFIX;
  return getBackendInternalUrl();
}
