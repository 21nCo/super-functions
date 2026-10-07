import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

const MAX_SOURCE_FILES = 128;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_TRAVERSALS = 512;
const MAX_INTERPOLATIONS = 128;

export interface ComposeSourceInventory {
  service: Record<string, unknown> | null;
  resources: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function paths(value: unknown, allowEmpty = false): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && (allowEmpty || value.length > 0) && value.every((item) => typeof item === "string")) return value;
  throw new Error("invalid Compose source path");
}

function envMapping(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter((item): item is string => typeof item === "string").map((item) => {
      const separator = item.indexOf("=");
      return separator < 0 ? [item, null] : [item.slice(0, separator), item.slice(separator + 1)];
    }));
  }
  return record(value);
}

function mergeService(base: Record<string, unknown>, child: Record<string, unknown>, replace: ReadonlySet<string>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(child)) {
    const parent = merged[key];
    if (key === "environment" && !replace.has(key)) {
      merged[key] = { ...(envMapping(parent) ?? {}), ...(envMapping(value) ?? {}) };
    } else if (!replace.has(key) && record(parent) && record(value)) {
      merged[key] = { ...record(parent), ...record(value) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function normalizeComposeRawService(service: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...service };
  for (const field of ["environment", "labels"] as const) {
    if (Array.isArray(normalized[field])) normalized[field] = envMapping(normalized[field]);
  }
  const build = record(normalized.build);
  if (build && Array.isArray(build.args)) normalized.build = { ...build, args: envMapping(build.args) };
  return normalized;
}

/** Bound files and alias materialization before invoking Docker Compose. Compose owns merge semantics. */
export async function assertComposeSourceGraphBounded(
  sourceFile: string,
  serviceName: string,
  interpolate: (names: string[], directory: string, envFiles?: string[]) => Promise<string[]>,
  forbiddenInterpolation: ReadonlySet<string> = new Set(),
  secretNames: ReadonlySet<string> = new Set(),
): Promise<ComposeSourceInventory> {
  const documents = new Map<string, { data: Record<string, unknown>; tags: Map<string, Set<string>> }>();
  const checkedEnvFiles = new Set<string>();
  const visited = new Set<string>();
  const activeServices = new Set<string>();
  const serviceCache = new Map<string, Record<string, unknown> | null>();
  let selectedService: Record<string, unknown> | null = null;
  let totalBytes = 0;
  let interpolations = 0;

  async function interpolateBounded(names: string[], directory: string, envFiles: string[]): Promise<string[]> {
    if (!names.some((name) => name.includes("$"))) return names;
    if (++interpolations > MAX_INTERPOLATIONS) throw new Error("Compose source graph exceeds the interpolation limit");
    return await interpolate(names, directory, envFiles);
  }

  async function checkInterpolationFiles(directory: string, envFiles: string[]): Promise<void> {
    for (const file of [path.join(directory, ".env"), ...envFiles]) {
      if (checkedEnvFiles.has(file)) continue;
      let content: string;
      try {
        const size = (await stat(file)).size;
        if (size > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
        content = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const bytes = Buffer.byteLength(content);
      if (bytes > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
      totalBytes += bytes;
      checkedEnvFiles.add(file);
    }
  }

  async function checkPathExpressions(names: string[], directory: string, envFiles: string[]): Promise<void> {
    await checkInterpolationFiles(directory, envFiles);
    for (const name of names) {
      for (let index = 0; index < name.length; index += 1) {
        if (name[index] !== "$" || index + 1 >= name.length) continue;
        if (name[index + 1] === "$") { index += 1; continue; }
        const start = index + (name[index + 1] === "{" ? 2 : 1);
        if (!/[A-Za-z_]/.test(name[start] ?? "")) continue;
        let end = start + 1;
        while (end < name.length && /[A-Za-z0-9_]/.test(name[end])) end += 1;
        const variable = name.slice(start, end);
        if (secretNames.has(variable) || forbiddenInterpolation.has(variable)) {
          throw new Error("Compose source path interpolates an undeclared host or secret value");
        }
        index = end - 1;
      }
    }
  }

  async function load(file: string): Promise<{ data: Record<string, unknown>; tags: Map<string, Set<string>> }> {
    const cached = documents.get(file);
    if (cached) return cached;
    if (documents.size >= MAX_SOURCE_FILES) throw new Error("Compose source graph exceeds the file limit");
    const size = (await stat(file)).size;
    if (size > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
    const content = await readFile(file, "utf8");
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_SOURCE_BYTES - totalBytes) throw new Error("Compose source graph exceeds the byte limit");
    totalBytes += bytes;
    const document = parseDocument(content, { logLevel: "silent", merge: true });
    if (document.errors.length) throw new Error("invalid Compose source document");
    // A compact anchor graph may expand far beyond the source byte budget.
    const data = record(document.toJS({ maxAliasCount: 100 }));
    if (!data) throw new Error("invalid Compose source document");
    const tags = new Map<string, Set<string>>();
    for (const [name, service] of Object.entries(record(data.services) ?? {})) {
      if (!record(service)) continue;
      const replaced = new Set<string>();
      for (const field of Object.keys(record(service)!)) {
        const node = document.getIn(["services", name, field], true) as { tag?: string } | undefined;
        if (node?.tag === "!override" || node?.tag === "!reset") replaced.add(field);
      }
      tags.set(name, replaced);
    }
    const loaded = { data, tags };
    documents.set(file, loaded);
    return loaded;
  }

  function mark(key: string): boolean {
    if (visited.has(key)) return false;
    if (visited.size >= MAX_TRAVERSALS) throw new Error("Compose source graph exceeds the traversal limit");
    visited.add(key);
    return true;
  }

  async function visitService(file: string, name: string, directory: string, envFiles: string[]): Promise<Record<string, unknown> | null> {
    const key = `service\0${file}\0${name}\0${directory}\0${envFiles.join("\0")}`;
    if (activeServices.has(key)) throw new Error("cyclic Compose extends declaration");
    if (serviceCache.has(key)) return serviceCache.get(key)!;
    mark(key);
    activeServices.add(key);
    const loaded = await load(file);
    const rawService = record(record(loaded.data.services)?.[name]);
    const service = rawService ? normalizeComposeRawService(rawService) : null;
    if (!service?.extends) {
      serviceCache.set(key, service);
      activeServices.delete(key);
      return service;
    }
    const reference = typeof service.extends === "string" ? { service: service.extends } : record(service.extends);
    if (!reference || typeof reference.service !== "string") throw new Error("invalid Compose extends declaration");
    if (typeof reference.file === "string") await checkPathExpressions([reference.file], directory, envFiles);
    const baseFile = typeof reference.file === "string"
      ? path.resolve(directory, (await interpolateBounded([reference.file], directory, envFiles))[0]) : file;
    const base = await visitService(baseFile, reference.service, baseFile === file ? directory : path.dirname(baseFile), envFiles);
    const merged = mergeService(base ?? {}, service, loaded.tags.get(name) ?? new Set());
    serviceCache.set(key, merged);
    activeServices.delete(key);
    return merged;
  }

  async function visitDocument(file: string, directory: string, envFiles: string[]): Promise<void> {
    if (!mark(`document\0${file}\0${directory}\0${envFiles.join("\0")}`)) return;
    await checkInterpolationFiles(directory, envFiles);
    const { data } = await load(file);
    const candidate = await visitService(file, serviceName, directory, envFiles);
    if (candidate) selectedService = candidate;
    const includes = data.include === undefined ? [] : Array.isArray(data.include) ? data.include : [data.include];
    for (const include of includes) {
      const descriptor = typeof include === "string" ? { path: include } : record(include);
      if (!descriptor) throw new Error("invalid Compose include declaration");
      const rawNames = paths(descriptor.path);
      const rawProject = typeof descriptor.project_directory === "string" ? [descriptor.project_directory] : [];
      const rawEnvFiles = descriptor.env_file === undefined ? [] : paths(descriptor.env_file, true);
      await checkPathExpressions([...rawNames, ...rawProject, ...rawEnvFiles], path.dirname(file), envFiles);
      const resolved = await interpolateBounded([...rawNames, ...rawProject, ...rawEnvFiles], path.dirname(file), envFiles);
      const names = resolved.slice(0, rawNames.length);
      const firstFile = path.resolve(path.dirname(file), names[0]);
      const projectDirectory = rawProject.length
        ? path.resolve(path.dirname(file), resolved[rawNames.length])
        : path.dirname(firstFile);
      let localEnvFiles = envFiles;
      if (descriptor.env_file !== undefined) {
        localEnvFiles = resolved.slice(rawNames.length + rawProject.length)
          .map((name) => path.resolve(path.dirname(file), name));
      }
      const includedFiles = names.map((name) => path.resolve(path.dirname(file), name));
      for (const includedFile of includedFiles) await visitDocument(includedFile, projectDirectory, localEnvFiles);
      // A long-form include path list is one merged Compose model. The later
      // file may add env_file while an earlier layer supplied secret-bearing
      // environment expressions; keep both in the fallback provenance.
      let merged: Record<string, unknown> | null = null;
      for (const includedFile of includedFiles) {
        const loaded = await load(includedFile);
        if (!record(record(loaded.data.services)?.[serviceName])) continue;
        const item = await visitService(includedFile, serviceName, projectDirectory, localEnvFiles);
        if (item) merged = mergeService(merged ?? {}, item, loaded.tags.get(serviceName) ?? new Set());
      }
      if (merged) selectedService = merged;
    }
  }

  await visitDocument(sourceFile, path.dirname(sourceFile), []);
  const resources: Record<string, unknown> = {};
  for (const { data } of documents.values()) {
    for (const kind of ["volumes", "networks", "configs"] as const) {
      resources[kind] = { ...(record(resources[kind]) ?? {}), ...(record(data[kind]) ?? {}) };
    }
  }
  return { service: selectedService, resources };
}
