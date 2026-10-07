import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isMap, isScalar, parseDocument, visit } from "yaml";

const MAX_SOURCE_FILES = 128;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function mapping(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function includePaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error("invalid Compose include path");
}

function checkImplicitInterpolation(value: string, forbidden: ReadonlySet<string>, referenced: Set<string>): void {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$" || value[index + 1] === undefined) continue;
    if (value[index + 1] === "$") { index += 1; continue; }
    let start = index + 1;
    const braced = value[start] === "{";
    if (braced) start += 1;
    if (!/[A-Za-z_]/.test(value[start] ?? "")) continue;
    let end = start + 1;
    while (end < value.length && /[A-Za-z0-9_]/.test(value[end])) end += 1;
    const name = value.slice(start, end);
    if (forbidden.has(name)) throw new Error("Compose source interpolates an inherited host value without an explicit allowlist");
    referenced.add(name);
    index = end - 1;
  }
}

function referencedResourceNames(service: Record<string, unknown>, kind: "volumes" | "networks" | "configs"): string[] {
  const value = service[kind];
  if (kind === "networks" && mapping(value)) return Object.keys(mapping(value)!);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [kind === "volumes" ? entry.split(":", 1)[0] : entry];
    const source = mapping(entry)?.source;
    return typeof source === "string" ? [source] : [];
  });
}

/** Bound the source graph before reading each file. Compose owns merge semantics. */
export async function assertComposeSourceGraphBounded(
  sourceFile: string,
  serviceName: string,
  interpolate: (names: string[], directory: string) => Promise<string[]>,
  forbiddenInterpolation: ReadonlySet<string> = new Set(),
  referencedInterpolation: Set<string> = new Set(),
): Promise<void> {
  const documents = new Map<string, { data: Record<string, unknown>; document: ReturnType<typeof parseDocument> }>();
  const visited = new Set<string>();
  const visitedDocuments = new Set<string>();
  const referenced = { volumes: new Set<string>(), networks: new Set<string>(), configs: new Set<string>() };
  let totalBytes = 0;

  function checkNode(node: unknown): void {
    if (!node) return;
    visit(node as Parameters<typeof visit>[0], (_key, item) => {
      if (isScalar(item) && typeof item.value === "string" && item.type !== "QUOTE_SINGLE") {
        checkImplicitInterpolation(item.value, forbiddenInterpolation, referencedInterpolation);
      }
    });
  }

  async function load(file: string): Promise<{ data: Record<string, unknown>; document: ReturnType<typeof parseDocument> }> {
    const cached = documents.get(file);
    if (cached) return cached;
    if (documents.size >= MAX_SOURCE_FILES) throw new Error("Compose source graph exceeds the file limit");
    const size = (await stat(file)).size;
    if (size > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
    const content = await readFile(file, "utf8");
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
    totalBytes += bytes;
    const document = parseDocument(content, { logLevel: "silent" });
    const data = mapping(document.toJS());
    if (!data || document.errors.length) throw new Error("invalid Compose source document");
    const result = { data, document };
    documents.set(file, result);
    return result;
  }

  async function visitService(file: string, name: string, directory: string, ignoredFields: ReadonlySet<string> = new Set(), ignoredKeys: ReadonlyMap<string, ReadonlySet<string>> = new Map()): Promise<void> {
    const key = `${file}\0${name}\0${directory}\0${[...ignoredFields].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(",")}\0${[...ignoredKeys].map(([field, keys]) => `${field}:${[...keys].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(",")}`).join(";")}`;
    if (visited.has(key)) return;
    visited.add(key);
    const loaded = await load(file);
    const service = mapping(mapping(loaded.data.services)?.[name]);
    if (service) for (const field of Object.keys(service)) {
      if (ignoredFields.has(field)) continue;
      const node = loaded.document.getIn(["services", name, field], true);
      const skipped = ignoredKeys.get(field);
      if (skipped && isMap(node)) {
        for (const pair of node.items) {
          const entry = isScalar(pair.key) ? String(pair.key.value) : "";
          if (!skipped.has(entry)) checkNode(pair.value);
        }
      } else checkNode(node);
    }
    if (service) for (const kind of ["volumes", "networks", "configs"] as const) {
      if (ignoredFields.has(kind)) continue;
      for (const resource of referencedResourceNames(service, kind)) referenced[kind].add(resource);
    }
    if (!service?.extends) return;
    const reference = typeof service.extends === "string" ? { service: service.extends } : mapping(service.extends);
    if (!reference || typeof reference.service !== "string") throw new Error("invalid Compose extends declaration");
    const baseIgnored = new Set(ignoredFields);
    const baseIgnoredKeys = new Map([...ignoredKeys].map(([field, keys]) => [field, new Set(keys)]));
    for (const field of Object.keys(service)) {
      const node = loaded.document.getIn(["services", name, field], true) as { tag?: string } | undefined;
      if (node?.tag === "!override" || node?.tag === "!reset" || ["command", "entrypoint", "image", "build", "working_dir", "user"].includes(field)) baseIgnored.add(field);
      else if (mapping(service[field])) {
        const keys = baseIgnoredKeys.get(field) ?? new Set<string>();
        for (const childKey of Object.keys(mapping(service[field])!)) keys.add(childKey);
        baseIgnoredKeys.set(field, keys);
      }
    }
    const baseFile = typeof reference.file === "string"
      ? path.resolve(directory, (await interpolate([reference.file], directory))[0]) : file;
    await visitService(baseFile, reference.service, path.dirname(baseFile), baseIgnored, baseIgnoredKeys);
  }

  async function visitDocument(file: string, directory: string): Promise<void> {
    const key = `${file}\0${directory}`;
    if (visitedDocuments.has(key)) return;
    visitedDocuments.add(key);
    await visitService(file, serviceName, directory);
    const { data, document } = await load(file);
    checkNode(document.get("include", true));
    const includes = data.include === undefined ? [] : Array.isArray(data.include) ? data.include : [data.include];
    for (const include of includes) {
      const descriptor = typeof include === "string" ? { path: include } : mapping(include);
      if (!descriptor) throw new Error("invalid Compose include declaration");
      const names = includePaths(descriptor.path);
      const resolved = await interpolate(names, path.dirname(file));
      const projectDirectory = typeof descriptor.project_directory === "string"
        ? path.resolve(path.dirname(file), (await interpolate([descriptor.project_directory], path.dirname(file)))[0]) : undefined;
      for (const name of resolved) {
        const includedFile = path.resolve(path.dirname(file), name);
        await visitDocument(includedFile, projectDirectory ?? path.dirname(includedFile));
      }
    }
  }

  await visitDocument(sourceFile, path.dirname(sourceFile));
  for (const { document } of documents.values()) {
    for (const kind of ["volumes", "networks", "configs"] as const) {
      for (const name of referenced[kind]) checkNode(document.getIn([kind, name], true));
    }
  }
}
