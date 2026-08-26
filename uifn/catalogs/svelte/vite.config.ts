import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/uifn/components/dist/")) return "uifn-component-catalog";
          if (id.includes("/uifn/examples/shared/dist/catalog-presentation.js")) {
            return "uifn-catalog-presentation";
          }
        },
      },
    },
  },
  server: {
    fs: {
      allow: ["../../.."],
    },
  },
});
