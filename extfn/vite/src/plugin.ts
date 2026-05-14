import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BrowserTarget,
  ExtensionConfig,
  ResolvedExtensionConfig,
} from '@extfn/core';
import { ExtfnError } from '@extfn/core';
import type {
  Plugin,
  ResolvedConfig as ViteResolvedConfig,
  UserConfig,
  ViteDevServer,
} from 'vite';
import type { NormalizedOutputOptions, OutputBundle } from 'rollup';

import {
  ensureTargetOutputDirectories,
  type ExtfnOutputMode,
  writeTargetFile,
} from './dev/devOutputs.js';
import {
  assertSafeReloadDecision,
  decideReloadStrategy,
  detectChangedSurface,
  formatReloadDecisionLog,
} from './dev/reloadPolicy.js';
import { buildManifest, createTargetBuildOutputs } from './manifest/buildManifest.js';
import { loadExtensionConfig } from './loadExtensionConfig.js';

export interface ExtfnViteOptions {
  configPath?: string;
  extension?: ExtensionConfig;
}

interface LoadedResolvedConfig {
  configPath: string;
  resolved: ResolvedExtensionConfig;
}

export async function prepareResolvedExtensionConfig(
  options: ExtfnViteOptions
): Promise<LoadedResolvedConfig> {
  if (options.extension) {
    const configPath = options.configPath ?? path.resolve('extfn.config.ts');
    const { resolveExtensionConfig } = await import('@extfn/core');
    const resolved = await resolveExtensionConfig(options.extension, {
      configPath,
    });
    return {
      configPath: await realpathIfExists(configPath),
      resolved: await normalizeResolvedPaths(resolved),
    };
  }

  const loaded = await loadExtensionConfig(options.configPath);

  return {
    configPath: await realpathIfExists(loaded.configPath),
    resolved: await normalizeResolvedPaths(loaded.resolvedConfig),
  };
}

export function extfnVite(options: ExtfnViteOptions = {}): Plugin[] {
  let resolvedExtension: LoadedResolvedConfig | undefined;
  let viteConfig: ViteResolvedConfig | undefined;

  return [
    {
      name: 'extfn-vite',
      async config(_userConfig, env): Promise<UserConfig> {
        resolvedExtension = await prepareResolvedExtensionConfig(options);

        return {
          root: resolvedExtension.resolved.configDir,
          appType: 'mpa',
          build: {
            emptyOutDir: env.command === 'build',
            rollupOptions: {
              input: createRollupInputs(resolvedExtension.resolved),
              output: {
                assetFileNames: 'assets/[name]-[hash][extname]',
                chunkFileNames: 'chunks/[name]-[hash].js',
                entryFileNames: (chunkInfo) =>
                  chunkInfo.name === 'background' ||
                  chunkInfo.name.startsWith('content/')
                    ? '[name].js'
                    : 'assets/[name]-[hash].js',
              },
            },
          },
        };
      },
      configResolved(config): void {
        viteConfig = config;
      },
      async configureServer(server): Promise<void> {
        if (!resolvedExtension || !viteConfig) {
          return;
        }

        await emitTargetOutputs({
          mode: 'dev',
          outDir: resolveOutDir(viteConfig.root, viteConfig.build.outDir),
          resolvedConfig: resolvedExtension.resolved,
        });

        wireDevReloadLogging(server, resolvedExtension.resolved);
      },
      async writeBundle(
        outputOptions: NormalizedOutputOptions,
        bundle: OutputBundle
      ): Promise<void> {
        if (!resolvedExtension) {
          return;
        }

        await emitTargetOutputs({
          bundle,
          mode: 'build',
          outDir: resolveOutDir(
            viteConfig?.root ?? process.cwd(),
            outputOptions.dir ?? viteConfig?.build.outDir ?? 'dist'
          ),
          resolvedConfig: resolvedExtension.resolved,
        });
      },
    },
  ];
}

function createRollupInputs(
  resolvedConfig: ResolvedExtensionConfig
): Record<string, string> {
  const inputs: Record<string, string> = {};

  for (const surface of resolvedConfig.surfaces) {
    const key = normalizePageInputKey(surface.outputPath);
    if (inputs[key]) {
      throw new ExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate page output path: ${surface.outputPath}`,
        {
          details: {
            outputPath: surface.outputPath,
            surface: surface.surface,
          },
        }
      );
    }
    inputs[key] = surface.resolvedEntry;
  }

  inputs.background = resolvedConfig.background.resolvedServiceWorker;

  for (const contentScript of resolvedConfig.contentScripts) {
    const key = `content/${contentScript.id}`;
    if (inputs[key]) {
      throw new ExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate content output path: ${key}.js`,
        {
          details: {
            contentScriptId: contentScript.id,
          },
        }
      );
    }
    inputs[key] = contentScript.resolvedEntry;
  }

  return inputs;
}

function normalizePageInputKey(outputPath: string): string {
  const parsed = path.parse(outputPath);
  return path.posix.join(parsed.dir, parsed.name).replace(/\\/g, '/');
}

async function emitTargetOutputs(input: {
  resolvedConfig: ResolvedExtensionConfig;
  outDir: string;
  mode: ExtfnOutputMode;
  bundle?: OutputBundle;
}): Promise<void> {
  const targetDirectories = await ensureTargetOutputDirectories(
    input.outDir,
    input.resolvedConfig.targets,
    input.mode
  );
  const buildOutputs = createTargetBuildOutputs(input.resolvedConfig);

  for (const target of input.resolvedConfig.targets) {
    const outputDirectory = targetDirectories[target];

    if (input.bundle) {
      await copyBundleToTarget(outputDirectory, input.bundle);
    }

    await copyContentCss(input.resolvedConfig, outputDirectory);

    const manifest = buildManifest(input.resolvedConfig, target, buildOutputs);
    await writeTargetFile(
      outputDirectory,
      'manifest.json',
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }
}

async function copyBundleToTarget(
  outputDirectory: string,
  bundle: OutputBundle
): Promise<void> {
  const entries = (Object.values(bundle) as Array<OutputBundle[string]>).sort(
    (left, right) => left.fileName.localeCompare(right.fileName)
  );

  for (const entry of entries) {
    if (entry.type === 'chunk') {
      await writeTargetFile(outputDirectory, entry.fileName, entry.code);
      continue;
    }

    const contents =
      typeof entry.source === 'string'
        ? entry.source
        : new Uint8Array(entry.source);
    await writeTargetFile(outputDirectory, entry.fileName, contents);
  }
}

async function copyContentCss(
  resolvedConfig: ResolvedExtensionConfig,
  outputDirectory: string
): Promise<void> {
  for (const contentScript of resolvedConfig.contentScripts) {
    for (const cssPath of contentScript.resolvedCss) {
      const targetPath = path.posix.join(
        'content',
        contentScript.id,
        path.basename(cssPath)
      );
      await writeTargetFile(outputDirectory, targetPath, await fs.readFile(cssPath));
    }
  }
}

function wireDevReloadLogging(
  server: ViteDevServer,
  resolvedConfig: ResolvedExtensionConfig
): void {
  server.watcher.on('change', (changedFile) => {
    const changedSurface = detectChangedSurface(resolvedConfig, changedFile);

    for (const target of resolvedConfig.targets) {
      const decision = decideReloadStrategy(
        {
          changedFile,
          surface: changedSurface,
          target,
        },
        {
          contentReinject: target === 'chromium-mv3',
          pageHmr: true,
        }
      );

      assertSafeReloadDecision(decision);

      server.config.logger.info(
        `[extfn] ${JSON.stringify(formatReloadDecisionLog(decision))}`,
        {
          clear: false,
          timestamp: true,
        }
      );
    }
  });
}

function resolveOutDir(root: string, outDir: string): string {
  return path.isAbsolute(outDir) ? outDir : path.resolve(root, outDir);
}

async function normalizeResolvedPaths(
  resolvedConfig: ResolvedExtensionConfig
): Promise<ResolvedExtensionConfig> {
  const configPath = await realpathIfExists(resolvedConfig.configPath);
  const configDir = await realpathIfExists(resolvedConfig.configDir);

  return {
    ...resolvedConfig,
    configPath,
    configDir,
    background: {
      ...resolvedConfig.background,
      resolvedServiceWorker: await realpathIfExists(
        resolvedConfig.background.resolvedServiceWorker
      ),
      resolvedMessageHandlersDir: resolvedConfig.background.resolvedMessageHandlersDir
        ? await realpathIfExists(resolvedConfig.background.resolvedMessageHandlersDir)
        : undefined,
      resolvedPortHandlersDir: resolvedConfig.background.resolvedPortHandlersDir
        ? await realpathIfExists(resolvedConfig.background.resolvedPortHandlersDir)
        : undefined,
      messageHandlers: await Promise.all(
        resolvedConfig.background.messageHandlers.map(async (handler) => ({
          ...handler,
          filePath: await realpathIfExists(handler.filePath),
        }))
      ),
      portHandlers: await Promise.all(
        resolvedConfig.background.portHandlers.map(async (handler) => ({
          ...handler,
          filePath: await realpathIfExists(handler.filePath),
        }))
      ),
    },
    surfaces: await Promise.all(
      resolvedConfig.surfaces.map(async (surface) => ({
        ...surface,
        resolvedEntry: await realpathIfExists(surface.resolvedEntry),
      }))
    ),
    contentScripts: await Promise.all(
      resolvedConfig.contentScripts.map(async (contentScript) => ({
        ...contentScript,
        resolvedEntry: await realpathIfExists(contentScript.resolvedEntry),
        resolvedCss: await Promise.all(
          contentScript.resolvedCss.map((cssPath) => realpathIfExists(cssPath))
        ),
      }))
    ),
  };
}

async function realpathIfExists(candidatePath: string): Promise<string> {
  try {
    return await fs.realpath(candidatePath);
  } catch {
    return candidatePath;
  }
}
