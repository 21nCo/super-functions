import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  cacheDir: "./.vite-vitest",
  test: {
    environment: "jsdom",
    globals: true,
    include: ["./tests/**/*.test.ts"],
  },
  resolve: {
    conditions: ["browser"],
  },
});
