import { resolve } from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [svelte({ preprocess: vitePreprocess({ script: true }) })],
  resolve: { conditions: ["browser"], alias: [
    { find: "@uifn/svelte", replacement: resolve(__dirname, "../../uifn/svelte/lib/generated/tabs/index.ts") },
  ] },
  test: { environment: "jsdom", include: ["src/ApiReferenceRenderer.integration.ts"], testTimeout: 15000 },
});
