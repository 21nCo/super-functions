import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/types.ts"],
  format: ["cjs", "esm"],
  external: ["@apifn/collections"],
  dts: true,
  clean: true,
  sourcemap: true,
});
