import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@superfunctions/db': fileURLToPath(
        new URL('../../packages/db/src/index.ts', import.meta.url),
      ),
      '@superfunctions/http': fileURLToPath(
        new URL('../../packages/http/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
