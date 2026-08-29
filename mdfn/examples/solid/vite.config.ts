import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { mdfnExampleManualChunks } from "../vite.shared";

export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["browser", "development"], dedupe: ["solid-js", "solid-js/web"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: mdfnExampleManualChunks,
      },
    },
  },
  server: { host: "127.0.0.1" },
});
