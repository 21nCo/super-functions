import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { resolve: false },
  sourcemap: true,
  clean: true,
  target: "es2021",
  minify: false,
  splitting: false,
  treeshake: true,
  outDir: "dist",
});
