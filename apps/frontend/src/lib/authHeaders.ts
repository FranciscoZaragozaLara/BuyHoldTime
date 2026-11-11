import { auth } from '@/lib/firebase';

/**
 * Cabecera Authorization con un ID token fresco de Firebase (se renueva solo
 * cuando va a vencer). Devuelve {} si no hay sesión: el backend responderá 401.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Mensaje legible para errores HTTP de endpoints que requieren ADMIN. */
export function describeHttpError(status: number): string {
  if (status === 401) return 'Requiere iniciar sesión como administrador (HTTP 401)';
  if (status === 403) return 'Tu cuenta no tiene permisos de administrador (HTTP 403)';
  return `HTTP ${status}`;
}
