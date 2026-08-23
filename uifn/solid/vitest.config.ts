import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['solid', 'browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    exclude: ['src/__tests__/phase-13-solid-ssr.test.tsx'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
