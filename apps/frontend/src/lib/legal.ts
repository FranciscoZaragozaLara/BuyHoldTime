/**
 * Datos del aviso legal. Jurisdicción y contacto son configurables (NEXT_PUBLIC_*) hasta
 * que se definan con asesoría legal; sin ellos la página usa una redacción neutra.
 * Cambiar LEGAL_UPDATED cada vez que cambie el texto de los términos (messages/*.json → Legal).
 */
export const LEGAL_UPDATED = '2026-11-12';

export function legalJurisdiction(): string | null {
  return process.env.NEXT_PUBLIC_LEGAL_JURISDICTION?.trim() || null;
}

export function legalContact(): string | null {
  return process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || null;
}

export const termsPath = (locale: string) => `/${locale}/terms`;
