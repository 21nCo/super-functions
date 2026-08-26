import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __UIFN_DEV_TRACE__: "true",
  },
  test: {
    environment: "node",
  },
});
