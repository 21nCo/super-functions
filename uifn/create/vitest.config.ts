import { defineConfig } from 'vitest/config';
import { aliases } from './aliases';

export default defineConfig({
  define: { __UIFN_DEV_TRACE__: 'false' },
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'node',
    // These integration tests compile the public component graph on demand.
    // CI spent 16s transforming it; avoid competing workers and 5s cold-start
    // timeouts that leave React act scopes running into subsequent tests.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
