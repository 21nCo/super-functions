import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@uifn/registry/preset': path.resolve(__dirname, '../registry/src/preset/index.ts'),
    },
  },
  server: {
    port: 4177,
  },
});
