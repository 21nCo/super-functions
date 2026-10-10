import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["test/**/*.test.ts"],
  // Real Caddy fixtures share its fixed admin and listener ports across files.
  fileParallelism: process.env.DEVFN_REAL_PROXY !== "1" } });
