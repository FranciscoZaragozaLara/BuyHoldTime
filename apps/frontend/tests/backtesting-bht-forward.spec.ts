import { test, expect } from '@playwright/test';

// Tabla BHT Forward: tabs Daily/Monthly/Yearly, BHT + precios y forwards
// maduros; horizontes sin cumplir se pintan '—'.
test('bht forward table with tabs and matured returns', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/backtesting/market-data/live') return json({});
    if (u.pathname === '/api/backtesting/bht-forward') {
      return json([
        { date: '2023-01-03', bhtValue: 41.6, spx: 3795.0, ndx: 10583.0, tqqq: 17.5, spx1y: 23.0, spx2y: 45.1, spx3y: 60.2, spx5y: null, ndx1y: 40.0, ndx2y: null, ndx3y: null, ndx5y: null, tqqq1y: 120.0, tqqq2y: null, tqqq3y: null, tqqq5y: null },
        { date: '2023-01-04', bhtValue: 42.0, spx: 3800.0, ndx: 10600.0, tqqq: 17.6, spx1y: 22.9, spx2y: null, spx3y: null, spx5y: null, ndx1y: null, ndx2y: null, ndx3y: null, ndx5y: null, tqqq1y: null, tqqq2y: null, tqqq3y: null, tqqq5y: null },
      ]);
    }
    if (u.pathname === '/api/backtesting/bht-forward/detail') {
      return json({
        date: '2023-01-03', value: 53.0, numerator: 4516.0, denominator: 105, coverage: 11,
        bonus: 10, bonusLabel: 'G1 z +2.0σ',
        parts: [
          { key: 'CAPE', value: 28.5, score: 25, weight: 20, aporte: 4.5 },
          { key: 'Y2M', value: 4.68, score: 70.7, weight: 10, aporte: 6.4 },
        ],
      });
    }
    if (u.pathname === '/api/backtesting/shiller-daily') return json([]);
    if (u.pathname === '/indicators' || u.pathname === '/api/backtesting/market-data') return json([]);
    return route.abort();
  });

  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  await expect(page.getByText('BHT Forward — retornos 1/2/3/5Y maduros')).toBeVisible({ timeout: 15000 });
  // Tabs
  for (const tab of ['Daily', 'Monthly', 'Yearly']) {
    await expect(page.getByRole('button', { name: tab, exact: true }).first()).toBeVisible();
  }
  // Headers de forwards
  await expect(page.getByRole('columnheader', { name: /SPX 1Y/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /TQQQ 5Y/ })).toBeVisible();
  // Valor maduro y '—' sin madurar en la misma fila
  const tbl = page.locator('div', { hasText: 'BHT Forward — retornos' }).locator('..');
  await expect(tbl.getByText('▲ 23.0%').first()).toBeVisible();
  // Cambiar a Monthly conserva la tabla
  await page.getByRole('button', { name: 'Monthly', exact: true }).first().click();
  await expect(page.getByText('2023-01').first()).toBeVisible();
  // Volver a Daily y hover sobre BHT muestra el detalle por indicador
  await page.getByRole('button', { name: 'Daily', exact: true }).first().click();
  const bhtCell = page.locator('td', { hasText: '41.6' }).first();
  await bhtCell.hover();
  await expect(page.getByText('BHT 2023-01-03')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('cell', { name: 'CAPE' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CAPE - (Valuación 10a)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Y2M - (2Y Momentum)' })).toBeVisible();
  await expect(page.getByText('11/13').first()).toBeVisible();
  await expect(page.getByText(/Bonus HY - \(Régimen 3 G1/).first()).toBeVisible();
  await expect(page.getByText('+ 10 =').first()).toBeVisible();
});
