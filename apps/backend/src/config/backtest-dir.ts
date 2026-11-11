import * as path from 'path';

/**
 * Carpeta con los scripts Python de backtesting y sus archivos result_*.json.
 * En Docker se define con BACKTEST_DIR (volumen montado). En local, por defecto es la
 * carpeta hermana del repo: <AgyApps>/BackTesting.
 */
export const BACKTEST_DIR: string =
  process.env.BACKTEST_DIR || path.resolve(process.cwd(), '..', '..', '..', 'BackTesting');
