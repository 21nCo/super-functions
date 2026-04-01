import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@superfunctions/cli': path.resolve(
        __dirname,
        '../../packages/cli/src/index.ts'
      ),
      '@superfunctions/extfn': path.resolve(
        __dirname,
        '../core/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
