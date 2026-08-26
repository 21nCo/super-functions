import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "200.html",
      precompress: true,
      strict: false,
    }),
    paths: {
      base: "/components/svelte",
      relative: false,
    },
  },
};

export default config;
