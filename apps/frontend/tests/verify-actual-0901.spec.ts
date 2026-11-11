import { test, expect } from '@playwright/test';
test('tabla marca 01 Sep como Actual tras fix', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(1500); }
  let content = await page.content();
  console.log('init HAS_0901', content.includes('2026-09-01'));
  console.log('init HAS_0831', content.includes('2026-08-31'));
  // verificar que cape ya tiene 01
  const actualRows = page.locator('tr').filter({ hasText: 'Actual' });
  console.log('actualRows', await actualRows.count());
  if (await actualRows.count()) {
    const txt = await actualRows.first().textContent();
    console.log('actual row', txt?.slice(0,300));
    expect(txt).toContain('2026-09-01');
  }
  expect(content.includes('2026-09-01')).toBeTruthy();
  await page.screenshot({ path: 'test-results/verify-actual-0901.png', fullPage: true });
});
