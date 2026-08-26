import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createContext, Script } from "node:vm";

import { ConfigLoaderError, loadConfig } from "@clifn/core";
import ts from "typescript";

import { DevFnConfigError } from "./errors.js";
import { resolveContainedPath } from "./paths.js";
import { validateDevFnConfig, validateDevFnPolicy } from "./schema.js";
import { defaultStateDir, readTrustedManifest } from "./trust.js";
import type { DevFnConfig, DevFnPolicy } from "./types.js";

export const DEVFN_CONFIG_CANDIDATES = [
  "devfn.config.ts",
  "devfn.config.js",
  "devfn.config.mjs",
  "devfn.config.cjs",
  "devfn.config.json",
] as const;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findDevFnRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    for (const candidate of DEVFN_CONFIG_CANDIDATES) {
      if (await exists(path.join(current, candidate))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `No DevFn manifest found from ${start}.`);
    }
    current = parent;
  }
}

export async function resolveDevFnManifestPath(options: { cwd?: string; configPath?: string } = {}): Promise<{ root: string; path: string }> {
  if (options.configPath) {
    const resolved = path.resolve(options.cwd ?? process.cwd(), options.configPath);
    if (!await exists(resolved)) throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `Config file not found: ${resolved}`);
    return { root: path.dirname(resolved), path: resolved };
  }
  const root = await findDevFnRoot(options.cwd);
  for (const candidate of DEVFN_CONFIG_CANDIDATES) {
    const resolved = path.join(root, candidate);
    if (await exists(resolved)) return { root, path: resolved };
  }
  throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `No DevFn manifest found from ${options.cwd ?? process.cwd()}.`);
}

export async function loadDevFnConfig(options: { cwd?: string; configPath?: string } = {}): Promise<{ config: DevFnConfig; path: string; root: string }> {
  try {
    const resolved = await resolveDevFnManifestPath(options);
    const root = resolved.root;
    const loaded = await loadConfig<DevFnConfig>({
      cwd: root,
      configPath: resolved.path,
      candidates: DEVFN_CONFIG_CANDIDATES,
      exportNames: ["config", "devfnConfig"],
      validate: validateDevFnConfig,
    });
    return { ...loaded, root };
  } catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    if (error instanceof ConfigLoaderError) {
      throw new DevFnConfigError(
        error.code === "CLIFN_CONFIG_NOT_FOUND" ? "DEVFN_CONFIG_NOT_FOUND" : "DEVFN_CONFIG_INVALID",
        error.message,
      );
    }
    throw error;
  }
}

export async function loadTrustedDevFnConfig(options: { cwd?: string; configPath?: string; stateDir?: string } = {}): Promise<{ config: DevFnConfig; path: string; root: string }> {
  const resolved = await resolveDevFnManifestPath(options);
  const snapshot = await readTrustedManifest(resolved.root, resolved.path, options.stateDir ?? defaultStateDir());
  const source = snapshot.bytes.toString("utf8");
  if (resolved.path.endsWith(".json")) {
    try { return { config: validateDevFnConfig(JSON.parse(source)), path: resolved.path, root: resolved.root }; }
    catch (error) {
      if (error instanceof DevFnConfigError) throw error;
      throw new DevFnConfigError("DEVFN_CONFIG_INVALID", `Unable to parse trusted JSON manifest ${resolved.path}.`);
    }
  }
  if (hasExternalModuleSyntax(source)) {
    throw new DevFnConfigError("DEVFN_CONFIG_INVALID", "Executable DevFn manifests must be self-contained; imports and require() are not permitted.");
  }
  try {
    return { config: validateDevFnConfig(evaluateTrustedManifest(source, resolved.path)), path: resolved.path, root: resolved.root };
  } catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    throw new DevFnConfigError("DEVFN_CONFIG_INVALID", `Unable to evaluate trusted manifest ${resolved.path} in the restricted context.`);
  }
}

function evaluateTrustedManifest(source: string, filename: string): unknown {
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: false },
  });
  const diagnostic = transpiled.diagnostics?.find((item) => item.category === ts.DiagnosticCategory.Error);
  if (diagnostic) throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  const context = createContext(Object.create(null), { name: "devfn-trusted-manifest", codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
  const serialized = new Script(`(() => { const module = { exports: {} }; const exports = module.exports;\n${transpiled.outputText}\nconst value = module.exports; return JSON.stringify(value?.default ?? value?.config ?? value?.devfnConfig ?? value); })()`, { filename }).runInContext(context, { timeout: 1000 });
  if (typeof serialized !== "string") throw new Error("Trusted manifest did not export a serializable configuration.");
  return JSON.parse(serialized);
}

function hasExternalModuleSyntax(source: string): boolean {
  const file = ts.createSourceFile("devfn.config.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let forbidden = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || (ts.isExportDeclaration(node) && Boolean(node.moduleSpecifier))) forbidden = true;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) forbidden = true;
    if (ts.isPropertyAccessExpression(node) && node.name.text === "require") forbidden = true;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === "require") forbidden = true;
    if (!forbidden) ts.forEachChild(node, visit);
  };
  visit(file);
  return forbidden;
}

export async function loadDevFnPolicy(root: string, configuredPath?: string): Promise<{ policy: DevFnPolicy; path: string } | null> {
  const candidate = configuredPath ?? "devfn.policy.json";
  try {
    const policyPath = await resolveContainedPath(root, candidate, "policy");
    if (!await exists(policyPath)) {
      if (configuredPath) throw new DevFnConfigError("DEVFN_CONFIG_NOT_FOUND", `Configured policy file not found: ${policyPath}.`, "policy");
      return null;
    }
    const raw = await readFile(policyPath, "utf8");
    return { policy: validateDevFnPolicy(JSON.parse(raw)), path: policyPath };
  } catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    throw new DevFnConfigError("DEVFN_CONFIG_INVALID", `Unable to read or parse policy ${candidate}.`);
  }
}
