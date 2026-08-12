import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();
const isCloudflareDocsDeploy = process.env.CLOUDFLARE_DOCS_DEPLOY === "1";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  ...(isCloudflareDocsDeploy
    ? {
        output: "export",
        trailingSlash: true,
        assetPrefix: "/docs",
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default withMDX(config);
