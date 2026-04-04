import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: 'localhost',
    port: 4015,
    strictPort: true
  },
  preview: {
    host: 'localhost',
    port: 4015,
    strictPort: true
  }
});
