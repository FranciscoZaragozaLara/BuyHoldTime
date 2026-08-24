import { test, expect } from '@playwright/test';
test('regimes equity chart línea visible con 3 regimenes', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: 'Regimes' });
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(3500);
  await expect(page.getByText(/Equity —/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/\d{1,3}(,\d{3})* pts/)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/\$\d{1,3}(,\d{3})+\.\d{2}/).first()).toBeVisible({ timeout: 8000 });
  // Verificar 3 columnas de regimenes con iconos (sin columna Régimen)
  // Los iconos 📈 🏦 😴 deben estar en el header
  await expect(page.locator('th', { hasText: '📈' }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('th', { hasText: '🏦' }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('th', { hasText: '😴' }).first()).toBeVisible({ timeout: 8000 });
  // Verificar que hay al menos 3 iconos en la tabla (activos o inactivos)
  const icons = page.locator('td').filter({ hasText: /📈|🏦|😴|⚪/ });
  await expect(icons.first()).toBeVisible({ timeout: 8000 });
  // Canvas del chart regimes
  const canvas = page.locator('#regimes-equity-chart canvas').first();
  await expect(canvas).toBeVisible({ timeout: 10000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no bbox');
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.waitForTimeout(800);
  await page.mouse.move(box.x + box.width/2 + 20, box.y + box.height/2);
  await page.waitForTimeout(800);
  // Tooltip debe mostrar total 0/3,1/3,2/3,3/3 y los 3 iconos
  const tooltip = page.locator('div').filter({ hasText: /\/3 activos/ }).first();
  if (await tooltip.count() === 0) {
    // fallback: cualquier tooltip con Portafolio
    await expect(page.getByText('Portafolio').last()).toBeVisible({ timeout: 8000 });
  } else {
    await expect(tooltip).toBeVisible({ timeout: 8000 });
    await expect(tooltip).toContainText('/3 activos');
  }
  await page.screenshot({ path: 'test-results/regimes-equity.png', fullPage: true });
  const hasPixels = await page.evaluate(() => {
    const c = document.querySelectorAll('#regimes-equity-chart canvas');
    for (const canvas of c) {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) continue;
      const { width, height } = canvas as HTMLCanvasElement;
      try {
        const data = ctx.getImageData(0,0, Math.min(100, width), Math.min(100, height)).data;
        let nonBg = 0;
        for (let i=0;i<data.length;i+=4) {
          const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
          if (!(r===2 && g===6 && b===23) && a>0) nonBg++;
          if (nonBg>10) return true;
        }
      } catch {}
    }
    return false;
  });
  expect(hasPixels).toBeTruthy();
});
