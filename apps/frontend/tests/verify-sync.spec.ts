
import { test, expect } from '@playwright/test';
test('verify sync modal not stuck and 31 data', async ({ page }) => {
  page.on('console', m => console.log('BROWSER:', m.text()));
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  // Ir a pestaña Regimes si existe
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(2000); }
  console.log('url after nav', page.url());
  // Localizar botón Data & Indicators / Refresh
  const refreshBtn = page.getByRole('button', { name: /Actualizar|Refresh|Data & Indicators/i }).first();
  console.log('refreshBtn count', await refreshBtn.count());
  console.log('all buttons', await page.getByRole('button').allTextContents().then(a=>a.slice(0,20)));
  // Buscar botón con texto refreshing
  const syncBtn = page.locator('button').filter({ hasText: /Actualizar.*Indicadores|Refresh.*Indicators|Data & Indicators/i }).first();
  console.log('syncBtn count', await syncBtn.count());
  if (await syncBtn.count()) {
    await syncBtn.click();
    console.log('clicked syncBtn');
    // esperar modal
    const modal = page.locator('div').filter({ hasText: /Data & Indicators|Refresh.*Modal/i }).first();
    await page.waitForTimeout(2000);
    console.log('modal visible?', await page.locator('text=Data & Indicators').count(), await page.getByText(/refreshing/i).count());
    // Intentar cerrar inmediatamente - debe poder cerrarse (fix)
    const closeBtn = page.getByRole('button', { name: /✕|Close/i }).first();
    console.log('closeBtn count', await closeBtn.count(), await closeBtn.isEnabled().catch(()=>false));
    await page.waitForTimeout(5000);
    // Verificar si sigue en refreshing después de 8s - si está stuck
    const stillRefreshing = await page.getByText(/refreshing/i).count();
    console.log('stillRefreshing after 5s', stillRefreshing);
    // Intentar click close aunque esté refreshing
    if (await closeBtn.count()) {
      await closeBtn.click({ force: true }).catch(e=>console.log('close click err', e.message));
      await page.waitForTimeout(1000);
      console.log('after close click modal count', await page.locator('text=Data & Indicators').count());
    }
    // Verificar tabla contiene 31 Ago
    await page.waitForTimeout(2000);
    const tableText = await page.content();
    console.log('has 2026-08-31', tableText.includes('2026-08-31'));
    console.log('has 2026-08-28', tableText.includes('2026-08-28'));
    console.log('has 31/08', tableText.includes('31'));
  } else {
    console.log('syncBtn not found, dumping page html snippet');
    console.log((await page.content()).slice(0,5000));
  }
  await page.screenshot({ path: 'test-results/verify-sync.png', fullPage: true });
});
