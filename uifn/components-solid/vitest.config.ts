import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['solid', 'browser'],
  },
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: [/@uifn\/solid/],
      },
    },
  },
});
