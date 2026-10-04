import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
    resolve: { conditions: ["browser"] },
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.ts"],
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
    },
});
