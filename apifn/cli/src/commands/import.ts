import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { openAPIToCollection, readCollection, writeCollection } from "@apifn/collections";
import type { CollectionItem } from "@apifn/collections";
import { parseOpenAPI } from "@apifn/core";
import type { Output } from "../utils/output.js";

export interface ImportOpenApiCommandOptions {
  source: string;
  outputDir: string;
  baseUrl?: string;
  env?: string;
  groupBy?: "tag" | "path";
  force?: boolean;
  fetchTimeoutMs?: number;
  cwd?: string;
  output: Output;
}

export async function runImportOpenApiCommand(options: ImportOpenApiCommandOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const outputDir = path.resolve(cwd, options.outputDir);

  try {
    if (existsSync(outputDir)) {
      const entries = await readdir(outputDir);
      if (entries.length > 0 && !options.force) {
          options.output.error(`Output directory '${outputDir}' already exists. Use --force to overwrite collection files.`);
          return 2;
      }

      if (entries.length > 0 && options.force) {
        await cleanExistingCollection(outputDir);
      }
    }

    const raw = await readSource(options.source, cwd, options.fetchTimeoutMs);
    const document = parseOpenAPI(raw);
    const collection = openAPIToCollection(document, {
      baseUrl: options.baseUrl,
      environmentName: options.env ?? "development",
      groupBy: options.groupBy ?? "tag",
    });
    collection.rootDir = outputDir;

    await writeCollection(collection);
    options.output.success(`Imported OpenAPI collection to ${outputDir}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.output.error(`Failed to import OpenAPI collection: ${message}`);
    return 2;
  }
}

async function cleanExistingCollection(outputDir: string): Promise<void> {
  let existingCollection: Awaited<ReturnType<typeof readCollection>>;
  try {
    existingCollection = await readCollection(outputDir);
  } catch {
    await rm(path.join(outputDir, "opencollection.yml"), { force: true });
    return;
  }

  const pathsToRemove = new Set<string>([
    "opencollection.yml",
  ]);

  for (const envName of Object.keys(existingCollection.environments)) {
    pathsToRemove.add(path.posix.join("environments", `${envName}.yml`));
  }

  function collectItemPaths(items: CollectionItem[]): void {
    for (const item of items) {
      if (item.kind === "folder") {
        pathsToRemove.add(path.posix.join(item.path, "folder.yml"));
        for (const child of item.children ?? []) {
          collectItemPaths([child]);
        }
      } else {
        pathsToRemove.add(item.path);
      }
    }
  }

  collectItemPaths(existingCollection.items);

  for (const relativePath of pathsToRemove) {
    await rm(path.join(outputDir, relativePath), { recursive: true, force: true });
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readSource(source: string, cwd: string, timeoutMs = 10_000): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetchWithTimeout(source, timeoutMs);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while reading ${source}`);
    }
    return response.text();
  }

  return readFile(path.resolve(cwd, source), "utf8");
}
