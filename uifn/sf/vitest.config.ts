import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@uifn/patterns': new URL('../patterns/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
