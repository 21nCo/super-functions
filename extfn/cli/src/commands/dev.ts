import path from 'node:path';

import type { BrowserTarget } from 'extfn';
import { createExtfnError } from 'extfn';
import { getTargetOutputDir } from '@extfn/vite';
import type { RunnerActionResult, RunnerContext } from '@clifn/core/runner';
import {
  createMetricsEmitter,
  createNamespacedEmitter,
  type MetricsEmitter,
} from '../metrics.js';
import { createServer } from 'vite';

import { openBrowserSession } from '../browser/openBrowser.js';
import {
  createCommandViteConfig,
  loadCliExtensionConfig,
  reportCommandFailure,
  toRepoPath,
} from './build.js';

export interface DevCommandOptions {
  config?: string;
  target?: string;
  open?: boolean;
  browser?: string;
  metrics?: MetricsEmitter;
}

export async function executeDevCommand(
  options: DevCommandOptions,
  ctx: RunnerContext
): Promise<RunnerActionResult> {
  return runDevCommand(options, ctx, {
    stayOpen: true,
  });
}

export async function runDevCommand(
  options: DevCommandOptions,
  ctx: Pick<RunnerContext, 'cwd' | 'env' | 'exec' | 'output'>,
  control: {
    stayOpen: boolean;
  }
): Promise<RunnerActionResult> {
  const metrics = createNamespacedEmitter(
    'extfn.cli',
    options.metrics ?? createMetricsEmitter()
  );

  try {
    const loaded = await loadCliExtensionConfig(options, {
      cwd: ctx.cwd,
    });
    const target = requireSingleDevTarget(loaded.targets, options.target);
    const viteConfig = await createCommandViteConfig(
      {
        ...loaded,
        extension: {
          ...loaded.extension,
          targets: [target],
        },
        targets: [target],
      },
      {
        command: 'serve',
        mode: 'development',
      }
    );
    const server = await createServer(viteConfig);

    try {
      await server.listen();

      const rootDir =
        typeof viteConfig.root === 'string' ? viteConfig.root : loaded.configDir;
      const outDir = getTargetOutputDir(
        typeof viteConfig.build?.outDir === 'string'
          ? path.isAbsolute(viteConfig.build.outDir)
            ? viteConfig.build.outDir
            : path.resolve(rootDir, viteConfig.build.outDir)
          : path.resolve(rootDir, 'dist'),
        target,
        'dev'
      );

      metrics.track('dev.start', {
        configPath: toRepoPath(ctx.cwd, loaded.configPath),
        target,
        outputDir: toRepoPath(ctx.cwd, outDir),
      });

      ctx.output.info('Load the unpacked extension from:', {
        target,
        path: toRepoPath(ctx.cwd, outDir),
      });

      if (options.open) {
        try {
          const opened = await openBrowserSession({
            exec: ctx.exec,
            extensionPath: outDir,
            target,
            browser: options.browser,
            cwd: ctx.cwd,
            env: ctx.env,
          });

          metrics.track('dev.browser_opened', {
            target,
            command: opened.command ?? null,
          });

          if (opened.reason) {
            ctx.output.warn(opened.reason, {
              target,
            });
          }
        } catch (error) {
          ctx.output.warn('Unable to launch a browser session automatically.', {
            error:
              error instanceof Error ? error.message : 'Unknown browser launch failure',
            target,
          });
        }
      }

      if (!control.stayOpen) {
        return {
          exitCode: 0,
          data: {
            ok: true,
            command: 'dev',
            target,
            watching: true,
            devOutput: toRepoPath(ctx.cwd, outDir),
            printedLoadPath: true,
          },
        };
      }

      ctx.output.info('Watching for extension changes...', {
        target,
      });

      await waitForShutdown(server);

      return {
        exitCode: 0,
        data: {
          ok: true,
          command: 'dev',
          target,
          watching: true,
          devOutput: toRepoPath(ctx.cwd, outDir),
          printedLoadPath: true,
        },
      };
    } finally {
      if (!control.stayOpen) {
        await server.close();
      }
    }
  } catch (error) {
    return reportCommandFailure(ctx, 'dev', error, {
      exitCode: isTargetSelectionError(error) ? 2 : 1,
    });
  }
}

function requireSingleDevTarget(
  targets: readonly BrowserTarget[],
  targetOption?: string
): BrowserTarget {
  if (targets.length === 1) {
    return targets[0];
  }

  throw createExtfnError(
    'E_CONFIG_INVALID',
    'extfn dev requires --target when more than one target is configured.',
    {
      configuredTargets: [...targets],
      targetOption: targetOption ?? null,
    }
  );
}

function isTargetSelectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message ===
      'extfn dev requires --target when more than one target is configured.'
  );
}

async function waitForShutdown(server: { close(): Promise<void> }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const finish = async () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      try {
        await server.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const onSigint = () => {
      void finish();
    };
    const onSigterm = () => {
      void finish();
    };

    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
  });
}
