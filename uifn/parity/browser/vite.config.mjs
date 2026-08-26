import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';

export default {
  plugins: [svelte(), solid({ hot: false })],
  resolve: {
    conditions: ['solid', 'svelte', 'browser', 'import'],
  },
  optimizeDeps: {
    exclude: ['@uifn/svelte'],
  },
  ssr: {
    noExternal: ['@uifn/svelte'],
  },
};
