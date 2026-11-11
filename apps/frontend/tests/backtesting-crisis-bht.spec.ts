import { test, expect } from '@playwright/test';

// Tabla de crisis: badges BHT en pico/suelo con hover compartido
// (detalle por indicador + forwards 1Y/2Y/3Y/5Y de SPX/NDX/TQQQ).
test('crisis table shows BHT badges with forward hover', async ({ page }) => {
  test.setTimeout(60000);
  const fwdByDate: Record<string, any> = {
    '2007-10-09': { date: '2007-10-09', bhtValue: 68.2, spx1y: -38.5, spx2y: -25.1, spx3y: -10.2, spx5y: 5.5, ndx1y: -40.0, ndx2y: -20.0, ndx3y: -5.0, ndx5y: 15.0, tqqq1y: null, tqqq2y: null, tqqq3y: null, tqqq5y: null },
    '2009-03-09': { date: '2009-03-09', bhtValue: 36.1, spx1y: 68.6, spx2y: 90.1, spx3y: 110.4, spx5y: 178.9, ndx1y: 85.0, ndx2y: 120.0, ndx3y: 150.0, ndx5y: 220.0, tqqq1y: null, tqqq2y: null, tqqq3y: null, tqqq5y: null },
  };
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/backtesting/market-data/live') return json({});
    if (u.pathname === '/api/backtesting/bht-forward') {
      const to = u.searchParams.get('to') || '';
      const row = fwdByDate[to];
      return json(row ? [row] : []);
    }
    if (u.pathname === '/api/backtesting/bht-forward/detail') {
      const d = u.searchParams.get('date') || '';
      const row = fwdByDate[d];
      if (!row) return json({ error: 'not found' });
      return json({
        date: d, value: row.bhtValue, numerator: 7000.0, denominator: 105, coverage: 10,
        parts: [{ key: 'CAPE', value: 28.5, score: 25, weight: 20, aporte: 4.5 }],
      });
    }
    if (u.pathname === '/api/backtesting/shiller-daily') return json([]);
    if (u.pathname === '/indicators' || u.pathname === '/api/backtesting/market-data') return json([]);
    return route.abort();
  });

  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  await expect(page.getByText('Grandes crisis 1990→hoy')).toBeVisible({ timeout: 15000 });
  // Badges BHT bajo las fechas de pico y suelo
  await expect(page.getByText('BHT 68.2').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('BHT 36.1').first()).toBeVisible();
  // Hover sobre el badge: detalle + sección de forwards
  await page.getByText('BHT 36.1').first().hover();
  await expect(page.getByText('BHT 2009-03-09')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Si comprabas ese día')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SPX', exact: true })).toBeVisible();
  await expect(page.getByText('▲ 68.6%').first()).toBeVisible();
});
