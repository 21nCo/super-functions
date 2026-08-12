import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as toYaml } from "yaml";
import type { Collection, CollectionItem } from "./types.js";

function ensureSafeRelativePath(rootDir: string, relativePath: string, label: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a relative path within the collection`);
  }

  const parts = relativePath.split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} contains an unsafe path segment: ${relativePath}`);
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ...parts);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the collection root: ${relativePath}`);
  }

  return resolved;
}

function ensureSafeFileStem(name: string, label: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new Error(`${label} contains unsafe characters: ${name}`);
  }
  return name;
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeYaml(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, toYaml(value), "utf8");
}

async function writeItem(rootDir: string, item: CollectionItem): Promise<void> {
  if (item.kind === "folder") {
    const folderDir = ensureSafeRelativePath(rootDir, item.path, "Collection folder path");
    await ensureDir(folderDir);
    await writeYaml(path.join(folderDir, "folder.yml"), {
      name: item.name,
      ...(item.seq !== undefined ? { seq: item.seq } : {}),
    });

    for (const child of item.children ?? []) {
      await writeItem(rootDir, child);
    }

    return;
  }

  if (!item.request) {
    throw new Error(`Request item missing request payload: ${item.path}`);
  }

  await writeYaml(ensureSafeRelativePath(rootDir, item.path, "Collection request path"), item.request);
}

export async function writeCollection(collection: Collection): Promise<void> {
  if (!collection.rootDir) {
    throw new Error("Collection rootDir is required for writeCollection");
  }

  await ensureDir(collection.rootDir);

  await writeYaml(path.join(collection.rootDir, "opencollection.yml"), {
    name: collection.info.name,
    ...(collection.info.description ? { description: collection.info.description } : {}),
    ...(collection.info.version ? { version: collection.info.version } : {}),
  });

  const envDir = path.join(collection.rootDir, "environments");
  await ensureDir(envDir);

  for (const [name, env] of Object.entries(collection.environments)) {
    const safeName = ensureSafeFileStem(name, "Environment name");
    await writeYaml(path.join(envDir, `${safeName}.yml`), {
      name: env.name,
      variables: env.variables,
    });
  }

  for (const item of collection.items) {
    await writeItem(collection.rootDir, item);
  }
}
