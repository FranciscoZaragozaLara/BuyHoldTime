import { test, expect } from '@playwright/test';
test('regimes equity chart línea visible con separador miles', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  // Ir a tab Regimes (en o es)
  const regimesTab = page.getByRole('tab', { name: /Regime/i }).first();
  const regimesBtn = page.getByRole('button', { name: /Regime/i }).first();
  const locator = await regimesTab.count() ? regimesTab : regimesBtn;
  // Fallback: buscar texto Regimes/Regímenes en toda la página
  const fallback = page.locator('text=Regimes, text=Regímenes').first();
  const target = await locator.count() ? locator : fallback;
  await expect(target).toBeVisible({ timeout: 15000 });
  await target.click();
  await page.waitForTimeout(1500);
  // Esperar header Equity
  await expect(page.getByText(/Equity —/)).toBeVisible({ timeout: 15000 });
  // Verificar pts con coma (SPY 8,443 o GSPC 17,485)
  await expect(page.getByText(/\d{1,3}(,\d{3})* pts/)).toBeVisible({ timeout: 8000 });
  // Verificar $ con coma en header o en card Final
  await expect(page.getByText(/\$\d{1,3}(,\d{3})+\.\d{2}/).first()).toBeVisible({ timeout: 8000 });
  // Canvas del chart
  const container = page.locator('div').filter({ hasText: 'Equity — SP500 Buy&Hold' }).first().locator('xpath=ancestor::div[contains(@class,"bg-slate-900")]').first();
  const canvas = container.locator('canvas').first();
  // Si no se encuentra por ancestor, buscar canvas global tras abrir Regimes
  const canvasAny = page.locator('canvas');
  const canvasCount = await canvasAny.count();
  console.log('canvas count', canvasCount);
  // Esperar que haya al menos 2 canvases (MarginGdp + Equity) o 1 si solo Regimes visible
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
  const box = await page.locator('canvas').first().boundingBox();
  console.log('box', box);
  if (!box) throw new Error('no bbox');
  // Hover para crosshair
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/regimes-equity.png', fullPage: true });
  // Verificar que el canvas tiene contenido no vacío (pixel check via evaluate)
  const hasPixels = await page.evaluate(() => {
    const c = document.querySelectorAll('canvas');
    for (const canvas of c) {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) continue;
      const { width, height } = canvas as HTMLCanvasElement;
      try {
        const data = ctx.getImageData(0,0, Math.min(100, width), Math.min(100, height)).data;
        let nonBg = 0;
        for (let i=0;i<data.length;i+=4) {
          const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
          // bg #020617 = 2,6,23
          if (!(r===2 && g===6 && b===23) && a>0) nonBg++;
          if (nonBg>10) return true;
        }
      } catch {}
    }
    return false;
  });
  console.log('hasPixels', hasPixels);
  expect(hasPixels).toBeTruthy();
});
