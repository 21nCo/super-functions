#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pages = [
  ["provider-readiness-matrix.md", "readiness", "Provider readiness matrix"],
  ["operations/release-gates.md", "release-gates", "Release gates"],
  ["client-sdk-boundary.md", "client-boundary", "Client SDK boundary"],
];
for (const [source, slug, title] of pages) {
  const sourcePath = `plugfn/docs/${source}`;
  const url = `https://github.com/21nCo/super-functions/blob/dev/${sourcePath}`;
  let body = readFileSync(resolve(root, sourcePath), "utf8").replace(/^# [^\n]+\n\n/, "");
  body = body.replace("This matrix is the public source of truth for provider readiness.", "The linked source matrix defines provider readiness.");
  body = body.replace(/\]\(([^\s)]+)\)/g, (match, href) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) return match;
    return `](https://github.com/21nCo/super-functions/blob/dev/${posix.normalize(posix.join(posix.dirname(sourcePath), href))})`;
  });
  const expected = `---\ntitle: ${title}\ndescription: Generated mirror of the release-gated PlugFn source guide.\n---\n\nThis page mirrors [${sourcePath}](${url}). Edit that source and run \`npm --workspace @plugfn/docs run generate:references\` to update this page.\n\n${body}`;
  const target = resolve(root, `plugfn/docs/content/docs/reference/${slug}.md`);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== expected) throw new Error(`${slug} reference is stale; run npm --workspace @plugfn/docs run generate:references`);
  } else writeFileSync(target, expected);
}
console.log(process.argv.includes("--check") ? "Reference mirrors are current" : "Updated reference mirrors");
