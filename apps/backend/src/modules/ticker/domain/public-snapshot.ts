// Qué parte del snapshot del GuruFocus Scrapper puede salir en la ficha pública de una acción.
//
// Solo el perfil y las principales posiciones de un ETF: son datos que el fondo reporta a la SEC (formulario N-PORT),
// públicos. Todo lo demás es cálculo o compilación de GuruFocus (GF Score, GF Value y su etiqueta de valuación,
// rankings, tablas de métricas, estimados de analistas) y queda solo para uso interno (GET /tickers/:symbol/snapshot,
// con sesión de admin o x-api-key) mientras no haya licencia. Ver docs/plan/data-licensing-strategy.md.

type Snapshot = { scrapeDate?: unknown; tables?: unknown } & Record<string, unknown>;

export function publicSnapshot(snapshot: Snapshot | null | undefined): { scrapeDate: unknown; tables: Record<string, unknown> } | null {
  const tables = snapshot?.tables && typeof snapshot.tables === 'object' ? (snapshot.tables as Record<string, unknown>) : null;
  if (!tables) return null;
  const pub: Record<string, unknown> = {};
  if (tables.etfProfile != null) pub.etfProfile = tables.etfProfile;
  if (tables.topHoldings != null) pub.topHoldings = tables.topHoldings;
  return Object.keys(pub).length ? { scrapeDate: snapshot!.scrapeDate ?? null, tables: pub } : null;
}
