import { test, expect } from '@playwright/test';
test('Regimes documentación tabla estilo markdown', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: 'Regimes' });
  await btn.click();
  await page.waitForTimeout(1500);
  await expect(page.getByText('Documentación de Regímenes')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Múltiplos Altos').first()).toBeVisible();
  await expect(page.getByText('Alta Deuda/PIB').first()).toBeVisible();
  await expect(page.getByText('Complacencia OAS').first()).toBeVisible();
  await expect(page.getByText('Qué Mide').first()).toBeVisible();
  await expect(page.getByText('Qué lo Detona').first()).toBeVisible();
  await expect(page.getByText('Tipo de Crisis Resultante').first()).toBeVisible();
  // Click para ver detalle
  await page.getByText('Múltiplos Altos').first().click();
  await page.waitForTimeout(500);
  await expect(page.getByText('CAPE / mean3Y').first()).toBeVisible();
  await page.getByText('Alta Deuda/PIB').first().click();
  await page.waitForTimeout(500);
  await expect(page.getByText('FINRA_DEBIT / GDP').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/regimes-docs.png', fullPage: true });
});
