import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser", "development"] },
  ssr: { noExternal: ["svelte"] },
  test: { include: ["tests/**/*.test.ts"], environment: "jsdom", passWithNoTests: false },
});
