import { test, expect } from '@playwright/test';
test('refresh auto termina sin quedarse en refreshing', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(1500); }
  const syncBtn = page.locator('button').filter({ hasText: /Data & Indicators|Actualizar.*Indicadores|Refresh.*Indicators/i }).first();
  console.log('syncBtn', await syncBtn.count());
  await syncBtn.click();
  await page.waitForTimeout(1500);
  // esperar hasta 25s a que desaparezca refreshing
  const start = Date.now();
  let done = false;
  for (let i=0;i<25;i++) {
    const still = await page.getByText(/refreshing/i).count();
    const progress = await page.locator('text=/progress|success/i').count().catch(()=>0);
    console.log(`t=${Math.round((Date.now()-start)/1000)}s refreshing=${still} progress_visible=${await page.locator('table tbody tr').count()}`);
    if (still===0) { done=true; break; }
    await page.waitForTimeout(1000);
  }
  console.log('auto done?', done, 'elapsed', Math.round((Date.now()-start)/1000));
  // debe haber terminado solo
  expect(done).toBeTruthy();
  // tabla debe tener 31
  const content = await page.content();
  console.log('HAS_31', content.includes('2026-08-31'));
  await page.screenshot({ path: 'test-results/verify-sync-auto.png', fullPage: true });
});
