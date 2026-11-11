import { test, expect } from '@playwright/test';
test('modal cerrable y datos 31', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(1500); }
  // buscar tabla con 31
  await page.waitForTimeout(2000);
  const content = await page.content();
  console.log('HAS_2026-08-31', content.includes('2026-08-31'));
  console.log('HAS_2026-08-28', content.includes('2026-08-28'));
  // abrir modal Data & Indicators
  const syncBtn = page.locator('button').filter({ hasText: /Data & Indicators|Actualizar|Refresh/i }).first();
  console.log('syncBtn', await syncBtn.count());
  if (await syncBtn.count()) {
    await syncBtn.click();
    await page.waitForTimeout(1200);
    const modalClose = page.getByRole('button', { name: /Close|Cerrar/i }).first();
    console.log('modalClose enabled', await modalClose.isEnabled().catch(()=>false), await modalClose.count());
    // intentar cerrar estando en refreshing - debe ser posible ahora
    await modalClose.click({ force: true }).catch(e=>console.log(e.message));
    await page.waitForTimeout(800);
    console.log('after close still refreshing?', await page.getByText(/refreshing/i).count());
  }
  await page.screenshot({ path: 'test-results/verify-sync2.png', fullPage: true });
});
