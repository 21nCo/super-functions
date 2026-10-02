#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pages = [
  ["core", "Core package", "Encryption, scanner, schema, and shared contracts."],
  ["runtime", "Runtime package", "Read-only runtime client and environment materialization."],
  ["server", "Server package", "Control plane, runtime API, migration, and storage contract."],
];
for (const [slug, title, description] of pages) {
  const body = readFileSync(resolve(site, `../${slug}/README.md`), "utf8").replace(/^# [^\r\n]+\r?\n\r?\n/, "");
  const expected = `---\ntitle: ${title}\ndescription: ${description}\n---\n\n${body}`;
  const target = resolve(site, `content/docs/reference/${slug}.md`);
  if (process.argv.includes("--check")) {
    let actual;
    try { actual = readFileSync(target, "utf8"); } catch { /* Missing mirrors are stale too. */ }
    if (actual !== expected) throw new Error(`${slug} reference is stale; run npm run generate:references --workspace @secfn/docs`);
  } else writeFileSync(target, expected);
}
console.log(process.argv.includes("--check") ? "Reference mirrors are current" : "Updated reference mirrors");
