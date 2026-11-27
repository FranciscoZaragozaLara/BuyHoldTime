// Nombre de la fuente que sale en las respuestas públicas del API: las públicas (FRED) y las que se citan con
// atribución (CNN, índice Fear & Greed). Las cotizaciones de proveedores comerciales salen como 'live' (dato del día);
// internamente se sigue usando la fuente real (caché, respaldo de la BD).
export function publicSource(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (/^fred$/i.test(s)) return 'FRED';
  if (/^cnn$/i.test(s)) return 'CNN';
  if (s === 'db-fallback' || s === 'none') return s;
  return 'live';
}
