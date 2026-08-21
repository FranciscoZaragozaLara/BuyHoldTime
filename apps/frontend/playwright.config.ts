import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  webServer: {
    command: 'PORT=3002 pnpm dev',
    url: 'http://localhost:3002/en/backtesting',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  use: { baseURL: 'http://localhost:3002', trace: 'on-first-retry' },
});
