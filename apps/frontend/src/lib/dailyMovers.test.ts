import { describe, expect, it } from 'vitest';
import { dailyMovers } from './dailyMovers';

const t = (symbol: string, changePercent: number | null, sector = 'Technology') => ({ symbol, sector, changePercent });

describe('dailyMovers', () => {
  it('3 mayores alzas y 3 mayores caídas, sin fondos ni valores inválidos', () => {
    const list = [t('A', 5), t('B', 1), t('C', 3), t('D', 0.5), t('E', -4), t('F', -1), t('G', -2), t('H', -0.1), t('TQQQ', 9, 'ETF'), t('SPY', -6), t('X', null), t('Z', 0)];
    const { gainers, losers } = dailyMovers(list);
    expect(gainers.map((x) => x.symbol)).toEqual(['A', 'C', 'B']);
    expect(losers.map((x) => x.symbol)).toEqual(['E', 'G', 'F']);
  });
  it('si hay menos movimientos devuelve los que haya', () => {
    expect(dailyMovers([t('A', 1), t('B', -1)])).toEqual({ gainers: [t('A', 1)], losers: [t('B', -1)] });
  });
});
