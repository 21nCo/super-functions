#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createOutput, createScaffold, redactValue } from "@clifn/core";
import {
  DevFnConfigError,
  discoverProject,
  loadTrustedDevFnConfig,
  renderDevFnConfig,
  resolveContainedPath,
  resolveDevFnManifestPath,
  trustProject,
} from "@devfn/config";
import { DevFnError, DevFnOrchestrator } from "@devfn/core";
import { FilePortRegistry, renderPortInventory } from "@devfn/ports";
import { defaultStateDir } from "@devfn/config";

interface ParsedArgs {
  command: string;
  positionals: string[];
  json: boolean;
  yes: boolean;
  trust: boolean;
  configPath?: string;
  profile?: string;
  stateDir?: string;
  output?: string;
  tail?: number;
  allowPublic: boolean;
}

export interface CliOptions { cwd?: string; env?: NodeJS.ProcessEnv; stdout?: (text: string) => void; stderr?: (text: string) => void }

const HELP = `DevFn — portable local development environments

Usage: devfn <command> [options]

Commands:
  init                 Inspect a repository and preview or write devfn.config.ts
  up                   Reserve ports and start the selected profile
  down                 Stop only this worktree instance
  restart              Restart this worktree instance
  status               Show processes, services, ports, and health
  logs [name]          Show process or Compose logs
  doctor               Diagnose runtimes, Docker, ports, leases, and proxy
  ports [gc|report]    Inspect, reconcile, collect, or report port state
  url [name]           Print resolved local URLs

Options:
  --profile <name>     Select a named profile
  --config <path>      Use an explicit manifest
  --json               Emit one machine-readable JSON value
  --trust              Trust the current manifest digest before loading it
  --allow-public       Confirm processes or ports declared as public exposure
  --yes                Confirm devfn init writes
  --state-dir <path>   Override machine state (primarily for testing)
  --output <path>      Write a ports report
  --tail <count>       Limit log lines
`;

function parse(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const values: Record<string, string | boolean> = {};
  const takesValue = new Set(["--profile", "--config", "--state-dir", "--output", "--tail"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positionals.push(token); continue; }
    if (takesValue.has(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new DevFnError("DEVFN_RUNTIME_INVALID", `${token} requires a value.`);
      values[token] = value; index += 1;
    } else if (["--json", "--yes", "--trust", "--allow-public", "--help"].includes(token)) values[token] = true;
    else throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unknown option ${token}.`);
  }
  return {
    command: values["--help"] ? "help" : positionals.shift() ?? "help",
    positionals,
    json: values["--json"] === true,
    yes: values["--yes"] === true,
    trust: values["--trust"] === true,
    allowPublic: values["--allow-public"] === true,
    ...(typeof values["--profile"] === "string" ? { profile: values["--profile"] } : {}),
    ...(typeof values["--config"] === "string" ? { configPath: values["--config"] } : {}),
    ...(typeof values["--state-dir"] === "string" ? { stateDir: values["--state-dir"] } : {}),
    ...(typeof values["--output"] === "string" ? { output: values["--output"] } : {}),
    ...(typeof values["--tail"] === "string" ? { tail: Number(values["--tail"]) } : {}),
  };
}

function errorPayload(error: unknown): { code: string; message: string; details?: unknown } {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    return { code: typeof candidate.code === "string" && candidate.code.startsWith("DEVFN_") ? candidate.code : "DEVFN_FAILED", message: typeof candidate.message === "string" ? candidate.message : String(error), ...(candidate.details === undefined ? {} : { details: redactValue(candidate.details) }) };
  }
  return { code: "DEVFN_FAILED", message: String(error) };
}

async function trustedConfig(args: ParsedArgs, cwd: string, stateDir: string) {
  const manifest = await resolveDevFnManifestPath({ cwd, configPath: args.configPath });
  if (args.trust) await trustProject(manifest.root, manifest.path, stateDir);
  try { return await loadTrustedDevFnConfig({ cwd, configPath: manifest.path, stateDir }); }
  catch (error) {
    if (error instanceof DevFnConfigError) throw error;
    if (error instanceof Error && error.message.startsWith("DevFn manifest is not trusted:")) {
      throw new DevFnError("DEVFN_MANIFEST_UNTRUSTED", `Manifest ${manifest.path} can define lifecycle commands and is not trusted. Review it, then rerun with --trust.`);
    }
    throw error;
  }
}

async function initCommand(args: ParsedArgs, cwd: string): Promise<Record<string, unknown>> {
  const configName = args.configPath ?? "devfn.config.ts";
  if (path.extname(configName) !== ".ts") throw new DevFnConfigError("DEVFN_CONFIG_INVALID", `devfn init can only generate a TypeScript manifest; ${configName} must end in .ts.`);
  try { await resolveDevFnManifestPath({ cwd, configPath: args.configPath }); throw new DevFnConfigError("DEVFN_CONFIG_INVALID", "A DevFn manifest already exists; init will not overwrite it."); }
  catch (error) { if (!(error instanceof DevFnConfigError) || error.code !== "DEVFN_CONFIG_NOT_FOUND") throw error; }
  const discovery = await discoverProject(cwd);
  const content = renderDevFnConfig(discovery.config, discovery.findings);
  if (!args.yes) return { ok: true, written: false, preview: content, findings: discovery.findings, confirmationRequired: "Review the preview, then rerun devfn init --yes." };
  const scaffold = createScaffold();
  await scaffold.apply([{ kind: "write-file", path: configName, content, ifExists: "error" }], { cwd });
  const ignorePath = path.join(cwd, ".gitignore");
  const ignore = await readFile(ignorePath, "utf8").catch(() => "");
  if (!ignore.split(/\r?\n/).includes(".devfn/")) await writeFile(ignorePath, `${ignore}${ignore.endsWith("\n") || ignore.length === 0 ? "" : "\n"}.devfn/\n`, "utf8");
  return { ok: true, written: true, manifest: path.join(cwd, configName), findings: discovery.findings };
}

type LoadedConfig = Awaited<ReturnType<typeof trustedConfig>>;

async function portsCommand(args: ParsedArgs, cwd: string, stateDir: string, loaded: LoadedConfig): Promise<unknown> {
  const registry = new FilePortRegistry(path.join(stateDir, "registry.json"));
  const action = args.positionals[0];
  if (action === "gc") { await registry.reconcile(); return { ok: true, removed: await registry.gc() }; }
  if (action !== undefined && action !== "report") throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unknown ports action ${action}. Expected gc or report.`);
  const state = await registry.reconcile();
  if (action === undefined) return { ok: true, revision: state.revision, allocations: state.allocations.filter((item) => item.state !== "released") };
  const { loadDevFnPolicy } = await import("@devfn/config");
  const { renderPolicyInventory } = await import("@devfn/ports");
  const policy = await loadDevFnPolicy(loaded.root, loaded.config.policy);
  const report = `${renderPolicyInventory(policy?.policy ?? null)}\n${renderPortInventory(state)}`;
  const reportPath = args.output ? await resolveContainedPath(cwd, args.output, "--output") : undefined;
  if (reportPath) await writeFile(reportPath, report, { encoding: "utf8", mode: 0o600 });
  return { ok: true, report, ...(reportPath ? { output: reportPath } : {}) };
}

async function urlCommand(args: ParsedArgs, orchestrator: DevFnOrchestrator, loaded: LoadedConfig): Promise<unknown> {
  const status = await orchestrator.status({ config: loaded.config, root: loaded.root }) as { urls?: Record<string, string> };
  const name = args.positionals[0];
  if (!name) return { ok: true, urls: status.urls ?? {} };
  const url = status.urls?.[name];
  if (!url) throw new DevFnError("DEVFN_URL_NOT_FOUND", `No HTTP or proxy URL is resolved for ${name}. Inspect devfn ports for its transport allocation.`);
  return { ok: true, name, url };
}

async function executeCommand(args: ParsedArgs, cwd: string, stateDir: string, loaded: LoadedConfig): Promise<unknown> {
  const orchestrator = new DevFnOrchestrator();
  const lifecycle = { config: loaded.config, root: loaded.root, stateDir };
  const handlers: Record<string, () => Promise<unknown>> = {
    up: async () => await orchestrator.up({ ...lifecycle, profile: args.profile, allowPublic: args.allowPublic }),
    down: async () => await orchestrator.down(lifecycle),
    restart: async () => {
      await orchestrator.down(lifecycle).catch((error) => { if (!(error instanceof DevFnError) || error.code !== "DEVFN_NOT_RUNNING") throw error; });
      return await orchestrator.up({ ...lifecycle, profile: args.profile, allowPublic: args.allowPublic });
    },
    status: async () => await orchestrator.status(lifecycle),
    doctor: async () => await orchestrator.doctor({ ...lifecycle, profile: args.profile }),
    logs: async () => await orchestrator.logs({ config: loaded.config, root: loaded.root, name: args.positionals[0], tail: args.tail }),
    ports: async () => await portsCommand(args, cwd, stateDir, loaded),
    url: async () => await urlCommand(args, orchestrator, loaded),
  };
  const handler = Object.prototype.hasOwnProperty.call(handlers, args.command) ? handlers[args.command] : undefined;
  if (!handler) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unknown command ${args.command}.`);
  return await handler();
}

function renderResult(args: ParsedArgs, result: unknown, output: ReturnType<typeof createOutput>): void {
  if (args.json) { output.json(redactValue(result)); return; }
  if (args.command === "logs" && result && typeof result === "object") {
    for (const [name, log] of Object.entries(result)) output.info(`${name}\n${log}`);
    return;
  }
  if (args.command === "url") {
    const value = result as { url?: string | null; urls?: Record<string, string> };
    for (const url of value.url ? [value.url] : Object.values(value.urls ?? {})) output.info(url);
    return;
  }
  if (args.command === "doctor") {
    for (const diagnostic of (result as { diagnostics: Array<{ severity: string; code: string; message: string }> }).diagnostics) output[diagnostic.severity === "error" ? "error" : diagnostic.severity === "warning" ? "warn" : "info"](`${diagnostic.code}: ${diagnostic.message}`);
    return;
  }
  output.success(`${args.command} completed.`, result);
}

export async function runCli(argv: readonly string[], options: CliOptions = {}): Promise<number> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let args: ParsedArgs;
  try { args = parse(argv); } catch (error) {
    const output = createOutput({ mode: argv.includes("--json") ? "json" : "text", stdout: options.stdout, stderr: options.stderr, color: false });
    const failure = errorPayload(error); argv.includes("--json") ? output.json({ ok: false, error: failure }) : output.error(`${failure.code}: ${failure.message}`); return 1;
  }
  const output = createOutput({ mode: args.json ? "json" : "text", stdout: options.stdout, stderr: options.stderr, color: false });
  const stateDir = path.resolve(args.stateDir ?? defaultStateDir(options.env));
  try {
    if (args.command === "help") { if (args.json) output.json({ ok: true, help: HELP }); else options.stdout ? options.stdout(HELP) : process.stdout.write(HELP); return 0; }
    if (args.command === "init") {
      const result = await initCommand(args, cwd); if (args.json) output.json(result); else { if (!result.written) output.info(String(result.preview)); output.success(result.written ? `Created ${result.manifest}` : String(result.confirmationRequired)); } return 0;
    }
    const loaded = await trustedConfig(args, cwd, stateDir);
    const result = await executeCommand(args, cwd, stateDir, loaded);
    renderResult(args, result, output);
    return args.command === "doctor" && !(result as { ok?: boolean }).ok ? 1 : 0;
  } catch (error) {
    const failure = errorPayload(error);
    if (args.json) output.json({ ok: false, error: failure }); else output.error(`${failure.code}: ${failure.message}`);
    return 1;
  }
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) process.exitCode = await runCli(process.argv.slice(2));
