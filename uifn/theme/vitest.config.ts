import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@uifn/tokens': resolve(__dirname, '../tokens/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
