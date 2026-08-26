import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "node:path";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@uifn\/solid\/hooks\/copy-to-clipboard$/,
        replacement: path.resolve(__dirname, "../../solid/src/hooks/copy-to-clipboard.ts"),
      },
      {
        find: /^@uifn\/solid\/hooks\/media-query$/,
        replacement: path.resolve(__dirname, "../../solid/src/hooks/media-query.ts"),
      },
      {
        find: /^@uifn\/solid\/(.+)$/,
        replacement: path.resolve(__dirname, "../../solid/src/generated/$1.tsx"),
      },
      { find: /^@uifn\/solid$/, replacement: path.resolve(__dirname, "../../solid/src/index.ts") },
      { find: /^@uifn\/core\/utils$/, replacement: path.resolve(__dirname, "../../core/src/utils/index.ts") },
      {
        find: /^@uifn\/core\/primitives\/overlay$/,
        replacement: path.resolve(__dirname, "../../core/dist/primitives/overlay.mjs"),
      },
      {
        find: /^@uifn\/core\/primitives\/(.+)$/,
        replacement: path.resolve(__dirname, "../../core/dist/primitive-entries/$1.mjs"),
      },
      { find: /^@uifn\/core\/(.+)$/, replacement: path.resolve(__dirname, "../../core/src/$1.ts") },
      { find: /^@uifn\/core$/, replacement: path.resolve(__dirname, "../../core/src/index.ts") },
      {
        find: /^@uifn\/components-solid\/(.+)$/,
        replacement: path.resolve(__dirname, "../../components-solid/src/generated/$1.ts"),
      },
      { find: /^@uifn\/components-solid$/, replacement: path.resolve(__dirname, "../../components-solid/src/index.ts") },
      {
        find: /^@uifn\/components\/styles\.css$/,
        replacement: path.resolve(__dirname, "../../components/styles.css"),
      },
      { find: /^@uifn\/components$/, replacement: path.resolve(__dirname, "../../components/src/index.ts") },
      { find: /^@uifn\/examples-shared$/, replacement: path.resolve(__dirname, "../shared/src/index.ts") },
      { find: /^@uifn\/patterns$/, replacement: path.resolve(__dirname, "../../patterns/src/index.ts") },
      { find: /^@uifn\/sf$/, replacement: path.resolve(__dirname, "../../sf/src/index.ts") },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("/examples/shared/src/component-demo.ts") ||
            id.includes("/components/src/generated/catalog.ts")
            ? "component-demo-data"
            : undefined;
        },
      },
    },
  },
  server: { host: "127.0.0.1", port: 6114 },
  preview: { host: "127.0.0.1", port: 6114 },
});
