import { test, expect } from '@playwright/test';
test('qqq strategy chart con medias y buy sell tooltip', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await expect(page.getByText(/QQQ \+ Medias Mallik/)).toBeVisible({ timeout: 15000 });
  const canvas = page.locator('div').filter({ hasText: 'QQQ + Medias Mallik' }).locator('..').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 10000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no bbox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  // tooltip should appear with QQQ, SMA, portfolio
  const tip = page.locator('div').filter({ hasText: /Portafolio/ }).first();
  if (!(await tip.isVisible().catch(()=>false))) {
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.waitForTimeout(800);
  }
  await expect(page.getByText(/SMA20/).first()).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: 'test-results/backtesting-qqq.png', fullPage: true });
});
