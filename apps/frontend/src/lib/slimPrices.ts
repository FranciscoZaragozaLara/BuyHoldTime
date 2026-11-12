import type { HistoricalPrice } from '@/services/api';

/**
 * Precios diarios compactos para la página de detalle. La serie completa (desde 1997,
 * ~7,500 filas) viaja dentro del HTML hacia los componentes cliente; cada fila traía dos
 * UUID (id, tickerId), fecha ISO completa y 17 decimales (~290 B/fila, ~2.2 MB por página).
 *
 * - Quita id y tickerId (solo se usa id === 'temp-today', que no pasa por aquí).
 * - Fecha YYYY-MM-DD (new Date() da el mismo instante UTC y .split('T')[0] sigue igual).
 * - Precios con precisión completa: el simulador compone miles de rendimientos diarios y
 *   redondear (incluso a 8 cifras) movía centavos en los acumulados de largo plazo.
 */

export function slimPrice(p: HistoricalPrice): HistoricalPrice {
  return {
    date: String(p.date).slice(0, 10),
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adjClose: p.adjClose,
    volume: p.volume,
  };
}

export function slimPrices(prices: HistoricalPrice[]): HistoricalPrice[] {
  return prices.map(slimPrice);
}
