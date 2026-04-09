import "./global.css";
import "@21n/fonts/styles.css";
import { RootProvider } from "fumadocs-ui/provider";
import { DocsRootLayout } from "@superfunctions/docs-theme";
import type { Metadata } from "next";

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:6003");

const siteUrl = rawSiteUrl.match(/^https?:\/\//i)
  ? rawSiteUrl
  : `https://${rawSiteUrl}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HostFn Docs",
    template: "%s | HostFn Docs",
  },
  description:
    "Documentation for HostFn, deployment and server management tooling in Superfunctions.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "HostFn Docs",
    title: "HostFn Docs",
    description:
      "Documentation for HostFn, deployment and server management tooling in Superfunctions.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "HostFn Docs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HostFn Docs",
    description:
      "Documentation for HostFn, deployment and server management tooling in Superfunctions.",
    images: ["/opengraph-image"],
  },
};

type DocsRootLayoutProps = Parameters<typeof DocsRootLayout>[0];
type RootProviderProps = Parameters<typeof RootProvider>[0];

export default function Layout({ children }: { children: DocsRootLayoutProps["children"] }) {
  return (
    <DocsRootLayout>
      <RootProvider>{children as RootProviderProps["children"]}</RootProvider>
    </DocsRootLayout>
  );
}
