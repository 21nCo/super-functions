import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/errors.ts",
    "src/controller.ts",
    "src/environment.ts",
    "src/parts.ts",
    "src/algorithms/*.ts",
    "src/primitives/index.ts",
    "src/primitives/overlay.ts",
    "src/utils/id.ts",
    "src/utils/index.ts",
    "src/aria/*.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  // Multi-entry concurrent chunk assignment was not byte-deterministic across identical builds.
  // Independent entry bundles trade a small amount of duplication for reproducible packages.
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  define: {
    __UIFN_DEV_TRACE__: "false",
  },
});
