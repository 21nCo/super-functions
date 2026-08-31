import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  ssr: { noExternal: [/^@uifn\//, /^@mdfn\/svelte$/] },
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      external: ["@mdfn/core", "@mdfn/components", "@mdfn/source", "@mdfn/dom", "@mdfn/adapter-kit", "svelte"],
      output: { entryFileNames: "index.node.js" },
    },
  },
});
