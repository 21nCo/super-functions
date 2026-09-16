import { defineConfig } from 'tsup';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/http/index.ts',
    'src/mcp/index.ts',
    'src/storage/pg/index.ts'
  ],
  format: ['esm', 'cjs'],
  noExternal: ['@superfunctions/http'],
  esbuildOptions(options) {
    // The package root re-exports ESM observability with top-level await; MemoryFn only needs the sync router core.
    options.alias = {
      ...options.alias,
      '@superfunctions/http': resolve(packageDirectory, '../../packages/http/src/router.ts'),
    };
  },
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
