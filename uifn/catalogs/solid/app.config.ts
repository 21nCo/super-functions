import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  ssr: false,
  server: {
    baseURL: "/components/solid",
    preset: "static",
    compatibilityDate: "2026-07-16",
  },
  vite: {
    build: {
      modulePreload: {
        resolveDependencies: (_filename, dependencies) => dependencies.map((dependency) => {
          const normalized = dependency.replace(/^\/+/, "");
          return normalized.startsWith("_build/")
            ? normalized.slice("_build/".length)
            : normalized;
        }),
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/uifn/components/dist/")) return "uifn-component-catalog";
            if (id.includes("/uifn/examples/shared/dist/catalog-presentation.js")) {
              return "uifn-catalog-presentation";
            }
          },
        },
      },
    },
    server: {
      fs: {
        allow: ["../../.."],
      },
    },
  },
});
