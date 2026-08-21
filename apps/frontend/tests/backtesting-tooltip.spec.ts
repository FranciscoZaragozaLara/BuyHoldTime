import { test, expect } from '@playwright/test';

test('backtesting tooltip muestra $ y coma y fecha', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await expect(page.getByText('Backtesting — TQQQ / QQQ')).toBeVisible({ timeout: 10000 });
  // Esperar que la gráfica cargue (Equity Curves)
  await expect(page.getByText(/Equity Curves/)).toBeVisible({ timeout: 10000 });
  // El chart usa lightweight-charts con canvas
  const chart = page.locator('div').filter({ hasText: 'Equity Curves' }).locator('..').locator('canvas').first();
  // Si no hay canvas aún, usar el contenedor
  const target = await chart.count() ? chart : page.locator('div.w-full.h-\\[360px\\]').first();
  await expect(target).toBeVisible({ timeout: 10000 });
  // Hover en el centro del chart
  const box = await target.boundingBox();
  if (!box) throw new Error('no boundingBox for chart');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  // Mover un poco para disparar crosshair
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
  await page.waitForTimeout(800);
  const tooltip = page.getByTestId('bt-tooltip').first();
  // Si no aparece, intentar hover de nuevo
  if (!(await tooltip.isVisible().catch(()=>false))) {
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.waitForTimeout(800);
  }
  await expect(tooltip).toBeVisible({ timeout: 10000 });
  await expect(tooltip).toContainText('$');
  // Verificar coma como separador de miles: $140,718.00 o $1,911,247.00
  const text = await tooltip.textContent();
  console.log('tooltip text:', text);
  expect(text).toMatch(/\$\d{1,3}(,\d{3})*\.\d{2}/);
  // Verificar fecha tipo "10 feb" o "feb"
  expect(text).toMatch(/feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|Jan|Feb/i);
  // Screenshot para evidencia
  await page.screenshot({ path: 'test-results/backtesting-tooltip.png', fullPage: true });
});
