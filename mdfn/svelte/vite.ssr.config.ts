import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      external: ["@mdfn/core", "@mdfn/dom", "@mdfn/source", "@mdfn/adapter-kit", "svelte"],
      output: { entryFileNames: "index.node.js" },
    },
  },
});
