import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

const MAX_SOURCE_FILES = 128;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_TRAVERSALS = 512;
const MAX_INTERPOLATIONS = 128;
const MAX_MATERIALIZED_BYTES = 10 * 1024 * 1024;

export interface ComposeSourceInventory {
  service: Record<string, unknown> | null;
  resources: Record<string, unknown>;
  serviceDirectory: string;
  interpolationEnvFiles: string[];
  interpolationScopes: Array<{ directory: string; envFiles: string[] }>;
}

/** Explicit interpolation inputs in Compose precedence order (lowest first). */
export async function composeInterpolationEnvFiles(scopes: ComposeSourceInventory["interpolationScopes"]): Promise<string[]> {
  const files: string[] = [];
  for (const scope of [...scopes].reverse()) {
    if (scope.envFiles.length) {
      files.push(...scope.envFiles);
      continue;
    }
    const candidate = path.join(scope.directory, ".env");
    try { await stat(candidate); files.push(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return files;
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

function absoluteEnvFiles(value: unknown, directory: string, scopes: ComposeSourceInventory["interpolationScopes"]): unknown {
  const absolute = (entry: unknown): unknown => {
    if (typeof entry === "string") return entry.includes("$")
      ? { path: entry, devfnOrigin: directory, devfnScopes: scopes } : path.resolve(directory, entry);
    const descriptor = record(entry);
    return descriptor && typeof descriptor.path === "string"
      ? { ...descriptor, path: descriptor.path.includes("$") ? descriptor.path : path.resolve(directory, descriptor.path), devfnOrigin: directory, devfnScopes: scopes } : entry;
  };
  return Array.isArray(value) ? value.map(absolute) : absolute(value);
}

function shortFields(value: string): string[] {
  const fields: string[] = [];
  let start = 0;
  let braces = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "$" && value[index + 1] === "{") { braces += 1; index += 1; }
    else if (value[index] === "}" && braces > 0) braces -= 1;
    else if (value[index] === ":" && braces === 0) { fields.push(value.slice(start, index)); start = index + 1; }
  }
  fields.push(value.slice(start));
  return fields;
}

function resourceScalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value) ?? "";
}

function uniqueResourceIdentity(key: string, entry: unknown): string {
  if (typeof entry === "string") {
    const fields = shortFields(entry);
    if (key === "volumes" || key === "devices") return fields.length > 1 ? fields[1] : fields[0];
    if (key === "configs") return `/${entry}`;
    if (key === "secrets") return `/run/secrets/${entry}`;
    if (key === "ports") {
      const [target, protocol = "tcp"] = fields.at(-1)!.split("/");
      const published = fields.at(-2) ?? "";
      const hostIp = fields.length > 2 ? fields.slice(0, -2).join(":") : "";
      return JSON.stringify([hostIp, target, published, protocol]);
    }
    return entry;
  }
  const item = record(entry);
  if (!item) return JSON.stringify(entry);
  if (key === "ports") return JSON.stringify([item.host_ip ?? "", item.target ?? "", item.published ?? "", item.protocol ?? "tcp"].map(resourceScalar));
  if (key === "volumes" || key === "devices" || key === "configs" || key === "secrets") {
    const target = item.target ?? (key === "configs" ? `/${resourceScalar(item.source)}`
      : key === "secrets" ? `/run/secrets/${resourceScalar(item.source)}` : item.source);
    return typeof target === "string" ? target : JSON.stringify(entry);
  }
  return JSON.stringify(entry);
}

const UNIQUE_RESOURCE_FIELDS = new Set(["volumes", "ports", "secrets", "configs", "devices"]);
const APPEND_FIELDS = new Set(["expose", "external_links", "dns", "dns_search", "tmpfs", "cap_add", "cap_drop", "device_cgroup_rules", "security_opt"]);

function mergeArrayField(key: string, parent: unknown[], child: unknown[]): unknown[] {
  if (UNIQUE_RESOURCE_FIELDS.has(key)) {
    const entries = new Map(parent.map((entry) => [uniqueResourceIdentity(key, entry), entry]));
    for (const entry of child) entries.set(uniqueResourceIdentity(key, entry), entry);
    return [...entries.values()];
  }
  return APPEND_FIELDS.has(key) ? [...parent, ...child] : child;
}

function mergeServiceField(key: string, parent: unknown, value: unknown, replace: ReadonlySet<string>): unknown {
  if (replace.has(key)) return value;
  if (key === "environment") return { ...envMapping(parent), ...envMapping(value) };
  if (key === "env_file" && parent != null && value != null) {
    return [...(Array.isArray(parent) ? parent : [parent]), ...(Array.isArray(value) ? value : [value])];
  }
  if (Array.isArray(parent) && Array.isArray(value)) return mergeArrayField(key, parent, value);
  const parentRecord = record(parent);
  const valueRecord = record(value);
  return parentRecord && valueRecord ? mergeService(parentRecord, valueRecord, new Set()) : value;
}

function mergeService(base: Record<string, unknown>, child: Record<string, unknown>, replace: ReadonlySet<string>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(child)) {
    merged[key] = mergeServiceField(key, merged[key], value, replace);
  }
  return merged;
}

/** A fallback inventory keeps raw expressions, but Compose compares their evaluated targets. */
export async function reconcileComposeUniqueResources(service: Record<string, unknown>, interpolate: (values: string[]) => Promise<string[]>): Promise<Record<string, unknown>> {
  const reconciled = { ...service };
  for (const key of UNIQUE_RESOURCE_FIELDS) {
    const entries = service[key];
    if (!Array.isArray(entries)) continue;
    const identities = entries.map((entry) => uniqueResourceIdentity(key, entry));
    const unresolved = identities.flatMap((identity, index) => identity.includes("$") ? [index] : []);
    if (unresolved.length) {
      const values = await interpolate(unresolved.map((index) => identities[index]));
      for (const [offset, index] of unresolved.entries()) identities[index] = values[offset];
    }
    const selected = new Map<string, unknown>();
    for (const [index, entry] of entries.entries()) selected.set(identities[index], entry);
    reconciled[key] = [...selected.values()];
  }
  return reconciled;
}

function addMaterializedSize(size: number, item: unknown, remaining: number, active: Set<object>, keyBytes = 0): number {
  const next = size + keyBytes + materializedSize(item, remaining - size - keyBytes, active) + 1;
  if (next > remaining) throw new Error("Compose source graph exceeds the materialization limit");
  return next;
}

function materializedSize(value: unknown, remaining: number, active = new Set<object>()): number {
  if (remaining < 0) throw new Error("Compose source graph exceeds the materialization limit");
  if (typeof value === "string") return Buffer.byteLength(value) + 2;
  if (!value || typeof value !== "object") return 8;
  if (active.has(value)) throw new Error("cyclic Compose source alias");
  active.add(value);
  let size = 2;
  if (Array.isArray(value)) {
    for (const item of value) size = addMaterializedSize(size, item, remaining, active);
  } else {
    for (const [key, item] of Object.entries(value)) {
      size = addMaterializedSize(size, item, remaining, active, Buffer.byteLength(key) + 2);
    }
  }
  active.delete(value);
  return size;
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

export function* pathInterpolationNames(value: string): Generator<string> {
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "$" || index + 1 >= value.length) { index += 1; continue; }
    if (value[index + 1] === "$") { index += 2; continue; }
    const start = index + (value[index + 1] === "{" ? 2 : 1);
    if (!/[A-Za-z_]/.test(value[start] ?? "")) { index += 1; continue; }
    let end = start + 1;
    while (end < value.length && /\w/.test(value[end])) end += 1;
    yield value.slice(start, end);
    index = end;
  }
}

/** Bound files and alias materialization before invoking Docker Compose. Compose owns merge semantics. */
export async function assertComposeSourceGraphBounded(
  sourceFile: string,
  serviceName: string,
  interpolate: (names: string[], directory: string, envFiles?: string[], scopes?: ComposeSourceInventory["interpolationScopes"]) => Promise<string[]>,
  forbiddenInterpolation: ReadonlySet<string> = new Set(),
  secretNames: ReadonlySet<string> = new Set(),
): Promise<ComposeSourceInventory> {
  const documents = new Map<string, { data: Record<string, unknown>; tags: Map<string, Set<string>> }>();
  const checkedEnvFiles = new Set<string>();
  const visited = new Set<string>();
  const activeServices = new Set<string>();
  const serviceCache = new Map<string, Record<string, unknown> | null>();
  let selectedService: Record<string, unknown> | null = null;
  let selectedDirectory = path.dirname(sourceFile);
  let selectedEnvFiles: string[] = [];
  let selectedScopes: ComposeSourceInventory["interpolationScopes"] = [{ directory: selectedDirectory, envFiles: [] }];
  let totalBytes = 0;
  let materializedBytes = 0;
  let interpolations = 0;

  async function interpolateBounded(names: string[], directory: string, envFiles: string[], scopes: ComposeSourceInventory["interpolationScopes"]): Promise<string[]> {
    if (!names.some((name) => name.includes("$"))) return names;
    if (++interpolations > MAX_INTERPOLATIONS) throw new Error("Compose source graph exceeds the interpolation limit");
    return await interpolate(names, directory, envFiles, scopes);
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
      for (const variable of pathInterpolationNames(name)) {
        if (secretNames.has(variable) || forbiddenInterpolation.has(variable)) {
          throw new Error("Compose source path interpolates an undeclared host or secret value");
        }
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
    materializedBytes += materializedSize(data, MAX_MATERIALIZED_BYTES - materializedBytes);
    if (materializedBytes > MAX_MATERIALIZED_BYTES) throw new Error("Compose source graph exceeds the materialization limit");
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

  function cacheService(key: string, service: Record<string, unknown> | null): void {
    if (service) materializedBytes += materializedSize(service, MAX_MATERIALIZED_BYTES - materializedBytes);
    if (materializedBytes > MAX_MATERIALIZED_BYTES) throw new Error("Compose source graph exceeds the materialization limit");
    serviceCache.set(key, service);
  }

  async function visitService(file: string, name: string, directory: string, envFiles: string[], scopes: ComposeSourceInventory["interpolationScopes"]): Promise<Record<string, unknown> | null> {
    const key = `service\0${file}\0${name}\0${directory}\0${JSON.stringify(scopes)}`;
    if (activeServices.has(key)) throw new Error("cyclic Compose extends declaration");
    if (serviceCache.has(key)) return serviceCache.get(key)!;
    mark(key);
    activeServices.add(key);
    const loaded = await load(file);
    const rawService = record(record(loaded.data.services)?.[name]);
    const service = rawService ? normalizeComposeRawService(rawService) : null;
    if (service?.env_file !== undefined) service.env_file = absoluteEnvFiles(service.env_file, directory, scopes);
    if (!service?.extends) {
      cacheService(key, service);
      activeServices.delete(key);
      return service;
    }
    const reference = typeof service.extends === "string" ? { service: service.extends } : record(service.extends);
    if (!reference || typeof reference.service !== "string") throw new Error("invalid Compose extends declaration");
    if (typeof reference.file === "string") await checkPathExpressions([reference.file], directory, envFiles);
    const baseFile = typeof reference.file === "string"
      ? path.resolve(directory, (await interpolateBounded([reference.file], directory, envFiles, scopes))[0]) : file;
    const base = await visitService(baseFile, reference.service, baseFile === file ? directory : path.dirname(baseFile), envFiles, scopes);
    const merged = mergeService(base ?? {}, service, loaded.tags.get(name) ?? new Set());
    cacheService(key, merged);
    activeServices.delete(key);
    return merged;
  }

  async function resolveInclude(file: string, include: unknown, scopes: ComposeSourceInventory["interpolationScopes"]): Promise<{
    includedFiles: string[]; projectDirectory: string; localEnvFiles: string[];
  }> {
    const descriptor = typeof include === "string" ? { path: include } : record(include);
    if (!descriptor) throw new Error("invalid Compose include declaration");
    const origin = path.dirname(file);
    const rawNames = paths(descriptor.path);
    const rawProject = typeof descriptor.project_directory === "string" ? [descriptor.project_directory] : [];
    const rawEnvFiles = descriptor.env_file === undefined ? [] : paths(descriptor.env_file, true);
    const pathEnvFiles = await composeInterpolationEnvFiles(scopes);
    await checkPathExpressions([...rawNames, ...rawProject, ...rawEnvFiles], origin, pathEnvFiles);
    const resolved = await interpolateBounded([...rawNames, ...rawProject, ...rawEnvFiles], origin, pathEnvFiles, scopes);
    const includedFiles = resolved.slice(0, rawNames.length).map((name) => path.resolve(origin, name));
    const projectDirectory = rawProject.length ? path.resolve(origin, resolved[rawNames.length]) : path.dirname(includedFiles[0]);
    // A short include starts a new project with its own default .env. The
    // parent's explicit files remain in the ancestry for precedence, but are
    // not the child's local defaults.
    const localEnvFiles = descriptor.env_file === undefined ? [] : resolved.slice(rawNames.length + rawProject.length)
      .map((name) => path.resolve(origin, name));
    return { includedFiles, projectDirectory, localEnvFiles };
  }

  async function mergedIncludedService(files: string[], directory: string, envFiles: string[], scopes: ComposeSourceInventory["interpolationScopes"]): Promise<Record<string, unknown> | null> {
    // A long-form include path list is one merged Compose model. Later files
    // may add env_file while earlier files supplied secret-bearing expressions.
    let merged: Record<string, unknown> | null = null;
    for (const file of files) {
      const loaded = await load(file);
      if (!record(record(loaded.data.services)?.[serviceName])) continue;
      const item = await visitService(file, serviceName, directory, envFiles, scopes);
      if (item) merged = mergeService(merged ?? {}, item, loaded.tags.get(serviceName) ?? new Set());
    }
    return merged;
  }

  async function visitDocument(file: string, directory: string, envFiles: string[], scopes: ComposeSourceInventory["interpolationScopes"]): Promise<void> {
    if (!mark(`document\0${file}\0${directory}\0${envFiles.join("\0")}`)) return;
    await checkInterpolationFiles(directory, envFiles);
    const { data } = await load(file);
    const candidate = await visitService(file, serviceName, directory, await composeInterpolationEnvFiles(scopes), scopes);
    if (candidate) {
      selectedService = candidate;
      selectedDirectory = directory;
      selectedEnvFiles = envFiles;
      selectedScopes = scopes;
    }
    let includes: unknown[] = [];
    if (Array.isArray(data.include)) includes = data.include;
    else if (data.include !== undefined) includes = [data.include];
    for (const include of includes) {
      const { includedFiles, projectDirectory, localEnvFiles } = await resolveInclude(file, include, scopes);
      const childScopes = [...scopes, { directory: projectDirectory, envFiles: localEnvFiles }];
      for (const includedFile of includedFiles) await visitDocument(includedFile, projectDirectory, localEnvFiles, childScopes);
      const merged = await mergedIncludedService(includedFiles, projectDirectory, await composeInterpolationEnvFiles(childScopes), childScopes);
      if (merged) {
        selectedService = merged;
        selectedDirectory = projectDirectory;
        selectedEnvFiles = localEnvFiles;
        selectedScopes = childScopes;
      }
    }
  }

  await visitDocument(sourceFile, path.dirname(sourceFile), [], selectedScopes);
  const resources: Record<string, unknown> = {};
  for (const { data } of documents.values()) {
    for (const kind of ["volumes", "networks", "configs", "secrets"] as const) {
      resources[kind] = { ...record(resources[kind]), ...record(data[kind]) };
    }
  }
  return { service: selectedService, resources, serviceDirectory: selectedDirectory, interpolationEnvFiles: selectedEnvFiles,
    interpolationScopes: selectedScopes };
}
