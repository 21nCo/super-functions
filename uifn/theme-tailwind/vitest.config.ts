import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@uifn/recipes': resolve(__dirname, '../recipes/src/index.ts'),
      '@uifn/theme': resolve(__dirname, '../theme/src/index.ts'),
      '@uifn/tokens': resolve(__dirname, '../tokens/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
