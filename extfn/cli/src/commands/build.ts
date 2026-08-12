import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  ExtfnError,
  createExtfnError,
  type BrowserTarget,
  type ExtensionConfig,
  SUPPORTED_BROWSER_TARGETS,
} from '@extfn/core';
import {
  extfnVite,
  getTargetOutputDir,
  loadExtensionConfig,
} from '@extfn/vite';
import {
  createDiagnostic,
  redactValue,
} from '@clifn/core/diagnostics';
import { readStringEnv } from '@clifn/core/env';
import type { RunnerActionResult, RunnerContext } from '@clifn/core/runner';
import {
  createMetricsEmitter,
  createNamespacedEmitter,
  type MetricsEmitter,
} from '../metrics.js';
import {
  build as viteBuild,
  loadConfigFromFile,
  mergeConfig,
  type InlineConfig,
  type PluginOption,
  type UserConfig,
} from 'vite';

export interface BuildCommandOptions {
  config?: string;
  target?: string;
  metrics?: MetricsEmitter;
}

export interface LoadedCliExtensionConfig {
  configPath: string;
  configDir: string;
  extension: ExtensionConfig;
  targets: readonly BrowserTarget[];
}

export interface BuildCommandResult {
  configPath: string;
  configDir: string;
  rootDir: string;
  outDir: string;
  packageBaseName: string;
  extensionVersion: string;
  targets: readonly BrowserTarget[];
  outputDirs: Record<BrowserTarget, string>;
}

export interface SerializedCommandError {
  code: string;
  message: string;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

const SUPPORTED_TARGET_SET = new Set<string>(SUPPORTED_BROWSER_TARGETS);
const require = createRequire(import.meta.url);

export async function executeBuildCommand(
  options: BuildCommandOptions,
  ctx: RunnerContext
): Promise<RunnerActionResult> {
  try {
    const result = await buildExtension(options, ctx);

    ctx.output.success('Build completed.', {
      configPath: toRepoPath(ctx.cwd, result.configPath),
      targets: result.targets,
    });
    ctx.output.table({
      columns: ['target', 'outputDir'],
      rows: result.targets.map((target) => ({
        target,
        outputDir: toRepoPath(ctx.cwd, result.outputDirs[target]),
      })),
    });

    return {
      exitCode: 0,
      data: {
        ok: true,
        command: 'build',
        configPath: toRepoPath(ctx.cwd, result.configPath),
        outDir: toRepoPath(ctx.cwd, result.outDir),
        targets: result.targets,
        outputs: result.targets.map((target) => ({
          target,
          outputDir: toRepoPath(ctx.cwd, result.outputDirs[target]),
        })),
      },
    };
  } catch (error) {
    return reportCommandFailure(ctx, 'build', error);
  }
}

export async function buildExtension(
  options: BuildCommandOptions,
  ctx: Pick<RunnerContext, 'cwd' | 'output' | 'exec' | 'env'>
): Promise<BuildCommandResult> {
  const metrics = createNamespacedEmitter(
    'extfn.cli',
    options.metrics ?? createMetricsEmitter()
  );
  const loaded = await loadCliExtensionConfig(options, {
    cwd: ctx.cwd,
  });
  const userViteConfigPath = await findUserViteConfigPath(loaded.configDir);
  const viteConfig = await createCommandViteConfig(loaded, {
    command: 'build',
    mode: 'production',
  });

  metrics.track('build.start', {
    configPath: toRepoPath(ctx.cwd, loaded.configPath),
    targets: [...loaded.targets],
  });

  try {
    if (userViteConfigPath) {
      await runViteCliBuild(loaded, userViteConfigPath, ctx);
    } else {
      await viteBuild(viteConfig);
    }
  } catch (error) {
    metrics.track('build.failure', {
      configPath: toRepoPath(ctx.cwd, loaded.configPath),
      targets: [...loaded.targets],
      error: serializeCommandError(error, {
        configPath: toRepoPath(ctx.cwd, loaded.configPath),
        targets: [...loaded.targets],
      }),
    });
    throw error;
  }

  const rootDir = path.resolve(viteConfig.root ?? loaded.configDir);
  const outDir = resolveOutDir(rootDir, viteConfig.build?.outDir);
  const outputDirs = Object.fromEntries(
    loaded.targets.map((target) => [
      target,
      getTargetOutputDir(outDir, target, 'build'),
    ])
  ) as Record<BrowserTarget, string>;

  metrics.track('build.complete', {
    configPath: toRepoPath(ctx.cwd, loaded.configPath),
    outDir: toRepoPath(ctx.cwd, outDir),
    targets: [...loaded.targets],
  });

  return {
    configPath: loaded.configPath,
    configDir: loaded.configDir,
    rootDir,
    outDir,
    packageBaseName: slugifyPackageName(loaded.extension.name),
    extensionVersion: loaded.extension.version,
    targets: loaded.targets,
    outputDirs,
  };
}

export async function loadCliExtensionConfig(
  options: Pick<BuildCommandOptions, 'config' | 'target'>,
  context: {
    cwd: string;
  }
): Promise<LoadedCliExtensionConfig> {
  const loaded = await loadExtensionConfig(
    options.config ? path.resolve(context.cwd, options.config) : undefined
  );
  const requestedTargets = parseRequestedTargets(options.target);
  const targets = resolveSelectedTargets(loaded.config.targets, requestedTargets);

  return {
    configPath: loaded.configPath,
    configDir: path.dirname(loaded.configPath),
    extension: {
      ...loaded.config,
      targets,
    },
    targets,
  };
}

export function parseRequestedTargets(targetOption?: string): BrowserTarget[] | undefined {
  if (!targetOption) {
    return undefined;
  }

  const parsed = targetOption
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    return undefined;
  }

  for (const target of parsed) {
    if (!SUPPORTED_TARGET_SET.has(target)) {
      throw createExtfnError(
        'E_TARGET_UNSUPPORTED',
        `Unsupported target: ${target}`,
        {
          target,
          supportedTargets: [...SUPPORTED_BROWSER_TARGETS],
        }
      );
    }
  }

  return parsed as BrowserTarget[];
}

export function resolveSelectedTargets(
  configuredTargets: readonly BrowserTarget[],
  requestedTargets?: readonly BrowserTarget[]
): readonly BrowserTarget[] {
  if (!requestedTargets || requestedTargets.length === 0) {
    return [...configuredTargets];
  }

  const configuredTargetSet = new Set(configuredTargets);
  for (const target of requestedTargets) {
    if (!configuredTargetSet.has(target)) {
      throw createExtfnError(
        'E_TARGET_UNSUPPORTED',
        `Target is not configured in extfn.config.ts: ${target}`,
        {
          target,
          configuredTargets: [...configuredTargets],
        }
      );
    }
  }

  return [...requestedTargets];
}

export async function createCommandViteConfig(
  loaded: LoadedCliExtensionConfig,
  configEnv: {
    command: 'build' | 'serve';
    mode: string;
  }
): Promise<InlineConfig> {
  const userConfig = await loadUserViteConfig(loaded.configDir, configEnv);
  const normalizedUserConfig = normalizeUserConfigRoot(loaded.configDir, userConfig);
  const userPlugins = flattenPlugins(normalizedUserConfig.plugins).filter(
    (plugin) => getPluginName(plugin) !== 'extfn-vite'
  );
  const cleanedUserConfig: UserConfig = {
    ...normalizedUserConfig,
    plugins: userPlugins,
  };
  const rootDir = path.resolve(normalizedUserConfig.root ?? loaded.configDir);
  const combinedPlugins = uniquePlugins([
    ...userPlugins,
    ...flattenPlugins(
      extfnVite({
        configPath: loaded.configPath,
        extension: loaded.extension,
      }) as unknown as PluginOption[]
    ),
  ]);

  return mergeConfig(cleanedUserConfig, {
    configFile: false,
    clearScreen: false,
    root: rootDir,
    server: {
      strictPort: false,
      port: 0,
    },
    plugins: combinedPlugins,
  });
}

export function serializeCommandError(
  error: unknown,
  details?: Record<string, unknown>
): SerializedCommandError {
  if (error instanceof ExtfnError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      retryable: error.retryable,
      details: mergeDetails(error.details, details),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'EXTFN_CLI_FAILED',
      message: error.message || error.name,
      details: details ? redactRecord(details) : undefined,
    };
  }

  return {
    code: 'EXTFN_CLI_FAILED',
    message: typeof error === 'string' ? error : 'Unknown extfn CLI failure',
    details: details ? redactRecord(details) : undefined,
  };
}

export function reportCommandFailure(
  ctx: Pick<RunnerContext, 'cwd' | 'output'>,
  command: string,
  error: unknown,
  options: {
    exitCode?: number;
    details?: Record<string, unknown>;
  } = {}
): RunnerActionResult {
  const serialized = serializeCommandError(error, options.details);
  const diagnostic = createDiagnostic({
    code: serialized.code,
    severity: 'error',
    message: serialized.message,
    path:
      typeof serialized.details?.configPath === 'string'
        ? String(serialized.details.configPath)
        : undefined,
    details: serialized.details,
  });

  ctx.output.error(`${command} failed: ${serialized.message}`, {
    code: serialized.code,
    ...(serialized.status !== undefined ? { status: serialized.status } : {}),
    ...(serialized.retryable !== undefined
      ? { retryable: serialized.retryable }
      : {}),
    ...(serialized.details ? serialized.details : {}),
  });

  return {
    exitCode: options.exitCode ?? 1,
    diagnostics: [diagnostic],
    data: {
      ok: false,
      error: {
        ...serialized,
        details: serialized.details,
      },
    },
  };
}

export function toRepoPath(cwd: string, targetPath: string): string {
  const relative = path.relative(cwd, targetPath);
  return relative.length === 0 ? '.' : relative.replace(/\\/g, '/');
}

export function readPackageOutDir(env: NodeJS.ProcessEnv): string {
  return readStringEnv('EXTFN_PACKAGE_OUT_DIR', {
    defaultValue: 'dist/packages',
    env,
  });
}

function resolveOutDir(rootDir: string, outDir: string | undefined): string {
  if (!outDir) {
    return path.resolve(rootDir, 'dist');
  }

  return path.isAbsolute(outDir) ? outDir : path.resolve(rootDir, outDir);
}

function slugifyPackageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'extfn-package';
}

async function loadUserViteConfig(
  configDir: string,
  configEnv: {
    command: 'build' | 'serve';
    mode: string;
  }
): Promise<UserConfig> {
  const loaded = await loadConfigFromFile(configEnv, undefined, configDir);
  return (loaded?.config ?? {}) as UserConfig;
}

async function findUserViteConfigPath(
  configDir: string
): Promise<string | undefined> {
  const candidates = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
  ];

  for (const candidate of candidates) {
    const absolutePath = path.join(configDir, candidate);
    try {
      await fs.access(absolutePath);
      return absolutePath;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function runViteCliBuild(
  loaded: LoadedCliExtensionConfig,
  viteConfigPath: string,
  ctx: Pick<RunnerContext, 'cwd' | 'exec' | 'env'>
): Promise<void> {
  const sanitizedEnv = sanitizeBuildEnv(ctx.env);
  const result = await ctx.exec.command(
    process.execPath,
    [
      resolveViteCliEntrypoint(),
      'build',
      '--config',
      viteConfigPath,
    ],
    {
      cwd: loaded.configDir,
      env: sanitizedEnv,
      streamOutput: true,
      stdout: (chunk) => process.stdout.write(chunk),
      stderr: (chunk) => process.stderr.write(chunk),
      timeoutMs: 120_000,
    }
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'vite build failed');
  }
}

export function resolveViteCliEntrypoint(): string {
  const viteEntrypoint = require.resolve('vite');
  return path.resolve(path.dirname(viteEntrypoint), 'bin/vite.js');
}

function sanitizeBuildEnv(
  env: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const sanitized = { ...env };

  for (const key of Object.keys(sanitized)) {
    if (
      key === 'NODE_OPTIONS' ||
      key === 'VITEST' ||
      key.startsWith('VITEST_')
    ) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

function normalizeUserConfigRoot(
  configDir: string,
  userConfig: UserConfig
): UserConfig {
  if (typeof userConfig.root !== 'string') {
    return userConfig;
  }

  return {
    ...userConfig,
    root: path.isAbsolute(userConfig.root)
      ? userConfig.root
      : path.resolve(configDir, userConfig.root),
  };
}

function flattenPlugins(input: PluginOption | PluginOption[] | undefined): PluginOption[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((entry) => flattenPlugins(entry));
  }

  return [input];
}

function uniquePlugins(plugins: PluginOption[]): PluginOption[] {
  const filtered = plugins.filter(
    (plugin): plugin is Exclude<PluginOption, false | null | undefined> =>
      plugin !== false && plugin !== null && plugin !== undefined
  );
  const withoutExtfn = filtered.filter((plugin) => getPluginName(plugin) !== 'extfn-vite');
  const extfnPlugins = filtered.filter((plugin) => getPluginName(plugin) === 'extfn-vite');

  return [...withoutExtfn, ...extfnPlugins.slice(-1)];
}

function getPluginName(plugin: PluginOption): string | undefined {
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin
    ? String(plugin.name)
    : undefined;
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return (redactValue(value) ?? {}) as Record<string, unknown>;
}

function mergeDetails(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!left && !right) {
    return undefined;
  }

  return redactRecord({
    ...(left ?? {}),
    ...(right ?? {}),
  });
}
