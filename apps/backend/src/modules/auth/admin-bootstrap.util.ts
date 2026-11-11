/**
 * Correo del primer administrador, tomado de BOOTSTRAP_ADMIN_EMAIL.
 * Solo se promueve a ADMIN (en /auth/sync) si el proveedor de identidad
 * confirma que el correo está verificado; sin verificación cualquiera
 * podría registrarse con ese correo y obtener el rol.
 * Si la variable no está definida, no hay promoción automática.
 */
export function isBootstrapAdmin(email?: string | null, emailVerified?: boolean): boolean {
  const configured = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured || !email) return false;
  return emailVerified === true && email.trim().toLowerCase() === configured;
}
