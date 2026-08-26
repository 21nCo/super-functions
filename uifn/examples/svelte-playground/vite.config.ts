import path from "node:path";
import { svelte, vitePreprocess } from "@uifn/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    svelte({
      preprocess: vitePreprocess(),
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@uifn\/core\/(.*)$/,
        replacement: `${path.resolve(__dirname, "../../core/src")}/$1`,
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
