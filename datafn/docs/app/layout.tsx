import "./global.css";
import "@21n/fonts/styles.css";
import { RootProvider } from "fumadocs-ui/provider";
import { DocsRootLayout } from "@superfunctions/docs-theme";
import type { Metadata } from "next";

let defaultSiteUrl = "https://datafn.dev";
if (process.env.NODE_ENV === "development") {
  defaultSiteUrl = "http://localhost:6001";
}
if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
  defaultSiteUrl = `https://${process.env.VERCEL_URL}`;
}
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DataFn Docs",
    template: "%s | DataFn Docs",
  },
  description:
    "Documentation for DataFn, the data processing and synchronization toolkit in Superfunctions.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "DataFn Docs",
    title: "DataFn Docs",
    description:
      "Documentation for DataFn, the data processing and synchronization toolkit in Superfunctions.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "DataFn Docs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DataFn Docs",
    description:
      "Documentation for DataFn, the data processing and synchronization toolkit in Superfunctions.",
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
