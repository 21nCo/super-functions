import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const docsRoot = resolve(process.cwd(), "content", "docs");
  if (
    !Array.isArray(slug) ||
    slug.length === 0 ||
    slug.some(
      (segment) =>
        typeof segment !== "string" ||
        segment.length === 0 ||
        segment.startsWith(".") ||
        segment.includes("/") ||
        segment.includes("\\") ||
        segment.includes("\0"),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = resolve(docsRoot, ...slug);
  const relativePath = relative(docsRoot, filePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    (!relativePath.endsWith(".md") && !relativePath.endsWith(".mdx"))
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const markdown = await readFile(filePath, "utf-8");
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
