import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests unitarios de funciones puras (src/**/*.test.ts). Los e2e de Playwright viven en tests/.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
