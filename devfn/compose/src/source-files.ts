import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

export interface DeclaredEnvFile { name: string; required: boolean; directory: string }
export interface DeclaredComposeInputs { envFiles: DeclaredEnvFile[]; environment: Record<string, unknown> }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function paths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return value;
  throw new Error("invalid Compose source path");
}

/** Discover env files on Compose versions that discard env_file from config output. */
export async function declaredComposeInputs(
  sourceFile: string,
  serviceName: string,
  interpolate: (names: string[], directory: string) => Promise<string[]>,
): Promise<DeclaredComposeInputs> {
  const documents = new Map<string, { data: Record<string, unknown>; tags: Record<string, { environment?: string; env_file?: string }> }>();
  const visitedDocuments = new Set<string>();
  const visitedServices = new Set<string>();
  const found: DeclaredEnvFile[] = [];
  const environment: Record<string, unknown> = {};

  async function load(file: string): Promise<{ data: Record<string, unknown>; tags: Record<string, { environment?: string; env_file?: string }> }> {
    const cached = documents.get(file);
    if (cached) return cached;
    if (documents.size >= 128) throw new Error("Compose source graph exceeds the input limit");
    const content = await readFile(file, "utf8");
    if (content.length > 10 * 1024 * 1024) throw new Error("Compose source exceeds the input limit");
    // Compose's !override and !reset tags are valid source syntax. YAML keeps
    // their underlying values; suppress warnings that could echo source text.
    const document = parseDocument(content, { logLevel: "silent" });
    const data = record(document.toJS());
    if (!data || document.errors.length) throw new Error("invalid Compose source document");
    const tags: Record<string, { environment?: string; env_file?: string }> = {};
    for (const name of Object.keys(record(data.services) ?? {})) {
      tags[name] = {
        environment: (document.getIn(["services", name, "environment"], true) as { tag?: string } | undefined)?.tag,
        env_file: (document.getIn(["services", name, "env_file"], true) as { tag?: string } | undefined)?.tag,
      };
    }
    const result = { data, tags };
    documents.set(file, result);
    return result;
  }

  async function resolveName(name: string, directory: string): Promise<string> {
    const [resolved] = await interpolate([name], directory);
    return path.resolve(directory, resolved);
  }

  async function visitService(file: string, name: string, directory: string): Promise<void> {
    const key = `${file}\0${name}\0${directory}`;
    if (visitedServices.has(key)) return;
    visitedServices.add(key);
    const document = await load(file);
    const service = record(record(document.data.services)?.[name]);
    if (!service) return;
    const extended = service.extends;
    if (extended) {
      const reference = typeof extended === "string" ? { service: extended } : record(extended);
      if (!reference || typeof reference.service !== "string") throw new Error("invalid Compose extends declaration");
      const baseFile = typeof reference.file === "string" ? await resolveName(reference.file, path.dirname(file)) : file;
      await visitService(baseFile, reference.service, path.dirname(baseFile));
    }
    const envFileTag = document.tags[name]?.env_file;
    if (envFileTag === "!override" || envFileTag === "!reset") found.length = 0;
    const declared = service.env_file;
    if (declared !== undefined) {
      const entries = Array.isArray(declared) ? declared : [declared];
      for (const entry of entries) {
        const item = typeof entry === "string" ? { path: entry, required: true } : record(entry);
        if (!item || typeof item.path !== "string") throw new Error("invalid Compose env_file declaration");
        if (found.length >= 256) throw new Error("Compose env_file inventory exceeds the input limit");
        found.push({ name: item.path, required: item.required !== false, directory });
      }
    }
    const environmentTag = document.tags[name]?.environment;
    if (environmentTag === "!override" || environmentTag === "!reset") for (const key of Object.keys(environment)) delete environment[key];
    const literals = service.environment;
    if (Array.isArray(literals)) {
      for (const literal of literals) {
        if (typeof literal !== "string") throw new Error("invalid Compose environment declaration");
        const split = literal.indexOf("=");
        environment[split < 0 ? literal : literal.slice(0, split)] = split < 0 ? null : literal.slice(split + 1);
      }
    } else if (literals !== undefined) {
      const entries = record(literals);
      if (!entries) throw new Error("invalid Compose environment declaration");
      Object.assign(environment, entries);
    }
  }

  async function visitDocument(file: string, directory: string): Promise<void> {
    const key = `${file}\0${directory}`;
    if (visitedDocuments.has(key)) return;
    visitedDocuments.add(key);
    const document = (await load(file)).data;
    await visitService(file, serviceName, directory);
    const includes = document.include === undefined ? [] : Array.isArray(document.include) ? document.include : [document.include];
    for (const include of includes) {
      const descriptor = typeof include === "string" ? { path: include } : record(include);
      if (!descriptor) throw new Error("invalid Compose include declaration");
      const projectDirectory = typeof descriptor.project_directory === "string"
        ? await resolveName(descriptor.project_directory, path.dirname(file)) : undefined;
      for (const name of paths(descriptor.path)) {
        const includedFile = await resolveName(name, path.dirname(file));
        await visitDocument(includedFile, projectDirectory ?? path.dirname(includedFile));
      }
    }
  }

  await visitDocument(sourceFile, path.dirname(sourceFile));
  return { envFiles: found, environment };
}
