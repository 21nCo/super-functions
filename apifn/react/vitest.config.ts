import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vitest/config";

const requireFromPackage = createRequire(import.meta.url);
const requireFromRenderer = createRequire(requireFromPackage.resolve("@testing-library/react"));

export default defineConfig({
    // Use the renderer's installed peers in both workspace and isolated gates.
    resolve: {
        alias: {
            react: path.dirname(requireFromRenderer.resolve("react/package.json")),
            "react-dom": path.dirname(requireFromRenderer.resolve("react-dom/package.json")),
        },
    },
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.tsx"],
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
    },
});
