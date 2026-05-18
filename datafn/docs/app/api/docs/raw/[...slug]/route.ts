import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return listMarkdownFiles(resolve(process.cwd(), "content", "docs")).map((slug) => ({
    slug,
  }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const docsRoot = resolve(process.cwd(), "content", "docs");
  if (!Array.isArray(slug) || slug.length === 0 || slug.some((segment) => segment === "..")) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = resolve(docsRoot, ...slug);
  const relativePath = relative(docsRoot, filePath);
  if (relativePath.startsWith("..")) {
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

function listMarkdownFiles(root: string, current = root): string[][] {
  return readdirSync(current).flatMap((entry) => {
    const entryPath = resolve(current, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return listMarkdownFiles(root, entryPath);
    }

    if (!stats.isFile() || !/\.(md|mdx)$/.test(entry)) {
      return [];
    }

    return [relative(root, entryPath).split("/")];
  });
}
