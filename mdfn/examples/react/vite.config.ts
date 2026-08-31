import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mdfnExampleManualChunks } from "../vite.shared";

export default defineConfig({
  plugins: [react()],
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
