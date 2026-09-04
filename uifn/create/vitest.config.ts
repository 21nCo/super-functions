import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: {
      '@uifn/registry/preset': path.resolve(__dirname, '../registry/src/preset/index.ts'),
    },
  },
});
