import { tmpdir } from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  outputDir: path.join(tmpdir(), `mcpfn-playwright-${process.pid}`),
  reporter: "line",
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
  },
});
