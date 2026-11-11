import { test, expect } from '@playwright/test';

// Regresión: tras pulsar "Refresh Data & Indicators" y terminar la extracción,
// la fila actual, las cards y el termómetro deben releer los endpoints live SIN
// recargar la página. Antes, la caché react-query ['live'] (1h FRED / 5-30min
// mercado) seguía sirviendo valores viejos y solo un reload actualizaba.
test('live values refresh after sync without reload', async ({ page }) => {
  test.setTimeout(60000);
  const today = new Date().toISOString().slice(0, 10);
  let synced = false;
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (body: unknown, contentType = 'application/json') =>
      route.fulfill({ status: 200, contentType, body: JSON.stringify(body) });
    if (u.pathname === '/api/backtesting/market-data/live') {
      if (u.searchParams.get('ticker') === 'DGS30') {
        return json({ ticker: 'DGS30', close: synced ? 5.5 : 5.0, date: today, source: 'fred' });
      }
      return json({});
    }
    if (u.pathname === '/api/market-sync/daily/stream' && route.request().method() === 'POST') {
      synced = true;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"done"}\n\n' });
    }
    if (u.pathname === '/indicators' || u.pathname === '/api/backtesting/shiller-daily' || u.pathname === '/api/backtesting/market-data') {
      return json([]);
    }
    return route.abort();
  });

  await page.goto('/en/backtesting', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  // Valor live inicial en la card DGS30
  await expect(page.getByText('5.00%').first()).toBeVisible({ timeout: 15000 });
  // Extracción (mock responde done al instante) y la card debe actualizarse sola
  await page.getByRole('button', { name: 'Refresh Data & Indicators' }).click();
  await expect(page.getByText('5.50%').first()).toBeVisible({ timeout: 30000 });
});
