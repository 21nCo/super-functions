#!/usr/bin/env node
import fs from "node:fs/promises";
import { fork } from "node:child_process";
import { publishOwnedArtifacts } from "./owned-artifacts.js";
import path from "node:path";
import cac from "cac";
import chokidar from "chokidar";
import pc from "picocolors";
import {
  buildLlmsTxtArtifacts,
  buildManifest,
  buildSearchIndex,
  compileMarkdown,
  createNamedCollection,
  createDiagnostic,
  diagnosticsFromUnknownError,
  formatDiagnosticsForCli,
  hasErrorDiagnostics,
  loadDocsConfig,
  getDocsConfigWatchRoots,
  redactDiagnostics,
  type BuildLlmsFullTxtOptions,
  type DocsCompatPreset,
  type DocsConfig,
  type DocsDiagnostic,
  type DocsManifest,
} from "@docsfn/core";
import type { DocsProviderWatchMetadata } from "@docsfn/core";
import type { DocsSearchArtifact } from "@docsfn/core";
import { FsContentProvider } from "@docsfn/provider-fs";
import { migrateDocusaurus } from "./migrate-docusaurus";

const cli = cac("docsfn");

interface BuildCommandOptions {
  root?: string;
  out?: string;
  outDir?: string;
  config?: string;
  watchRoot?: string[];
}

interface LlmsCommandOptions extends BuildCommandOptions {
  static?: string;
  staticDir?: string;
  embedOpenapi?: boolean;
  blog?: boolean;
}

interface DocusaurusMigrateCommandOptions {
  source?: string;
  out?: string;
  outDir?: string;
  docsDir?: string;
  pagesDir?: string;
  changelogDir?: string;
  staticDir?: string;
  sidebars?: string;
  sidebarId?: string;
  docsBasePath?: string;
  pagesBasePath?: string;
  changelogBasePath?: string;
  oldDocsBasePath?: string;
  oldPagesBasePath?: string;
  oldChangelogBasePath?: string;
  fromOrigin?: string;
  toOrigin?: string;
  onlySidebarDocs?: boolean;
  dryRun?: boolean;
}

interface PipelineInput {
  cwd: string;
  configPath?: string;
  changedPaths?: string[];
}

interface DocsCompatReport {
  schemaVersion: 1;
  preset: DocsCompatPreset;
  transformedFiles: Array<{
    sourceId: string;
    transforms: string[];
  }>;
  unsupportedSyntax: DocsDiagnostic[];
}

interface PipelineResult {
  cwd: string;
  config?: DocsConfig;
  manifest?: DocsManifest;
  searchArtifact?: DocsSearchArtifact;
  diagnostics: DocsDiagnostic[];
  compatReport: DocsCompatReport;
  invalidatedPaths: string[];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "en", {
    sensitivity: "variant",
    numeric: true,
  });
}

function stableSortDiagnostics(diagnostics: DocsDiagnostic[]): DocsDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftKey = `${left.severity}:${left.code}:${left.message}`;
    const rightKey = `${right.severity}:${right.code}:${right.message}`;
    return compareStrings(leftKey, rightKey);
  });
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function resolveOutDirectory(input: BuildCommandOptions, cwd: string): string {
  const outValue = input.outDir ?? input.out ?? ".docsfn";
  return path.isAbsolute(outValue) ? outValue : path.resolve(cwd, outValue);
}

function createProvider(config: DocsConfig, cwd: string): FsContentProvider {
  return new FsContentProvider({
    root: cwd,
    docsDir: config.content.docsDir,
    pagesDir: config.content.pagesDir,
    blogDir: config.content.blogDir,
    apiDir: config.content.apiDir,
    assetsDir: config.content.assetsDir,
  });
}

async function loadConfig(cwd: string, configPath?: string): Promise<DocsConfig> {
  return loadDocsConfig({
    cwd,
    configPath,
  });
}

function resolveCollectionDirectories(
  config: DocsConfig,
  cwd: string
): Record<string, string[]> {
  const root = path.isAbsolute(config.content.root)
    ? path.resolve(config.content.root)
    : path.resolve(cwd, config.content.root);
  const directories = (value: string | string[] | undefined, fallback: string): string[] =>
    (Array.isArray(value) ? value : [value ?? fallback]).map((directory) =>
      path.resolve(root, directory)
    );
  const collectionDirectories: Record<string, string[]> = {
    docs: directories(config.content.docsDir, "content/docs"),
    pages: directories(config.content.pagesDir, "pages"),
    blog: directories(config.content.blogDir, "blog"),
    api: directories(config.content.apiDir, "api"),
    assets: directories(config.content.assetsDir, "public"),
  };
  for (const [collectionId, collection] of Object.entries(config.collections ?? {})) {
    collectionDirectories[createNamedCollection(collectionId)] = [
      path.resolve(root, collection.dir),
    ];
  }
  return collectionDirectories;
}

function computeInvalidatedPaths(input: {
  cwd: string;
  config?: DocsConfig;
  configPath?: string;
  changedPaths?: string[];
}): string[] {
  if (!input.changedPaths || input.changedPaths.length === 0) {
    return [];
  }

  const normalizedCwd = path.resolve(input.cwd);
  const directories = input.config
    ? resolveCollectionDirectories(input.config, normalizedCwd)
    : {};
  const configFiles = [
    path.resolve(normalizedCwd, "docsfn.config.ts"),
    path.resolve(normalizedCwd, "docsfn.config.mjs"),
    path.resolve(normalizedCwd, "docsfn.config.js"),
  ];
  if (input.configPath) {
    configFiles.push(path.resolve(normalizedCwd, input.configPath));
  }

  const invalidated = new Set<string>();

  for (const rawPath of input.changedPaths) {
    const absolutePath = path.resolve(rawPath);

    if (configFiles.includes(absolutePath)) {
      invalidated.add("config");
      continue;
    }

    let matchedCollection = false;
    for (const [collection, collectionDirectories] of Object.entries(directories)) {
      for (const directory of collectionDirectories) {
        const absoluteDirectory = path.resolve(directory);
        if (
          absolutePath === absoluteDirectory ||
          absolutePath.startsWith(`${absoluteDirectory}${path.sep}`)
        ) {
          const relative = normalizePath(path.relative(absoluteDirectory, absolutePath));
          invalidated.add(`${collection}:${relative || "*"}`);
          matchedCollection = true;
          break;
        }
      }
      if (matchedCollection) {
        break;
      }
    }

    if (!matchedCollection) {
      const relativeToRoot = path.relative(normalizedCwd, absolutePath);
      if (!relativeToRoot.startsWith("..")) {
        invalidated.add(`path:${normalizePath(relativeToRoot)}`);
      } else {
        invalidated.add(`path:${normalizePath(absolutePath)}`);
      }
    }
  }

  return [...invalidated].sort(compareStrings);
}

function createCompatReport(input: {
  preset: DocsCompatPreset;
  diagnostics: DocsDiagnostic[];
  transformedFiles?: Array<{ sourceId: string; transforms: string[] }>;
}): DocsCompatReport {
  return {
    schemaVersion: 1,
    preset: input.preset,
    transformedFiles: input.transformedFiles ?? [],
    unsupportedSyntax: input.diagnostics.filter(
      (diagnostic) => diagnostic.code === "DOCS_COMPAT_UNSUPPORTED"
    ),
  };
}

function compileManifestSources(
  manifest: DocsManifest,
  preset: DocsCompatPreset,
  diagnostics: DocsDiagnostic[]
): Array<{ sourceId: string; transforms: string[] }> {
  const transformedFiles: Array<{ sourceId: string; transforms: string[] }> = [];
  const entries = [
    ...Object.values(manifest.pages).map((page) => ({
      sourceId: page.id,
      source: page.body,
      sourcePath: page.id,
    })),
    ...Object.values(manifest.posts).map((post) => ({
      sourceId: post.id,
      source: post.body,
      sourcePath: post.id,
    })),
  ];

  for (const entry of entries) {
    try {
      // buildManifest has already applied the provider source trust policy, including path allowlists.
      const compiled = compileMarkdown({
        allowRawHtml: true,
        source: entry.source,
        sourcePath: entry.sourcePath,
        compatPreset: preset,
      });
      if (compiled.transformedSource !== entry.source) {
        transformedFiles.push({
          sourceId: entry.sourceId,
          transforms: [preset],
        });
      }
      diagnostics.push(...compiled.diagnostics);
    } catch (error) {
      diagnostics.push(
        ...diagnosticsFromUnknownError(error, {
          code: "DOCS_MDX_COMPILE_FAILED",
          message: `failed to compile ${entry.sourceId}`,
        })
      );
    }
  }

  return transformedFiles;
}

// The CLI cannot receive the host's route classifier. Public exports must
// therefore omit every route in mixed mode; hosts can use the programmatic API.
function publicArtifactClassifier(config?: DocsConfig): ((route: string) => boolean) | undefined {
  return config?.auth?.enabled && config.auth.mode === "mixed" ? () => true : undefined;
}

async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const diagnostics: DocsDiagnostic[] = [];
  let config: DocsConfig | undefined;
  let manifest: DocsManifest | undefined;
  let searchArtifact: DocsSearchArtifact | undefined;
  let transformedFiles: Array<{ sourceId: string; transforms: string[] }> = [];

  try {
    config = await loadConfig(input.cwd, input.configPath);
  } catch (error) {
    diagnostics.push(
      ...diagnosticsFromUnknownError(error, {
        code: "DOCS_CONFIG_INVALID",
        message: "failed to load docsfn config",
      })
    );
  }

  if (config) {
    if (publicArtifactClassifier(config)) diagnostics.push(createDiagnostic({
      code: "DOCS_CONFIG_UNSUPPORTED", severity: "warning",
      message: "Mixed-mode CLI search and LLM artifacts omit all routes because the host route classifier is unavailable. Use the programmatic artifact API with isRoutePrivate to publish selected public routes.",
    }));
    const provider = createProvider(config, input.cwd);

    try {
      manifest = await buildManifest(provider, config);
    } catch (error) {
      diagnostics.push(
        ...diagnosticsFromUnknownError(error, {
          code: "DOCS_ARTIFACT_INVALID",
          message: "failed to build docs manifest",
        })
      );
    }

    if (manifest) {
      const preset = config.compat?.preset ?? "none";
      transformedFiles = compileManifestSources(manifest, preset, diagnostics);
      try {
        searchArtifact = await buildSearchIndex(manifest, {
          search: config.search,
          auth: config.auth,
          isRoutePrivate: publicArtifactClassifier(config),
        });
        diagnostics.push(...searchArtifact.diagnostics);
      } catch (error) {
        diagnostics.push(
          ...diagnosticsFromUnknownError(error, {
            code: "DOCS_SEARCH_BUILD_FAILED",
            message: "search artifact build failed",
          })
        );
      }
    }
  }

  const invalidatedPaths = computeInvalidatedPaths({
    cwd: input.cwd,
    config,
    configPath: input.configPath,
    changedPaths: input.changedPaths,
  });

  if (invalidatedPaths.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: "DOCS_ARTIFACT_INVALID",
        severity: "info",
        message: `dev rebuild invalidated ${invalidatedPaths.length} path(s)`,
        details: {
          invalidatedPaths,
        },
      })
    );
  }

  const finalizedDiagnostics = stableSortDiagnostics(redactDiagnostics(diagnostics));
  const preset = config?.compat?.preset ?? "none";

  return {
    cwd: input.cwd,
    config,
    manifest: hasErrorDiagnostics(finalizedDiagnostics) ? undefined : manifest,
    searchArtifact: hasErrorDiagnostics(finalizedDiagnostics) ? undefined : searchArtifact,
    diagnostics: finalizedDiagnostics,
    compatReport: createCompatReport({
      preset,
      diagnostics: finalizedDiagnostics,
      transformedFiles,
    }),
    invalidatedPaths,
  };
}

async function writeArtifacts(outDir: string, result: PipelineResult): Promise<void> {
  const preserved = await publishOwnedArtifacts(outDir, ".docsfn-build-outputs.json", {
    "diagnostics.json": JSON.stringify(result.diagnostics, null, 2),
    "compat-report.json": JSON.stringify(result.compatReport, null, 2),
    "manifest.json": result.manifest ? JSON.stringify(result.manifest, null, 2) : undefined,
    "search.json": (result.config?.search?.enabled ?? true) && result.searchArtifact ? JSON.stringify(result.searchArtifact) : undefined,
  });
  if (preserved.length) console.warn(`Preserved unmanaged artifacts: ${preserved.join(", ")}`);
}

function printDiagnostics(diagnostics: DocsDiagnostic[]): void {
  if (diagnostics.length === 0) {
    console.log(pc.green("✔ No diagnostics reported"));
    return;
  }

  const lines = formatDiagnosticsForCli(diagnostics);
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = diagnostics[index];
    const line = lines[index] ?? "";
    const colorize =
      diagnostic.severity === "error"
        ? pc.red
        : diagnostic.severity === "warning"
          ? pc.yellow
          : pc.cyan;
    console.log(colorize(line));
  }
}

function printCommandSummary(command: string, result: PipelineResult): void {
  const total = result.diagnostics.length;
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  console.log(
    pc.blue(
      `ℹ ${command}: ${total} diagnostic(s) (${errors} errors, ${warnings} warnings)`
    )
  );

  if (result.invalidatedPaths.length > 0) {
    console.log(
      pc.dim(
        JSON.stringify(
          {
            event: "docsfn.dev.invalidate",
            invalidated: result.invalidatedPaths,
          },
          null,
          2
        )
      )
    );
  }
}

function isGeneratedWatchPath(pathname: string, outDir: string): boolean {
  const absolute = path.resolve(pathname);
  const name = path.basename(absolute);
  if (path.dirname(absolute) !== outDir) return false;
  return ["manifest.json", "search.json", "diagnostics.json", "compat-report.json", ".docsfn-build-outputs.json"].includes(name)
    || /^\.docsfn-artifact-[0-9a-f-]+\.tmp$/.test(name);
}

async function physicalWatchPath(pathname: string): Promise<string> {
  try {
    return await fs.realpath(pathname);
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    const parent = path.dirname(pathname);
    if (parent === pathname) return pathname;
    return path.join(await physicalWatchPath(parent), path.basename(pathname));
  }
}

async function resolveProviderWatchMetadata(
  config: DocsConfig,
  cwd: string
): Promise<DocsProviderWatchMetadata | undefined> {
  const provider = createProvider(config, cwd);
  if (typeof provider.watch !== "function") return undefined;

  try {
    const subscription = await provider.watch({
      config,
      onChange: () => undefined,
    });
    const metadata = subscription.metadata;
    await subscription.close();
    return metadata;
  } catch {
    return undefined;
  }
}

async function runValidateCommand(
  rootArg: string | undefined,
  options: BuildCommandOptions
): Promise<void> {
  const rootValue = options.root ?? rootArg ?? ".";
  const cwd = path.resolve(rootValue);

  const result = await runPipeline({
    cwd,
    configPath: options.config,
  });

  printDiagnostics(result.diagnostics);
  printCommandSummary("validate", result);

  process.exitCode = hasErrorDiagnostics(result.diagnostics) ? 1 : 0;
}

async function runBuildCommand(
  rootArg: string | undefined,
  options: BuildCommandOptions
): Promise<void> {
  const rootValue = options.root ?? rootArg ?? ".";
  const cwd = path.resolve(rootValue);
  const outDir = resolveOutDirectory(options, cwd);

  console.log(pc.blue("ℹ Building docs..."));
  const start = Date.now();

  const result = await runPipeline({
    cwd,
    configPath: options.config,
  });
  await writeArtifacts(outDir, result);

  printDiagnostics(result.diagnostics);
  printCommandSummary("build", result);

  if (!hasErrorDiagnostics(result.diagnostics) && result.searchArtifact) {
    console.log(
      pc.green(
        `✔ Built in ${Date.now() - start}ms (${result.searchArtifact.bytes} bytes search artifact)`
      )
    );
  }

  process.exitCode = hasErrorDiagnostics(result.diagnostics) ? 1 : 0;
}

interface DevPipelineReport extends Omit<PipelineResult, "config" | "manifest" | "searchArtifact"> {
  hasConfig: boolean;
  watchDirectories: string[];
}

async function runFreshPipeline(
  input: PipelineInput & { outDir: string },
  signal: AbortSignal
): Promise<DevPipelineReport> {
  return new Promise((resolve, reject) => {
    const child = fork(path.resolve(process.argv[1]), ["--docsfn-dev-worker"], {
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      signal,
      killSignal: "SIGKILL"
    });
    let report: DevPipelineReport | undefined;
    let workerError: Error | undefined;
    child.on("message", (message: any) => {
      if (message?.type === "docsfn.dev.result") report = message.report;
    });
    // Abort emits an error before close. Settle only after Node has reaped the
    // worker so dev shutdown cannot leave a live child or an orphan zombie.
    child.once("error", (error) => { workerError = error; });
    child.once("close", (code, exitSignal) => {
      if (workerError) reject(workerError);
      else if (code === 0 && report) resolve(report);
      else
        reject(new Error(`docsfn build process exited ${code ?? exitSignal} without completing`));
    });
    child.send({ type: "docsfn.dev.build", input }, (error) => {
      if (error) {
        workerError = error;
        child.kill("SIGKILL");
      }
    });
  });
}

async function runDevWorker(input: PipelineInput & { outDir: string }): Promise<void> {
  try {
    const result = await runPipeline(input);
    await writeArtifacts(input.outDir, result);
    const metadata = result.config
      ? await resolveProviderWatchMetadata(result.config, input.cwd)
      : undefined;
    const watchDirectories = metadata?.watchedDirectories?.length
      ? metadata.watchedDirectories.map((directory) => path.resolve(directory))
      : result.config
        ? Object.values(resolveCollectionDirectories(result.config, input.cwd)).flat()
        : [];
    // The config and its live values never leave this process. Send only the
    // completed diagnostic report and scalar watch directories after publication.
    const report: DevPipelineReport = {
      cwd: result.cwd,
      hasConfig: Boolean(result.config),
      watchDirectories,
      diagnostics: result.diagnostics,
      compatReport: result.compatReport,
      invalidatedPaths: result.invalidatedPaths
    };
    process.send!({ type: "docsfn.dev.result", report }, () => process.exit(0));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runDevCommand(
  rootArg: string | undefined,
  options: BuildCommandOptions
): Promise<void> {
  const cwd = path.resolve(options.root ?? rootArg ?? ".");
  const outDir = resolveOutDirectory(options, cwd);
  const watchRoots = options.watchRoot ?? [];
  const bootstrapRoots = () =>
    getDocsConfigWatchRoots({ cwd, configPath: options.config, watchRoots });
  // Chokidar may emit physical paths for symlinked roots (including macOS
  // /var). Match publisher files in both the requested and physical directory.
  let physicalOutDir = await physicalWatchPath(outDir);
  let explicitRoots = await Promise.all(
    watchRoots.map((root) => physicalWatchPath(path.resolve(cwd, root)))
  );
  const ignored = (pathname: string): boolean => {
    if (isGeneratedWatchPath(pathname, outDir) || isGeneratedWatchPath(pathname, physicalOutDir))
      return true;
    // Explicit roots can opt into dependency/build directories. Broad project
    // watches otherwise avoid package installs and framework/git output loops.
    const absolute = path.resolve(pathname);
    if (
      [...watchRoots.map((root) => path.resolve(cwd, root)), ...explicitRoots].some((base) => {
        return absolute === base || absolute.startsWith(base + path.sep);
      })
    )
      return false;
    return absolute
      .split(path.sep)
      .some((segment) =>
        ["node_modules", ".git", ".next", ".svelte-kit", ".turbo"].includes(segment)
      );
  };
  console.log(pc.blue("ℹ Starting docsfn dev..."));
  let activeTargets = new Set(await bootstrapRoots());
  // Watch lexical symlinks themselves, and subscribe to their physical targets
  // separately. Following links hides replacement of an already-watched link.
  // Initial enumeration on added roots queues a reconciliation build, covering
  // edits between the previous build and installation of the new subscription.
  const watcher = chokidar.watch([...activeTargets], {
    ignoreInitial: false, followSymlinks: false, ignored
  });
  let watcherInitialized = false;
  const controller = new AbortController();
  const pendingPaths = new Set<string>();
  let ready = false,
    building = false,
    stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeBuild: Promise<void> | undefined;
  let providerDirectories: string[] = [];

  async function refreshWatchTargets(report: DevPipelineReport): Promise<void> {
    physicalOutDir = await physicalWatchPath(outDir);
    explicitRoots = await Promise.all(watchRoots.map((root) => physicalWatchPath(path.resolve(cwd, root))));
    if (report.hasConfig) providerDirectories = report.watchDirectories;
    const physicalDirectories = await Promise.all(providerDirectories.map(physicalWatchPath));
    const nextTargets = new Set([...(await bootstrapRoots()), ...providerDirectories, ...physicalDirectories]);
    const removed = [...activeTargets].filter((target) => !nextTargets.has(target));
    const added = [...nextTargets].filter((target) => !activeTargets.has(target));
    if (removed.length) await watcher.unwatch(removed);
    if (added.length) watcher.add(added);
    activeTargets = nextTargets;
  }

  async function execute(command: string, changedPaths: string[]): Promise<void> {
    building = true;
    try {
      let report: DevPipelineReport;
      try {
        report = await runFreshPipeline(
          { cwd, configPath: options.config, changedPaths, outDir },
          controller.signal
        );
      } catch (error) {
        if (stopped) return;
        const diagnostics = redactDiagnostics(
          diagnosticsFromUnknownError(error, {
            code: "DOCS_ARTIFACT_INVALID",
            message: "fresh docsfn build process failed"
          })
        );
        report = {
          cwd,
          hasConfig: false,
          watchDirectories: [],
          diagnostics,
          compatReport: createCompatReport({ preset: "none", diagnostics }),
          invalidatedPaths: []
        };
        // A worker crash still invalidates publisher-owned successful artifacts.
        await writeArtifacts(outDir, report);
      }
      if (stopped) return;
      printDiagnostics(report.diagnostics);
      printCommandSummary(command, report);
      process.exitCode = hasErrorDiagnostics(report.diagnostics) ? 1 : 0;
      // Refresh even after errors, including retargeted config symlinks. Keep
      // the last successful provider directories until another config succeeds.
      await refreshWatchTargets(report);
    } finally {
      building = false;
      schedule();
    }
  }

  function schedule(): void {
    if (!ready || stopped || building || timer || !pendingPaths.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      const changedPaths = [...pendingPaths].sort(compareStrings);
      pendingPaths.clear();
      activeBuild = execute("dev:rebuild", changedPaths).catch((error) => {
        if (!stopped) {
          process.exitCode = 1;
          console.error(error instanceof Error ? error.message : String(error));
        }
      });
    }, 100);
  }
  watcher.on("all", (_event, changedPath) => {
    if (!watcherInitialized || stopped || ignored(changedPath)) return;
    const absolute = path.resolve(changedPath);
    pendingPaths.add(absolute);
    console.log(pc.dim(`Change detected: ${absolute}`));
    schedule();
  });
  watcher.on("error", (error) => {
    process.exitCode = 1;
    console.error(error);
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    controller.abort();
    void watcher
      .close()
      .then(() => activeBuild)
      .finally(() => process.exit(process.exitCode ?? 0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await new Promise<void>((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
    watcherInitialized = true;
    activeBuild = execute("dev:initial", []);
    await activeBuild;
    if (stopped) return;
    ready = true;
    console.log(pc.cyan(`ℹ Watching for changes in ${activeTargets.size} location(s)...`));
    schedule();
  } catch (error) {
    stopped = true;
    controller.abort();
    await watcher.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    throw error;
  }
}

async function runLlmsCommand(
  rootArg: string | undefined,
  options: LlmsCommandOptions
): Promise<void> {
  const rootValue = options.root ?? rootArg ?? ".";
  const cwd = path.resolve(rootValue);
  const staticDirValue = options.staticDir ?? options.static ?? "static";
  const staticDir = path.isAbsolute(staticDirValue)
    ? staticDirValue
    : path.resolve(cwd, staticDirValue);

  console.log(pc.blue("ℹ Generating llms.txt artifacts..."));
  const start = Date.now();

  try {
    const result = await runPipeline({
      cwd,
      configPath: options.config,
    });

    printDiagnostics(result.diagnostics);
    printCommandSummary("llms", result);

    if (hasErrorDiagnostics(result.diagnostics) || !result.manifest) {
      const preserved = await publishOwnedArtifacts(staticDir, ".docsfn-llms-outputs.json", { "llms.txt": undefined, "llms-full.txt": undefined });
      if (preserved.length) console.warn(`Preserved unmanaged artifacts: ${preserved.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const llmsOptions: BuildLlmsFullTxtOptions = {
      canonicalUrl: result.config?.site?.canonicalUrl,
      embedOpenApiSpec: options.embedOpenapi === true,
      includeBlog: options.blog !== false,
      auth: result.config?.auth,
      isRoutePrivate: publicArtifactClassifier(result.config),
    };

    const artifacts = buildLlmsTxtArtifacts(result.manifest, llmsOptions);
    await publishOwnedArtifacts(staticDir, ".docsfn-llms-outputs.json", {
      "llms.txt": artifacts.llmsTxt,
      "llms-full.txt": artifacts.llmsFullTxt,
    });

    const llmsTxtBytes = Buffer.byteLength(artifacts.llmsTxt, "utf8");
    const llmsFullTxtBytes = Buffer.byteLength(artifacts.llmsFullTxt, "utf8");

    console.log(
      pc.green(
        `✔ Wrote ${path.relative(cwd, path.join(staticDir, "llms.txt"))} (${llmsTxtBytes} bytes)`
      )
    );
    console.log(
      pc.green(
        `✔ Wrote ${path.relative(cwd, path.join(staticDir, "llms-full.txt"))} (${llmsFullTxtBytes} bytes)`
      )
    );
    console.log(pc.dim(`Generated in ${Date.now() - start}ms`));
  } catch (error) {
    try { await publishOwnedArtifacts(staticDir, ".docsfn-llms-outputs.json", { "llms.txt": undefined, "llms-full.txt": undefined }); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "LLM generation and owned-output cleanup failed"); }
    throw error;
  }
}

async function runDocusaurusMigrateCommand(
  sourceArg: string | undefined,
  options: DocusaurusMigrateCommandOptions
): Promise<void> {
  const source = path.resolve(options.source ?? sourceArg ?? ".");
  const targetValue = options.outDir ?? options.out ?? "docsfn-migration";
  const target = path.isAbsolute(targetValue) ? targetValue : path.resolve(process.cwd(), targetValue);

  console.log(pc.blue("ℹ Migrating Docusaurus content to docsfn..."));
  const start = Date.now();

  const result = await migrateDocusaurus({
    source,
    target,
    docsDir: options.docsDir,
    pagesDir: options.pagesDir,
    changelogDir: options.changelogDir,
    staticDir: options.staticDir,
    sidebarsPath: options.sidebars,
    sidebarId: options.sidebarId,
    docsBasePath: options.docsBasePath,
    pagesBasePath: options.pagesBasePath,
    changelogBasePath: options.changelogBasePath,
    oldDocsBasePath: options.oldDocsBasePath,
    oldPagesBasePath: options.oldPagesBasePath,
    oldChangelogBasePath: options.oldChangelogBasePath,
    fromOrigin: options.fromOrigin,
    toOrigin: options.toOrigin,
    onlySidebarDocs: options.onlySidebarDocs === true,
    dryRun: options.dryRun === true,
  });

  console.log(pc.green(`✔ Docs copied: ${result.docsCopied}`));
  console.log(pc.green(`✔ Pages copied: ${result.pagesCopied}`));
  console.log(pc.green(`✔ Changelog entries copied: ${result.changelogCopied}`));
  console.log(pc.green(`✔ Static assets copied: ${result.staticAssetsCopied}`));
  console.log(pc.green(`✔ Docs-local assets copied: ${result.docAssetsCopied}`));
  console.log(pc.green(`✔ meta.json files written: ${result.metaFilesWritten}`));
  console.log(pc.green(`✔ Redirects prepared: ${result.redirectsWritten}`));

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(pc.yellow(`⚠ ${warning}`));
    }
  }

  if (options.dryRun) {
    console.log(pc.dim("Dry run only; no files were written."));
  } else {
    console.log(pc.cyan(`ℹ Report: ${path.relative(process.cwd(), result.reportPath)}`));
  }

  console.log(pc.dim(`Migrated in ${Date.now() - start}ms`));
}

async function runMigrateCommand(
  kind: string | undefined,
  sourceArg: string | undefined,
  options: DocusaurusMigrateCommandOptions
): Promise<void> {
  if (kind !== "docusaurus") {
    console.error(pc.red(`Unknown migration kind: ${kind ?? "(missing)"}`));
    console.error(pc.dim("Supported migration kinds: docusaurus"));
    process.exitCode = 1;
    return;
  }

  await runDocusaurusMigrateCommand(sourceArg, options);
}

cli
  .command("validate [root]", "Validate docs configuration and content")
  .option("--root <dir>", "Root directory")
  .option("--config <path>", "Explicit docsfn config path")
  .action(async (root, options) => {
    await runValidateCommand(root, options as BuildCommandOptions);
  });

cli
  .command("build [root]", "Build the documentation")
  .option("--root <dir>", "Root directory")
  .option("--config <path>", "Explicit docsfn config path")
  .option("--out <dir>", "Output directory (legacy option)")
  .option("--out-dir <dir>", "Output directory")
  .action(async (root, options) => {
    await runBuildCommand(root, options as BuildCommandOptions);
  });

cli
  .command("dev [root]", "Start dev mode")
  .option("--watch-root <dir>", "Additional config dependency directory (repeatable)", { type: [String] })
  .option("--root <dir>", "Root directory")
  .option("--config <path>", "Explicit docsfn config path")
  .option("--out <dir>", "Output directory (legacy option)")
  .option("--out-dir <dir>", "Output directory")
  .action(async (root, options) => {
    await runDevCommand(root, options as BuildCommandOptions);
  });

cli
  .command("llms [root]", "Generate llms.txt and llms-full.txt for AI assistants")
  .option("--root <dir>", "Root directory")
  .option("--config <path>", "Explicit docsfn config path")
  .option("--static <dir>", "Output directory for static assets (legacy)")
  .option("--static-dir <dir>", "Output directory for static assets")
  .option("--embed-openapi", "Embed full OpenAPI JSON in llms-full.txt")
  .option("--no-blog", "Exclude blog posts from generated artifacts")
  .action(async (root, options) => {
    await runLlmsCommand(root, options as LlmsCommandOptions);
  });

cli
  .command("migrate <kind> [source]", "Migrate an existing docs site into docsfn content")
  .option("--source <dir>", "Docusaurus site root")
  .option("--out <dir>", "Target output directory (legacy option)")
  .option("--out-dir <dir>", "Target output directory")
  .option("--docs-dir <dir>", "Docusaurus docs directory", { default: "docs" })
  .option("--pages-dir <dir>", "Docusaurus product pages directory, e.g. src/pages/memotron")
  .option("--changelog-dir <dir>", "Docusaurus changelog/blog directory", { default: "blog" })
  .option("--static-dir <dir>", "Docusaurus static assets directory", { default: "static" })
  .option("--sidebars <path>", "Explicit Docusaurus sidebars.js/ts path")
  .option("--sidebar-id <id>", "Sidebar id to convert when multiple sidebars exist")
  .option("--docs-base-path <path>", "New docs route base", { default: "/docs" })
  .option("--pages-base-path <path>", "New pages route base, defaults to docs route base")
  .option("--changelog-base-path <path>", "New changelog route base", { default: "/changelog" })
  .option("--old-docs-base-path <path>", "Old Docusaurus docs route base", { default: "/" })
  .option("--old-pages-base-path <path>", "Old Docusaurus product pages route base")
  .option("--old-changelog-base-path <path>", "Old Docusaurus changelog/blog route base", { default: "/changelog" })
  .option("--from-origin <url>", "Old docs origin, e.g. https://docs.memotron.app")
  .option("--to-origin <url>", "New product origin, e.g. https://memotron.app")
  .option("--only-sidebar-docs", "Copy only docs referenced by the selected Docusaurus sidebar")
  .option("--dry-run", "Print summary without writing files")
  .action(async (kind, source, options) => {
    await runMigrateCommand(kind, source, options as DocusaurusMigrateCommandOptions);
  });

cli.help();
if (process.argv[2] === "--docsfn-dev-worker" && process.send) {
  process.once("message", (message: any) => {
    if (message?.type !== "docsfn.dev.build") process.exit(1);
    void runDevWorker(message.input);
  });
} else {
  cli.parse();
}
