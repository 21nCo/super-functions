import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    placement: "src/placement-policy.ts",
  },
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
