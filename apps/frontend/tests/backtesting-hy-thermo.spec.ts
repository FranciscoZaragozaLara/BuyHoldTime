import { test, expect } from '@playwright/test';

// HY OAS como bonus asimétrico Régimen 3 (fuera del promedio base): serie en
// declive (2a en 6.0 + 1a en 2.0, live 1.9) => complacencia reciente => +5 armado.
// La card es informativa (badge bonus, sin orbe de peso) y el detalle live
// muestra la fila HY Bonus sumando al puntaje final.
test('hy oas bonus armado shows badge and detail row', async ({ page }) => {
  test.setTimeout(60000);
  const today = new Date().toISOString().slice(0, 10);
  const hist: { date: string; close: number; volume: number }[] = [];
  const base = new Date('2022-01-01');
  for (let k = 0; k < 1090; k++) {
    const d = new Date(base); d.setDate(d.getDate() + k);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= today) break;
    hist.push({ date: iso, close: k < 700 ? 6.0 : 2.0, volume: 0 });
  }
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/backtesting/market-data/live') {
      if (u.searchParams.get('ticker') === 'BAMLH0A0HYM2') {
        return json({ ticker: 'BAMLH0A0HYM2', close: 1.9, date: today, source: 'fred' });
      }
      return json({});
    }
    if (u.pathname === '/api/backtesting/market-data') {
      if (u.searchParams.get('ticker') === 'BAMLH0A0HYM2') {
        return json(hist);
      }
      return json([]);
    }
    if (u.pathname === '/indicators' || u.pathname === '/api/backtesting/shiller-daily') {
      return json([]);
    }
    return route.abort();
  });

  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  const card = page.locator('div.border', { hasText: 'BAMLH0A0HYM2' });
  await expect(card.getByText('1.90%').first()).toBeVisible({ timeout: 15000 });
  await expect(card.getByText('bonus +5').first()).toBeVisible({ timeout: 15000 });
  await expect(card.getByText(/Régimen 3 armado/).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /detalle del c/i }).click();
  const row = page.locator('tr', { hasText: 'HY Bonus' });
  await expect(row.first()).toBeVisible({ timeout: 15000 });
  await expect(row.first()).toContainText('+5');
});
