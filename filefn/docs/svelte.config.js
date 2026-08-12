import adapterAuto from "@sveltejs/adapter-auto";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const adapter = process.env.CLOUDFLARE_DOCS_DEPLOY === "1"
  ? adapterCloudflare()
  : adapterAuto();
const docsDeploy = process.env.CLOUDFLARE_DOCS_DEPLOY === "1";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
    appDir: docsDeploy ? "docs/_app" : "_app",
    paths: {
      assets: process.env.CLOUDFLARE_DOCS_ASSETS_ORIGIN ?? "",
    },
  },
};

export default config;
