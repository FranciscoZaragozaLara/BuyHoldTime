import 'dotenv/config';

/**
 * DATABASE_URL para los scripts de prisma/. Carga apps/backend/.env y falla con un error
 * claro si falta. Antes 31 scripts traían la URL con la contraseña de Postgres como valor
 * por defecto (`process.env.DATABASE_URL || 'postgresql://postgres:…'`), subida a git.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Define DATABASE_URL en apps/backend/.env (o en el entorno)');
  return url;
}
