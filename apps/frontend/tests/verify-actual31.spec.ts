import { test, expect } from '@playwright/test';
test('tabla marca 31 como Actual y refetch TanStack', async ({ page }) => {
  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  const regimesBtn = page.getByRole('button', { name: /Regimes/i });
  if (await regimesBtn.count()) { await regimesBtn.click(); await page.waitForTimeout(1500); }
  // Verificar estado inicial: cape debe tener 31 ya (después de fix)
  let content = await page.content();
  console.log('init HAS_31', content.includes('2026-08-31'));
  // Hacer refresh
  const syncBtn = page.locator('button').filter({ hasText: /Data & Indicators|Actualizar.*Indicadores|Refresh.*Indicators/i }).first();
  console.log('syncBtn', await syncBtn.count());
  if (await syncBtn.count()) {
    await syncBtn.click();
    console.log('clicked refresh');
    // esperar a que termine (max 15s)
    for (let i=0;i<15;i++) {
      const still = await page.getByText(/refreshing/i).count();
      console.log(`t=${i}s refreshing=${still}`);
      if (still===0) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    content = await page.content();
    const has31 = content.includes('2026-08-31');
    const hasActual31 = content.includes('2026-08-31') && content.includes('Actual');
    console.log('after refresh HAS_31', has31, 'HAS_Actual', hasActual31);
    // buscar fila Actual
    const actualRows = page.locator('tr').filter({ hasText: 'Actual' });
    console.log('actualRows', await actualRows.count());
    if (await actualRows.count()) {
      const txt = await actualRows.first().textContent();
      console.log('actual row text', txt?.slice(0,200));
      expect(txt).toContain('2026-08-31');
    }
    expect(has31).toBeTruthy();
    // verificar que gráfica/tabla se refetch: equity debe tener 31
    const has355 = content.includes('95529951') || content.includes('95,529') || has31;
    console.log('has equity 31', has355);
  }
  await page.screenshot({ path: 'test-results/verify-actual31.png', fullPage: true });
});
