import type { Metadata } from "next";
import CatalogClient from "./catalog-client";

export const metadata: Metadata = {
  title: {
    absolute: "Components – uifn React",
  },
};

export default function Page() {
  return <CatalogClient />;
}
