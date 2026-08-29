import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { mdfnExampleManualChunks } from "../vite.shared";

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser", "development"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: mdfnExampleManualChunks,
      },
    },
  },
  server: { host: "127.0.0.1" },
});
