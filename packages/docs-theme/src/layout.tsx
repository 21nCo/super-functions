import type { CSSProperties, ReactNode } from "react";

const DEFAULT_BODY_CLASS_NAME = "flex min-h-screen flex-col";
const DEFAULT_FONT_FAMILY =
  "Twenty One Native, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif";

export type DocsRootLayoutProps = {
  children: ReactNode;
  lang?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
};

export function DocsRootLayout({
  children,
  lang = "en",
  bodyClassName = DEFAULT_BODY_CLASS_NAME,
  bodyStyle,
}: DocsRootLayoutProps) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={bodyClassName}
        style={{ fontFamily: DEFAULT_FONT_FAMILY, ...bodyStyle }}
      >
        {children}
      </body>
    </html>
  );
}
