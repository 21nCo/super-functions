import adapterAuto from "@sveltejs/adapter-auto";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const adapter = process.env.CLOUDFLARE_DOCS_DEPLOY === "1"
  ? adapterCloudflare()
  : adapterAuto();
const docsDeploy = process.env.CLOUDFLARE_DOCS_DEPLOY === "1";
const assetsOrigin = process.env.CLOUDFLARE_DOCS_ASSETS_ORIGIN ?? "";
if (assetsOrigin !== "") {
  if (!/^https?:\/\//.test(assetsOrigin)) throw new Error("Docs assets require an HTTP(S) URL");
  new URL(assetsOrigin);
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // script:true so esbuild strips TS that Svelte 5's native stripper leaves
  // behind in published @docsfn/svelte sources (e.g. `activePath?: string` → `activePath?`).
  preprocess: vitePreprocess({ script: true }),
  kit: {
    adapter,
    appDir: docsDeploy ? "docs/_app" : "_app",
    paths: {
      assets: /** @type {'' | `http://${string}` | `https://${string}`} */ (assetsOrigin),
    },
  },
};

export default config;
