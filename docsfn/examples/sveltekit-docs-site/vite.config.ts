import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { sourceAliases } from "./source-aliases.mjs";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: sourceAliases,
  },
});
