import type { Metadata } from "next";
import "../../../examples/react-workbench/src/styles.css";

export const metadata: Metadata = {
  title: {
    default: "Components – uifn React",
    template: "%s – uifn React",
  },
  description: "Actual uifn React components and behavior rendered through Next.js.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
