import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [
        svelte({
            configFile: false,
            preprocess: vitePreprocess(),
            // Exercise the supported legacy constructor API with the Svelte 5 compiler.
            compilerOptions: { compatibility: { componentApi: 4 } },
        }),
    ],
    resolve: { conditions: ["browser"] },
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.ts"],
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
    },
});
