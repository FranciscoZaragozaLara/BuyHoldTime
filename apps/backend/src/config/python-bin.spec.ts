import { resolvePythonBin } from './python-bin';

describe('resolvePythonBin', () => {
  it('PYTHON_BIN manda', () => expect(resolvePythonBin({ PYTHON_BIN: '/x/py' }, () => true, '/bt')).toBe('/x/py'));
  it('en local usa el venv de BackTesting si existe', () => expect(resolvePythonBin({}, () => true, '/bt')).toBe('/bt/.venv/bin/python'));
  it('sin venv, python3', () => expect(resolvePythonBin({}, () => false, '/bt')).toBe('python3'));
  it('en Docker (BACKTEST_DIR definido) siempre python3', () => expect(resolvePythonBin({ BACKTEST_DIR: '/opt/backtesting' }, () => true, '/opt/backtesting')).toBe('python3'));
});
