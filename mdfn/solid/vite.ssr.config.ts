import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  const cjs = mode === "ssr-cjs";
  return {
    plugins: [solid({ ssr: true })],
    build: {
      ssr: "src/index.tsx",
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        external: ["solid-js", "solid-js/web", "@mdfn/core", "@mdfn/dom", "@mdfn/source", "@mdfn/adapter-kit"],
        output: { format: cjs ? "cjs" : "es", entryFileNames: cjs ? "index.node.cjs" : "index.node.js" },
      },
    },
  };
});
