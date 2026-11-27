// Traducciones que el layout manda al navegador en todas las páginas. El namespace `Admin` (nombres internos de las
// fuentes de datos, procesos y scripts) solo va en /admin (app/[locale]/admin/layout.tsx); afuera solo queda el aviso de
// fuentes atrasadas del menú de usuario.
type Messages = Record<string, unknown>;

export function publicMessages(messages: Messages): Messages {
  const { Admin, ...rest } = messages;
  const freshness = (Admin as { freshness?: { menuStale?: unknown } } | undefined)?.freshness;
  return freshness?.menuStale !== undefined ? { ...rest, Admin: { freshness: { menuStale: freshness.menuStale } } } : rest;
}
