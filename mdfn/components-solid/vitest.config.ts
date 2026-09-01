import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: { include: ["src/**/*.test.tsx"], environment: "jsdom", passWithNoTests: false, setupFiles: ["./vitest-no-jest-dom.ts"] },
});
