import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/audit.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  treeshake: false,
  outDir: "dist",
});
