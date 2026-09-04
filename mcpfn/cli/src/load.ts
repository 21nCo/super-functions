import { existsSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import {
  createManifest,
  validateManifest,
  type McpFnClientProfile,
  type McpFnManifest,
  type McpFnRegistry,
  type McpFnServer,
  type McpFnServerInfo,
  type McpFnServerRuntimeOptions,
} from "@mcpfn/core";
import {
  validateMcpFnScenarios,
  type McpFnClientProfileCase,
  type McpFnScenario,
  type RunClientProfileCompatibilitySuiteOptions,
} from "@mcpfn/testing";

async function loadModule(file: string, cwd: string): Promise<unknown> {
  const resolved = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  if (resolved.endsWith(".json")) {
    return JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(resolved, "utf8")));
  }
  const jiti = createJiti(cwd, { moduleCache: false });
  const loaded = (await jiti.import(resolved)) as Record<string, unknown>;
  let value: unknown = loaded.default ?? loaded;
  if (typeof value === "function") value = await value();
  return value;
}

function isServerExport(value: unknown): value is McpFnServer<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { manifest?: unknown }).manifest === "function" &&
    typeof (value as { connect?: unknown }).connect === "function" &&
    typeof (value as { close?: unknown }).close === "function",
  );
}

function isRegistryExport(value: unknown): value is McpFnRegistry<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { definitions?: unknown }).definitions === "function" &&
    typeof (value as { listTools?: unknown }).listTools === "function" &&
    typeof (value as { callTool?: unknown }).callTool === "function",
  );
}

function isDeclarationExport(value: unknown): value is {
  manifest(): McpFnManifest;
  createServer(runtime?: McpFnServerRuntimeOptions<unknown>): McpFnServer<unknown>;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { manifest?: unknown }).manifest === "function" &&
    typeof (value as { createServer?: unknown }).createServer === "function",
  );
}

export async function loadManifestSource(
  file: string,
  cwd = process.cwd(),
  info?: McpFnServerInfo,
  runtime?: McpFnServerRuntimeOptions<unknown>,
): Promise<{ manifest: McpFnManifest; server?: McpFnServer<unknown> }> {
  const value = await loadModule(file, cwd);
  // Use the public surface instead of instanceof: a global CLI and the target
  // project commonly load separate physical copies of @mcpfn/core.
  if (isServerExport(value)) {
    return { manifest: validateManifest(value.manifest()), server: value };
  }
  if (isDeclarationExport(value)) {
    const manifest = validateManifest(value.manifest());
    if (runtime === undefined) return { manifest };
    const server = value.createServer(runtime);
    if (!isServerExport(server)) {
      throw new Error("McpFn declaration createServer() did not return a server");
    }
    return { manifest, server };
  }
  if (isRegistryExport(value)) {
    if (!info) {
      throw new Error("A registry source requires --name and --version");
    }
    return { manifest: validateManifest(createManifest(info, value)) };
  }
  return { manifest: validateManifest(value) };
}

export async function loadScenarios(
  file: string,
  cwd = process.cwd(),
): Promise<McpFnScenario[]> {
  const value = await loadModule(file, cwd);
  return validateMcpFnScenarios(value) as McpFnScenario[];
}

export interface LoadedClientProfileSuite {
  registry: McpFnRegistry<unknown>;
  info: McpFnServerInfo;
  suite: Pick<
    RunClientProfileCompatibilitySuiteOptions<unknown>,
    "profiles" | "cases" | "includeGeneric" | "genericContext" | "maxReportBytes"
  >;
}

export async function loadClientProfileSuite(
  serverPath: string,
  suitePath: string,
  cwd = process.cwd(),
  info?: McpFnServerInfo,
): Promise<LoadedClientProfileSuite> {
  const serverValue = await loadModule(serverPath, cwd);
  const registryAndInfo = extractRegistry(serverValue, info);
  const suiteValue = await loadModule(suitePath, cwd);
  if (!suiteValue || typeof suiteValue !== "object" || Array.isArray(suiteValue)) {
    throw new Error("A client-profile suite must export an object with cases");
  }
  const suite = suiteValue as {
    profiles?: McpFnClientProfile<unknown>[];
    cases?: McpFnClientProfileCase<unknown>[];
    includeGeneric?: boolean;
    genericContext?: unknown;
    maxReportBytes?: number;
  };
  if (!Array.isArray(suite.cases)) {
    throw new Error("A client-profile suite must export a cases array");
  }
  return {
    registry: registryAndInfo.registry,
    info: registryAndInfo.info,
    suite: {
      ...(suite.profiles ? { profiles: suite.profiles } : {}),
      cases: suite.cases,
      ...(suite.includeGeneric === undefined ? {} : { includeGeneric: suite.includeGeneric }),
      ...(suite.genericContext === undefined ? {} : { genericContext: suite.genericContext }),
      ...(suite.maxReportBytes === undefined ? {} : { maxReportBytes: suite.maxReportBytes }),
    },
  };
}

function extractRegistry(
  value: unknown,
  info?: McpFnServerInfo,
): { registry: McpFnRegistry<unknown>; info: McpFnServerInfo } {
  if (
    value &&
    typeof value === "object" &&
    "registry" in value &&
    isRegistryExport((value as { registry: unknown }).registry) &&
    "info" in value &&
    (value as { info?: McpFnServerInfo }).info?.name &&
    (value as { info?: McpFnServerInfo }).info?.version
  ) {
    return {
      registry: (value as { registry: McpFnRegistry<unknown> }).registry,
      info: (value as { info: McpFnServerInfo }).info,
    };
  }
  if (isRegistryExport(value)) {
    if (!info) throw new Error("A registry source requires --name and --version");
    return { registry: value, info };
  }
  throw new Error("test-profiles requires a McpFn server, declaration, or registry export");
}
