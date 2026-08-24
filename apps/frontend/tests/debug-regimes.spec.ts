import { test, expect } from '@playwright/test';
test('debug regimes html', async ({ page }) => {
  page.on('console', m => console.log('BROWSER:', m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('url', page.url());
  const html1 = await page.content();
  console.log('has Regimes tab', html1.includes('Regimes'));
  console.log('has canvas before click', (html1.match(/<canvas/g)||[]).length);
  const btn = page.getByRole('button', { name: 'Regimes' });
  console.log('has selector before', (await page.locator('select').count()));
  console.log('btn count', await btn.count());
  await btn.click();
  await page.waitForTimeout(4000);
  console.log('after click select count', await page.locator('select').count());
  console.log('select options', await page.locator('select option').allTextContents().then(a=>a.slice(0,5)).catch(()=>[]));
  const html2 = await page.content();
  console.log('after click has Equity', html2.includes('Equity — SP500'));
  console.log('after click canvas count html', (html2.match(/<canvas/g)||[]).length);
  console.log('after click snippet', html2.slice(html2.indexOf('Equity — SP500')-500, html2.indexOf('Equity — SP500')+1500).slice(0,2000));
  const canvas = page.locator('canvas');
  console.log('playwright canvas count', await canvas.count());
  for (let i=0;i<await canvas.count();i++) {
    const box = await canvas.nth(i).boundingBox();
    console.log('canvas', i, 'box', box);
  }
  await page.screenshot({ path: 'test-results/debug-regimes.png', fullPage: true });
  console.log('screenshot done');
});
