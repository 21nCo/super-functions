import { defineConfig } from "vitest/config";

import { mcpfnCliVersionDefine } from "./version.config.js";

export default defineConfig({
  define: mcpfnCliVersionDefine,
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
