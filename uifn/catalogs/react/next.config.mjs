/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/components/react",
  trailingSlash: true,
  transpilePackages: [
    "@uifn/components",
    "@uifn/examples-shared",
    "@uifn/patterns",
    "@uifn/sf"
  ],
};

export default nextConfig;
