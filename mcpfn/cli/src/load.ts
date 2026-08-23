import { existsSync } from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import {
  createManifest,
  validateManifest,
  type McpFnManifest,
  type McpFnRegistry,
  type McpFnServer,
  type McpFnServerInfo,
} from "@mcpfn/core";
import type { McpFnScenario } from "@mcpfn/testing";

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

export async function loadManifestSource(
  file: string,
  cwd = process.cwd(),
  info?: McpFnServerInfo,
): Promise<{ manifest: McpFnManifest; server?: McpFnServer<unknown> }> {
  const value = await loadModule(file, cwd);
  // Use the public surface instead of instanceof: a global CLI and the target
  // project commonly load separate physical copies of @mcpfn/core.
  if (isServerExport(value)) {
    return { manifest: validateManifest(value.manifest()), server: value };
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
  if (!Array.isArray(value)) {
    throw new Error("Scenario module must default-export an array");
  }
  for (const [index, scenario] of value.entries()) {
    if (
      !scenario ||
      typeof scenario !== "object" ||
      typeof (scenario as { name?: unknown }).name !== "string" ||
      typeof (scenario as { tool?: unknown }).tool !== "string"
    ) {
      throw new Error(`Invalid scenario at index ${index}`);
    }
  }
  return value as McpFnScenario[];
}
