import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/audit.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  treeshake: false,
  outDir: "dist",
});
