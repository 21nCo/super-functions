import { readFile } from "node:fs/promises";
import path from "node:path";
import { globSync } from "glob";
import { parse as parseYaml } from "yaml";
import type { Collection, CollectionItem, Environment, OpenCollectionRequest } from "./types.js";

interface ReadContext {
  rootDir: string;
  requestByPath: Map<string, OpenCollectionRequest>;
  folderMetaByPath: Map<string, { name?: string; seq?: number }>;
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function isYml(filePath: string): boolean {
  return filePath.endsWith(".yml") || filePath.endsWith(".yaml");
}

async function readYamlFile(filePath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseYaml(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid YAML object in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function sortBySeqThenName<T extends { seq?: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aSeq = a.seq ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.seq ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
      return aSeq - bSeq;
    }
    return a.name.localeCompare(b.name);
  });
}

function buildFolderItems(relativeDir: string, context: ReadContext): CollectionItem[] {
  const prefix = relativeDir ? `${relativeDir}/` : "";
  const directRequests = Array.from(context.requestByPath.entries())
    .filter(([requestPath]) => {
      if (!requestPath.startsWith(prefix)) {
        return false;
      }
      const remaining = requestPath.slice(prefix.length);
      return !remaining.includes("/");
    })
    .map(([requestPath, request]) => ({
      kind: "request" as const,
      name: request.info?.name ?? path.basename(requestPath, path.extname(requestPath)),
      path: requestPath,
      request,
      seq: request.info?.seq,
    }));

  const childFolderNames = new Set<string>();

  for (const requestPath of context.requestByPath.keys()) {
    if (!requestPath.startsWith(prefix)) {
      continue;
    }
    const remaining = requestPath.slice(prefix.length);
    const first = remaining.split("/")[0];
    if (first && remaining.includes("/")) {
      childFolderNames.add(first);
    }
  }

  for (const folderPath of context.folderMetaByPath.keys()) {
    if (!folderPath.startsWith(prefix)) {
      continue;
    }
    const remaining = folderPath.slice(prefix.length);
    const first = remaining.split("/")[0];
    if (first && remaining.includes("/")) {
      childFolderNames.add(first);
    }
    if (first && !remaining.includes("/")) {
      childFolderNames.add(first);
    }
  }

  const folders = Array.from(childFolderNames)
    .map((folderName) => {
      const folderPath = prefix ? `${prefix}${folderName}` : folderName;
      const folderMeta = context.folderMetaByPath.get(folderPath) ?? {};
      const children = buildFolderItems(folderPath, context);
      return {
        kind: "folder" as const,
        name: folderMeta.name ?? folderName,
        path: folderPath,
        children,
        seq: folderMeta.seq,
      };
    })
    .filter((folder) => folder.children.length > 0 || context.folderMetaByPath.has(folder.path));

  return sortBySeqThenName([...directRequests, ...folders]);
}

export async function readCollection(rootDir: string): Promise<Collection> {
  const opencollectionPath = path.join(rootDir, "opencollection.yml");
  let info: Record<string, unknown>;

  try {
    info = await readYamlFile(opencollectionPath);
  } catch {
    throw new Error(`No opencollection.yml found in ${rootDir}`);
  }

  const allYamlFiles = globSync("**/*.{yml,yaml}", {
    cwd: rootDir,
    nodir: true,
    dot: false,
  });

  const requestByPath = new Map<string, OpenCollectionRequest>();
  const folderMetaByPath = new Map<string, { name?: string; seq?: number }>();
  const environments: Record<string, Environment> = {};

  for (const relative of allYamlFiles) {
    const posixPath = toPosix(relative);
    if (posixPath === "opencollection.yml") {
      continue;
    }

    const fullPath = path.join(rootDir, relative);
    const parsed = await readYamlFile(fullPath);

    if (posixPath.startsWith("environments/") && isYml(posixPath)) {
      const name = path.basename(posixPath, path.extname(posixPath));
      environments[name] = {
        name,
        variables: (parsed.variables as Record<string, string>) ?? {},
      };
      continue;
    }

    if (path.basename(posixPath) === "folder.yml") {
      const folderPath = toPosix(path.dirname(posixPath));
      folderMetaByPath.set(folderPath === "." ? "" : folderPath, {
        name: typeof parsed.name === "string" ? parsed.name : undefined,
        seq: typeof parsed.seq === "number" ? parsed.seq : undefined,
      });
      continue;
    }

    if (parsed.info && parsed.http) {
      requestByPath.set(posixPath, parsed as unknown as OpenCollectionRequest);
    }
  }

  const context: ReadContext = {
    rootDir,
    requestByPath,
    folderMetaByPath,
  };

  const items = buildFolderItems("", context);

  return {
    info: {
      name: String(info.name ?? "Collection"),
      description: typeof info.description === "string" ? info.description : undefined,
      version: typeof info.version === "string" ? info.version : undefined,
      type: "collection",
    },
    environments,
    items,
    rootDir,
  };
}
