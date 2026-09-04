import path from "node:path";
import { svelte, vitePreprocess } from "@uifn/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte({
      // script:true so esbuild strips TS that Svelte 5's native stripper leaves
      // behind (e.g. `hash?: string` → `hash?`).
      preprocess: vitePreprocess({ script: true }),
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@uifn\/core\/primitives\/overlay$/,
        replacement: path.resolve(__dirname, "../../core/dist/primitives/overlay.mjs"),
      },
      {
        find: /^@uifn\/core\/primitives\/(.+)$/,
        replacement: path.resolve(__dirname, "../../core/dist/primitive-entries/$1.mjs"),
      },
      {
        find: /^@uifn\/core\/(.+)$/,
        replacement: path.resolve(__dirname, "../../core/src/$1.ts"),
      },
      {
        find: /^svelte$/,
        replacement: path.resolve(__dirname, "../../../node_modules/svelte/src/index-client.js"),
      },
      {
        find: "@uifn/svelte",
        replacement: path.resolve(__dirname, "../../svelte/lib/index.ts"),
      },
      {
        find: "@uifn/examples-shared",
        replacement: path.resolve(__dirname, "../shared/src/index.ts"),
      },
      {
        find: "@uifn/core",
        replacement: path.resolve(__dirname, "../../core/src/index.ts"),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 6112,
  },
  preview: {
    host: "127.0.0.1",
    port: 6112,
  },
});
