import { timingSafeEqual } from 'crypto';

// Invalidación bajo demanda de la caché de datos de Next (home, /indicators) cuando el backend termina
// una sincronización de mercado. Los fetch de services/api.ts llevan la etiqueta MARKET_DATA_TAG.
export const MARKET_DATA_TAG = 'market-data';
export const REVALIDATABLE_TAGS = [MARKET_DATA_TAG] as const;

/** ¿El header coincide con el secreto? Sin secreto configurado nunca autoriza. Comparación en tiempo constante. */
export function isAuthorizedRevalidate(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Etiquetas pedidas que se permiten invalidar (por defecto, todas). */
export function requestedTags(body: unknown): string[] {
  const tags = (body as { tags?: unknown } | null)?.tags;
  const list = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [...REVALIDATABLE_TAGS];
  return list.filter((t) => (REVALIDATABLE_TAGS as readonly string[]).includes(t));
}
