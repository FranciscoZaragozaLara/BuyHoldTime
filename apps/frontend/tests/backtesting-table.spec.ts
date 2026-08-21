import { test, expect } from '@playwright/test';
test('performance table con tabs anual mensual diario', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await expect(page.getByText(/Performance/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Anual|Annual/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mensual|Monthly/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Diario|Daily/ })).toBeVisible();
  // Anual por defecto: debe mostrar años como 2026, 2025
  await expect(page.getByText('2026').first()).toBeVisible({ timeout: 5000 });
  // Valores con $ y coma
  await expect(page.getByText(/\$\d{1,3}(,\d{3})*\.\d{2}/).first()).toBeVisible();
  // Cambiar a Mensual
  await page.getByRole('button', { name: /Mensual|Monthly/ }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText(/Ene|Feb|Mar|Abr|May|Jun|Jan|Feb|Mar/).first()).toBeVisible({ timeout: 5000 });
  // Cambiar a Diario
  await page.getByRole('button', { name: /Diario|Daily/ }).click();
  await page.waitForTimeout(500);
  // Debe mostrar fecha diaria tipo "ago" y tabla con $ 
  await expect(page.locator('table').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/backtesting-table.png', fullPage: true });
});
