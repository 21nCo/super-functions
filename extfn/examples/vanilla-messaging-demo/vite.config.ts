import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { extfnVite } from '@superfunctions/extfn-vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@superfunctions/extfn/runtime': resolve(
        root,
        '../../core/src/runtime/getRuntime.ts'
      ),
    },
  },
  plugins: [...extfnVite()],
});
