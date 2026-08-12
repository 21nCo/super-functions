import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { extfnVite } from '@extfn/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'extfn/runtime': resolve(
        root,
        '../../core/src/runtime/getRuntime.ts'
      ),
    },
  },
  plugins: [svelte(), ...extfnVite()],
});
