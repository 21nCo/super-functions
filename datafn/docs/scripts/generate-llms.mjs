#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = join(ROOT, "content", "docs");
const PUBLIC_DIR = join(ROOT, "public");

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datafn.21n.co";

const HEADER = `# DataFn Documentation

> Self-hosted data sync SDK with offline-first storage, reactive signals, capability-driven schemas, and a structured query language (DFQL). Works with TypeScript, Python, and Swift.

This document is intended for large language models and agentic developer tools. It contains an outline of the DataFn documentation with deep-links to each page; for the full content see \`llms-full.txt\`.

`;

const FULL_HEADER = `# DataFn Documentation (Full)

> Self-hosted data sync SDK with offline-first storage, reactive signals, capability-driven schemas, and a structured query language (DFQL). Works with TypeScript, Python, and Swift.

This document contains the full content of the DataFn documentation, optimized for LLM consumption.

`;

async function walkMarkdown(dir, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      pages.push(...(await walkMarkdown(fullPath, relPath)));
      continue;
    }

    if (!/\.mdx?$/.test(entry.name)) continue;
    pages.push({ fullPath, relPath });
  }

  return pages;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };

  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: raw };

  const fmText = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n+/, "");

  const frontmatter = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[m[1]] = value;
  }

  return { frontmatter, body };
}

function relPathToUrlPath(relPath) {
  let p = relPath.replace(/\.mdx?$/, "");
  p = p.replace(/\/index$/, "");
  return p;
}

function slugTitle(slug) {
  return slug
    .split("/")
    .pop()
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectionOf(urlPath) {
  const parts = urlPath.split("/");
  if (parts.length <= 1) return "Top Level";
  return parts[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const files = await walkMarkdown(CONTENT_DIR);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const pages = [];
  for (const { fullPath, relPath } of files) {
    if (relPath.endsWith("meta.json")) continue;
    const raw = await readFile(fullPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const urlPath = relPathToUrlPath(relPath);
    const title = frontmatter.title || slugTitle(urlPath || "index");
    const description = frontmatter.description || "";
    const docUrl = `${SITE_URL}/docs${urlPath ? "/" + urlPath : ""}`;

    pages.push({
      relPath,
      urlPath,
      title,
      description,
      body,
      section: sectionOf(urlPath),
      docUrl,
    });
  }

  await mkdir(PUBLIC_DIR, { recursive: true });

  const sections = new Map();
  for (const page of pages) {
    if (!sections.has(page.section)) sections.set(page.section, []);
    sections.get(page.section).push(page);
  }

  let llms = HEADER;
  for (const [section, sectionPages] of sections) {
    llms += `## ${section}\n\n`;
    for (const page of sectionPages) {
      llms += `- [${page.title}](${page.docUrl})`;
      if (page.description) llms += `: ${page.description}`;
      llms += "\n";
    }
    llms += "\n";
  }

  await writeFile(join(PUBLIC_DIR, "llms.txt"), llms, "utf-8");

  let llmsFull = FULL_HEADER;
  for (const [section, sectionPages] of sections) {
    llmsFull += `\n${"=".repeat(80)}\n## ${section}\n${"=".repeat(80)}\n\n`;
    for (const page of sectionPages) {
      llmsFull += `\n${"-".repeat(80)}\n### ${page.title}\n\nURL: ${page.docUrl}\n`;
      if (page.description) llmsFull += `Description: ${page.description}\n`;
      llmsFull += `${"-".repeat(80)}\n\n${page.body}\n\n`;
    }
  }

  await writeFile(join(PUBLIC_DIR, "llms-full.txt"), llmsFull, "utf-8");

  console.log(
    `Generated llms.txt (${(llms.length / 1024).toFixed(1)}KB) and llms-full.txt (${(llmsFull.length / 1024).toFixed(1)}KB) for ${pages.length} pages.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
