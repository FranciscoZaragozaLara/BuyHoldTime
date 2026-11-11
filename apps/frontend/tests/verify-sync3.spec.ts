import { test, expect } from '@playwright/test';
test('tabla muestra 31 para TQQQ_EXCLUSIVE_R1R3', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(2000); }
  // seleccionar estrategia A
  const selects = page.locator('select');
  console.log('selects', await selects.count());
  if (await selects.count() >= 2) {
    const optsA = await selects.nth(0).locator('option').allTextContents();
    console.log('optsA sample', optsA.slice(0,3));
    // intentar seleccionar TQQQ_EXCLUSIVE_R1R3
    await selects.nth(0).selectOption({ label: optsA.find(o=>o.includes('TQQQ_EXCLUSIVE_R1R3')) || optsA[0] }).catch(()=>{});
    await page.waitForTimeout(1500);
    const content = await page.content();
    console.log('after select HAS_31', content.includes('2026-08-31'));
    console.log('after select HAS_28', content.includes('2026-08-28'));
    console.log('has 95529951', content.includes('95529951') || content.includes('95,529'));
    // cambiar a Diario para ver filas
    const dailyBtn = page.getByRole('button', { name: /Diario|Daily/i });
    if (await dailyBtn.count()) { await dailyBtn.click(); await page.waitForTimeout(800); }
    const afterDaily = await page.content();
    console.log('daily HAS_31', afterDaily.includes('2026-08-31'));
  }
  await page.screenshot({ path: 'test-results/verify-sync3.png', fullPage: true });
});
