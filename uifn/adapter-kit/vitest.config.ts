import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@uifn\/core\/(.+)$/,
        replacement: resolve(__dirname, '../core/src/$1.ts'),
      },
      {
        find: /^@uifn\/core$/,
        replacement: resolve(__dirname, '../core/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
  },
});
