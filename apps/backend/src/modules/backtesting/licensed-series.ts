// Series de terceros con licencia restrictiva: el API no las sirve al público, solo a la red interna (render de Next,
// scripts de backtest en la VPS o en la Mac contra localhost) o con x-api-key. Ver docs/plan/data-licensing-strategy.md.
//   - BAMLH0A0HYM2 / BAMLH0A0HYM2EY: índices de ICE vía FRED (FRED prohíbe reproducirlos sin permiso de ICE).
//   - SPX_FWD_EPS / NDX_PE / NDX_FWD_PE: estimados de Birinyi publicados por WSJ (y Yardeni en la historia del EPS).
// En la UI el crédito se muestra con la serie del modelo (HY_MODEL = 1.913477 × BAA10Y) y el P/E estimado por bandas.
import { skipRateLimit } from '../../config/rate-limit';

export const HY_MODEL = 'HY_MODEL';
export const LICENSED_SERIES = new Set(['BAMLH0A0HYM2', 'BAMLH0A0HYM2EY', 'SPX_FWD_EPS', 'NDX_PE', 'NDX_FWD_PE']);

/** ¿La petición puede recibir esta serie? Las de licencia solo internas o con clave de servicio. */
export function canServeSeries(ticker: string | undefined, req: { ip?: string; headers?: Record<string, unknown> }): boolean {
  return !LICENSED_SERIES.has(String(ticker ?? '').trim()) || skipRateLimit(req);
}
