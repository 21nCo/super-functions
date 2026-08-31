import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
export default defineConfig({ plugins: [solid()], build: { lib: { entry: "src/index.tsx", formats: ["es", "cjs"], fileName: (format) => format === "es" ? "index.js" : "index.cjs" }, rollupOptions: { external: ["solid-js", "solid-js/web", "@mdfn/core", "@mdfn/solid", "@mdfn/components", "@uifn/components-solid"] } } });
