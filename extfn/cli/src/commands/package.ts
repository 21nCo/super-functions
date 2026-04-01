import path from 'node:path';

import type { RunnerActionResult, RunnerContext } from 'clifn/runner';
import {
  createMetricsEmitter,
  createNamespacedEmitter,
  type MetricsEmitter,
} from '../metrics.js';

import { createDeterministicArchive } from '../package/archive.js';
import { runScanCommand, type ScanCommandOptions } from './scan.js';
import {
  buildExtension,
  readPackageOutDir,
  reportCommandFailure,
  toRepoPath,
  type BuildCommandOptions,
} from './build.js';

export interface PackageCommandOptions extends BuildCommandOptions {
  strict?: boolean;
  scan?: boolean;
  outDir?: string;
  metrics?: MetricsEmitter;
}

export async function executePackageCommand(
  options: PackageCommandOptions,
  ctx: RunnerContext
): Promise<RunnerActionResult> {
  try {
    const result = await runPackageCommand(options, ctx);

    if (result.exitCode === 0) {
      ctx.output.success('Package artifacts written.', {
        outDir: toRepoPath(ctx.cwd, result.outDir),
        archives: result.archives.map((archive) =>
          toRepoPath(ctx.cwd, archive.file)
        ),
      });
    } else {
      ctx.output.warn('Package emission was blocked by scan findings.', {
        outDir: toRepoPath(ctx.cwd, result.outDir),
        scanReportPath: result.scanReportPath
          ? toRepoPath(ctx.cwd, result.scanReportPath)
          : null,
      });
    }

    return {
      exitCode: result.exitCode,
      data: {
        ok: result.exitCode === 0,
        command: 'package',
        strict: options.strict !== false,
        outDir: toRepoPath(ctx.cwd, result.outDir),
        archives: result.archives.map((archive) => ({
          target: archive.target,
          file: toRepoPath(ctx.cwd, archive.file),
        })),
        scanReportPath: result.scanReportPath
          ? toRepoPath(ctx.cwd, result.scanReportPath)
          : null,
      },
    };
  } catch (error) {
    return reportCommandFailure(ctx, 'package', error);
  }
}

export async function runPackageCommand(
  options: PackageCommandOptions,
  ctx: Pick<RunnerContext, 'cwd' | 'env' | 'exec' | 'output'>
): Promise<{
  exitCode: number;
  outDir: string;
  archives: Array<{ target: string; file: string }>;
  scanReportPath?: string;
}> {
  const metrics = createNamespacedEmitter(
    'extfn.cli',
    options.metrics ?? createMetricsEmitter()
  );
  const buildResult = await buildExtension(options, ctx);

  let scanReportPath: string | undefined;
  if (options.scan !== false) {
    const scanResult = await runScanCommand(
      {
        ...(options as ScanCommandOptions),
        strict: options.strict,
      },
      ctx
    );
    scanReportPath = scanResult.reportPath;

    if (scanResult.report.strict && scanResult.report.summary.errorCount > 0) {
      return {
        exitCode: 1,
        outDir: resolvePackageDir(buildResult.configDir, options.outDir, ctx.env),
        archives: [],
        scanReportPath,
      };
    }
  }

  const outDir = resolvePackageDir(buildResult.configDir, options.outDir, ctx.env);
  const archives: Array<{ target: string; file: string }> = [];

  for (const target of buildResult.targets) {
    const extension = target === 'firefox-mv3' ? '.xpi' : '.zip';
    const file = path.join(
      outDir,
      `${buildResult.packageBaseName}-${buildResult.extensionVersion ?? '0.1.0'}-${target}${extension}`
    );

    await createDeterministicArchive({
      sourceDir: buildResult.outputDirs[target],
      destinationFile: file,
    });
    archives.push({
      target,
      file,
    });
  }

  metrics.track('package.complete', {
    outDir: toRepoPath(ctx.cwd, outDir),
    archives: archives.map((archive) => archive.target),
  });

  return {
    exitCode: 0,
    outDir,
    archives,
    scanReportPath,
  };
}

function resolvePackageDir(
  configDir: string,
  outDirOption: string | undefined,
  env: NodeJS.ProcessEnv
): string {
  const outDir = outDirOption ?? readPackageOutDir(env);
  return path.isAbsolute(outDir) ? outDir : path.resolve(configDir, outDir);
}
