import { classifyTrend, liveTrend, trendAt, trendRegimeSeries } from './trend-regime';

describe('trend-regime', () => {
  test('las 4 combinaciones', () => {
    expect(classifyTrend(110, 100, 90)).toBe('UPTREND');
    expect(classifyTrend(95, 100, 90)).toBe('PULLBACK');
    expect(classifyTrend(95, 90, 100)).toBe('REBOUND');
    expect(classifyTrend(85, 90, 100)).toBe('DOWNTREND');
  });

  // 260 sesiones: sube 1/día hasta la 230 y luego cae 3/día.
  const dates = Array.from({ length: 260 }, (_, k) => new Date(Date.UTC(2020, 0, 1) + k * 86400000).toISOString().slice(0, 10));
  const px = dates.map((_, k) => (k <= 230 ? 100 + k : 330 - (k - 230) * 3));
  const series = trendRegimeSeries(new Map(dates.map((d, k) => [d, px[k]])));

  test('SMA 50/200 exactas desde la sesión 200', () => {
    expect(series.has(dates[198])).toBe(false);
    const p = series.get(dates[199])!;
    expect(p.sma200).toBeCloseTo(px.slice(0, 200).reduce((a, b) => a + b) / 200, 9);
    expect(p.sma50).toBeCloseTo(px.slice(150, 200).reduce((a, b) => a + b) / 50, 9);
    expect(p.regime).toBe('UPTREND');
  });

  test('la caída pasa por corrección y termina en tendencia bajista', () => {
    const regs = dates.slice(199).map((d) => series.get(d)!.regime);
    expect(regs[0]).toBe('UPTREND');
    expect(regs).toContain('PULLBACK');
    expect(regs[regs.length - 1]).toBe('DOWNTREND');
    // orden: nunca vuelve a alcista una vez que empezó a caer
    const firstPull = regs.indexOf('PULLBACK');
    expect(regs.slice(firstPull).includes('UPTREND')).toBe(false);
  });

  test('trendAt usa la última sesión anterior; liveTrend reemplaza el cierre de hoy', () => {
    const sorted = [...series.keys()];
    expect(trendAt(series, sorted, '2099-01-01')).toBe(series.get(sorted[sorted.length - 1]));
    expect(trendAt(series, sorted, '2000-01-01')).toBeNull();
    const closes = dates.map((d, k) => ({ date: d, close: px[k] }));
    const today = dates[230];
    const live = liveTrend(closes, today, 1000)!;
    expect(live.close).toBe(1000);
    expect(live.regime).toBe('UPTREND');
    expect(live.sma200).toBeCloseTo((px.slice(31, 230).reduce((a, b) => a + b) + 1000) / 200, 9);
    expect(liveTrend(closes.slice(0, 100), dates[100], 5)).toBeNull();
  });
});
