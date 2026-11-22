import * as fs from 'fs';
import * as path from 'path';
import { BACKTEST_DIR } from './backtest-dir';

/**
 * Intérprete para los scripts Python de BackTesting.
 * 1) PYTHON_BIN si está definido.
 * 2) En local (sin BACKTEST_DIR), el venv de BackTesting (Python 3.11): el `python3` de macOS es 3.9 y los scripts
 *    usan sintaxis ≥ 3.10, así que daily_update.py fallaba al importar y el cron diario no traía datos (p. ej. FINRA).
 * 3) `python3` del PATH (en Docker es /opt/venv, 3.11).
 */
export function resolvePythonBin(env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = fs.existsSync, dir = BACKTEST_DIR): string {
  if (env.PYTHON_BIN) return env.PYTHON_BIN;
  if (!env.BACKTEST_DIR) {
    const venv = path.join(dir, '.venv', 'bin', 'python');
    if (exists(venv)) return venv;
  }
  return 'python3';
}

export const PYTHON_BIN: string = resolvePythonBin();
