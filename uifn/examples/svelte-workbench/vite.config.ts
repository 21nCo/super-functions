import path from "node:path";
import { svelte, vitePreprocess } from "@uifn/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte({
      // script:true so esbuild strips TS that Svelte 5's native stripper leaves
      // behind (e.g. `basePath?: string` → `basePath?`).
      preprocess: vitePreprocess({ script: true }),
    }),
  ],
  resolve: {
    alias: [
      { find: /^svelte$/, replacement: path.resolve(__dirname, "../../../node_modules/svelte/src/index-client.js") },
      {
        find: /^@uifn\/svelte\/hooks\/copy-to-clipboard$/,
        replacement: path.resolve(__dirname, "../../svelte/lib/hooks/copy-to-clipboard.ts"),
      },
      {
        find: /^@uifn\/svelte\/hooks\/media-query$/,
        replacement: path.resolve(__dirname, "../../svelte/lib/hooks/media-query.ts"),
      },
      {
        find: /^@uifn\/svelte\/(.+)$/,
        replacement: path.resolve(__dirname, "../../svelte/lib/generated/$1/index.ts"),
      },
      { find: /^@uifn\/svelte$/, replacement: path.resolve(__dirname, "../../svelte/lib/index.ts") },
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
        find: /^@uifn\/components-svelte\/(.+)$/,
        replacement: path.resolve(__dirname, "../../components-svelte/src/generated/$1/index.ts"),
      },
      { find: /^@uifn\/components-svelte$/, replacement: path.resolve(__dirname, "../../components-svelte/src/index.ts") },
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
  server: { host: "127.0.0.1", port: 6112 },
  preview: { host: "127.0.0.1", port: 6112 },
});
