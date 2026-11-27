// Nombre de la fuente que sale en las respuestas públicas del API: solo las públicas y gratuitas (FRED). Las
// cotizaciones de proveedores comerciales y los índices propietarios salen como 'live' (dato del día) mientras no haya
// licencia para nombrarlos; internamente se sigue usando la fuente real (caché, respaldo de la BD).
export function publicSource(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (/^fred$/i.test(s)) return 'FRED';
  if (s === 'db-fallback' || s === 'none') return s;
  return 'live';
}
