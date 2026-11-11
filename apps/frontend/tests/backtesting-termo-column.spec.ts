import { test, expect } from '@playwright/test';

// Columna Termo en la tabla CAPE: pinta el valor del historial guardado en BD
// (con tooltip Σ÷denominador) y soporta ordenamiento.
test('termo column shows stored history values', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/backtesting/market-data/live') return json({});
    if (u.pathname === '/api/backtesting/thermo-history') {
      return json([
        { date: '2026-10-28', value: 56.5, numerator: 7908.5, denominator: 140, coverage: 14 },
        { date: '2026-10-27', value: 58.4, numerator: 7592.0, denominator: 130, coverage: 13 },
      ]);
    }
    if (u.pathname === '/api/backtesting/shiller-daily') {
      return json([
        { date: '2026-10-28', cape: 41.44, mean3y: 36.5, capeRatio: 1.136 },
        { date: '2026-10-27', cape: 41.2, mean3y: 36.5, capeRatio: 1.129 },
      ]);
    }
    if (u.pathname === '/api/backtesting/bht-forward/detail') {
      return json({
        date: '2026-10-28', value: 56.5, numerator: 7908.5, denominator: 140, coverage: 14,
        parts: [{ key: 'CAPE', value: 41.44, score: 84, weight: 20, aporte: 12.0 }],
      });
    }
    if (u.pathname === '/indicators' || u.pathname === '/api/backtesting/market-data') return json([]);
    return route.abort();
  });

  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  const head = page.getByRole('columnheader', { name: /BHT Index/ });
  await expect(head).toBeVisible({ timeout: 15000 });
  // Antes de Perf 1Y
  const heads = await page.getByRole('columnheader').allInnerTexts();
  expect(heads.findIndex((t) => t.includes('BHT Index'))).toBeLessThan(heads.findIndex((t) => t.includes('Perf 1Y')));
  await expect(page.getByText('56.5').first()).toBeVisible();
  await expect(page.getByText('58.4').first()).toBeVisible();
  // Hover sobre BHT Index usa el popover compartido con el detalle por indicador
  await page.locator('td', { hasText: '56.5' }).first().hover();
  await expect(page.getByText('BHT 2026-10-28')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('cell', { name: 'CAPE - (Valuación 10a)' })).toBeVisible();
});
