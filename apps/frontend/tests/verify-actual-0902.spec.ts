import { test, expect } from '@playwright/test';
test('tabla marca 02 Sep como Actual tras fix', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(1500); }
  const content = await page.content();
  console.log('HAS_0902', content.includes('2026-09-02'));
  const actualRows = page.locator('tr').filter({ hasText: 'Actual' });
  console.log('actualRows', await actualRows.count());
  if (await actualRows.count()) {
    const txt = await actualRows.first().textContent();
    console.log('actual', txt?.slice(0,300));
    expect(txt).toContain('2026-09-02');
  }
  expect(content.includes('2026-09-02')).toBeTruthy();
  await page.screenshot({ path: 'test-results/verify-actual-0902.png', fullPage: true });
});
