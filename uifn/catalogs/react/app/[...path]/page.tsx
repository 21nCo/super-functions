import { catalogHooks, catalogPageTitle, workbenchRoutes } from "@uifn/examples-shared";
import type { Metadata } from "next";
import CatalogClient from "../catalog-client";

export const dynamicParams = false;

interface CatalogRoutePageProps {
  params: Promise<{ path: string[] }>;
}

export function generateStaticParams(): Array<{ path: string[] }> {
  return [
    ...workbenchRoutes.map((route) => route.path),
    "/hooks",
    ...catalogHooks.map((hook) => `/hooks/${hook.slug}`),
  ]
    .filter((routePath) => routePath !== "/")
    .map((routePath) => ({
      path: routePath.split("/").filter(Boolean),
    }));
}

export async function generateMetadata({ params }: CatalogRoutePageProps): Promise<Metadata> {
  const { path } = await params;
  const routePath = `/${path.join("/")}`;
  const route = workbenchRoutes.find((candidate) => candidate.path === routePath);
  const hook = catalogHooks.find((candidate) => `/hooks/${candidate.slug}` === routePath);
  const fallbackTitle = routePath === "/hooks"
    ? "Hooks"
    : hook?.displayName ?? route?.title ?? "Components";

  return {
    title: catalogPageTitle(routePath, fallbackTitle),
    description: "Actual uifn React components and behavior rendered through Next.js.",
  };
}

export default function CatalogRoutePage() {
  return <CatalogClient />;
}
