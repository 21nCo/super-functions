import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // Proxy storage URLs too if they are absolute but lack protocol in some cases,
      // but we use absolute http://localhost:3000/... which should work if CORS is on.
      // Our server enables CORS.
    },
  },
});
