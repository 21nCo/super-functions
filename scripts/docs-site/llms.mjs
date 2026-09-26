/** Keep LLM indexes navigable before a public documentation host is assigned. */
export function withSourceLinks(text, manifest, product, canonicalUrl) {
  if (canonicalUrl) return text;
  const sources = new Map(Object.values(manifest.pages)
    .filter((page) => page.id.startsWith("docs:"))
    .map((page) => [page.path, page.id.slice("docs:".length)]));
  return text.replace(/\]\((\/docs[^\s)]*)\)/g, (match, href) => {
    const url = new URL(href, "https://docs.invalid");
    const source = sources.get(url.pathname);
    if (!source) return match;
    const path = source.split("/").map(encodeURIComponent).join("/");
    return `](https://github.com/21nCo/super-functions/blob/dev/${product}/docs/content/docs/${path}${url.hash})`;
  });
}
