import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser", "development"] },
  ssr: { noExternal: ["svelte"] },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 10_000,
    environment: "jsdom",
  },
});
