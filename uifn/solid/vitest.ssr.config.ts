import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid({ ssr: true })],
  resolve: {
    conditions: ['solid'],
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/phase-13-solid-ssr.test.tsx'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
