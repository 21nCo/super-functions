import { defineConfig } from "tsup";

const shared = {
  dts: true,
  sourcemap: true,
  target: "es2021" as const,
  minify: false,
  splitting: false,
  treeshake: true,
  outDir: "dist"
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    clean: false
  },
  {
    ...shared,
    entry: ["src/testing.ts"],
    format: ["esm"],
    external: ["vitest"],
    clean: false
  }
]);
