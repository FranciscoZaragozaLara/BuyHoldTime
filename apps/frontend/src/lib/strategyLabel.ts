/**
 * Etiqueta pública de una estrategia. Los códigos internos (p. ej.
 * SCHILLER_TQQQ_3A_RISK_D_V8_ZILPH) solo los ve el administrador; el resto ve el nombre.
 */
export function strategyLabel(s: { code: string; name?: string | null }, isAdmin: boolean): string {
  if (isAdmin) return s.code;
  const name = (s.name ?? '').trim();
  return name || s.code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
