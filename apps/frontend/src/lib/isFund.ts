/**
 * ¿El ticker es un fondo (ETF / índice)? Un fondo no presenta 10-K ni reporta utilidades
 * propias: su EPS/P/E es el agregado de sus posiciones (serie mensual o trimestral sembrada).
 * Única definición para la página de precios (antes había tres variantes distintas).
 */
const KNOWN_FUNDS = new Set(['VOO', 'SPY', 'VTI', 'QQQ', 'TQQQ', 'SQQQ', 'SCHD', 'JEPQ', 'SMH', 'SOXX', 'SOXL', 'IBB', 'NLR']);

export function isFundTicker(t: { symbol?: string | null; sector?: string | null } | null | undefined): boolean {
  if (!t) return false;
  const s = String(t.sector ?? '').toLowerCase().trim();
  if (s === 'index' || s.startsWith('index ') || s === 'etf' || s.includes('etf') || s.includes('fund')) return true;
  return KNOWN_FUNDS.has(String(t.symbol ?? '').toUpperCase());
}
