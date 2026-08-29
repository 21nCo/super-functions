import { notFound } from "next/navigation";
import { EmbeddedPage as ReactEmbeddedPage } from "@docsfn/react/EmbeddedPage";
import { loadDocsSiteSource } from "@/source.config";

type EmbeddedPageParams = {
  slug?: string[];
};

export async function generateStaticParams() {
  const source = await loadDocsSiteSource();
  return Object.values(source.manifest.embedded?.pages ?? {})
    .map((entry) => {
      const suffix = entry.pageRoute
        .replace(source.manifest.embedded?.pageRoutePrefix ?? "/docs/embedded/page", "")
        .replace(/^\/+/, "");
      const segments = suffix.length > 0 ? suffix.split("/") : [];
      return {
        slug: segments,
      };
    })
    .sort((left, right) => left.slug.join("/").localeCompare(right.slug.join("/")));
}

export default async function EmbeddedPage(props: {
  params: Promise<EmbeddedPageParams>;
}) {
  const params = await props.params;
  const source = await loadDocsSiteSource();
  const requestedSlug = (params.slug ?? []).join("/");
  const normalizedSlug = requestedSlug.length > 0 ? requestedSlug : "index";

  const page = Object.values(source.manifest.pages).find((candidate) => {
    const candidateSlug = candidate.slug.length > 0 ? candidate.slug : "index";
    return candidateSlug === normalizedSlug;
  });
  if (!page) {
    notFound();
  }

  return (
    <section data-docsfn-proof-surface="embedded">
      <ReactEmbeddedPage
        page={page}
        compatPreset={source.compatPreset}
      />
    </section>
  );
}
