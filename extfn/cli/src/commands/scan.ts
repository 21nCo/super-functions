import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserTarget } from '@superfunctions/extfn';
import type { RunnerActionResult, RunnerContext } from 'clifn/runner';
import {
  createMetricsEmitter,
  createNamespacedEmitter,
  type MetricsEmitter,
} from '../metrics.js';

import {
  buildExtension,
  loadCliExtensionConfig,
  readPackageOutDir,
  reportCommandFailure,
  toRepoPath,
  type BuildCommandOptions,
} from './build.js';
import {
  createScanReport,
  formatScanReportSarif,
  formatScanReportText,
  shouldFailScan,
  toPortablePath,
  toStructuredLogEvent,
  type ScanReport,
  type ScanTargetFile,
  type ScanTargetInput,
} from '../scan/report.js';
import { SCAN_RULES } from '../scan/rules/index.js';

export interface ScanCommandOptions extends BuildCommandOptions {
  strict?: boolean;
  format?: 'text' | 'json' | 'sarif';
  reportDir?: string;
}

export interface ScanCommandResult {
  report: ScanReport;
  reportPath: string;
}

export async function executeScanCommand(
  options: ScanCommandOptions,
  ctx: RunnerContext
): Promise<RunnerActionResult> {
  try {
    const result = await runScanCommand(options, ctx);

    if ((options.format ?? 'text') === 'text') {
      ctx.output.info('Scan report written.', {
        path: toRepoPath(ctx.cwd, result.reportPath),
      });
      process.stdout.write(formatScanReportText(result.report));
    } else if ((options.format ?? 'text') === 'sarif') {
      process.stdout.write(formatScanReportSarif(result.report));
    }

    return {
      exitCode: shouldFailScan(result.report) ? 1 : 0,
      data:
        (options.format ?? 'text') === 'json'
          ? result.report
          : {
              ok: result.report.ok,
              strict: result.report.strict,
              reportPath: toRepoPath(ctx.cwd, result.reportPath),
              summary: result.report.summary,
              findings: result.report.findings,
            },
    };
  } catch (error) {
    return reportCommandFailure(ctx, 'scan', error);
  }
}

export async function runScanCommand(
  options: ScanCommandOptions,
  ctx: Pick<RunnerContext, 'cwd' | 'env' | 'exec' | 'output'>
): Promise<ScanCommandResult> {
  const metrics = createNamespacedEmitter(
    'extfn.cli',
    options.metrics ?? createMetricsEmitter()
  );
  const loaded = await loadCliExtensionConfig(options, {
    cwd: ctx.cwd,
  });
  const buildResult = await ensureBuiltOutputs(options, ctx);
  const reportDir = resolveReportDir(buildResult.outDir, options.reportDir, ctx.env);
  const targets = await Promise.all(
    buildResult.targets.map(async (target) =>
      loadScanTarget({
        baseDir: buildResult.outDir,
        outputDir: buildResult.outputDirs[target],
        target,
      })
    )
  );
  const findings = targets.flatMap((targetInput) =>
    SCAN_RULES.flatMap((rule) => rule.evaluate(targetInput))
  );
  const report = createScanReport({
    configPath: toRepoPath(ctx.cwd, loaded.configPath),
    strict: options.strict !== false,
    targets: targets.map((target) => ({
      ...target,
      outputDir: toRepoPath(ctx.cwd, target.outputDir),
      manifestPath: toRepoPath(ctx.cwd, target.manifestPath),
    })),
    findings: findings.map((finding) => ({
      ...finding,
      ...(finding.file ? { file: finding.file.replace(/\\/g, '/') } : {}),
    })),
  });
  const reportFileName =
    report.targets.length === 1
      ? `${report.targets[0].target}.json`
      : 'combined.json';
  const reportPath = path.resolve(reportDir, reportFileName);

  await fs.mkdir(reportDir, {
    recursive: true,
  });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  metrics.track('scan.complete', {
    configPath: toRepoPath(ctx.cwd, loaded.configPath),
    strict: report.strict,
    findings: report.findings.length,
    errors: report.summary.errorCount,
    warnings: report.summary.warningCount,
  });

  if (!report.ok) {
    ctx.output.warn('Scan detected blocking findings.', toStructuredLogEvent({
      level: 'warn',
      code: 'EXTFN_SCAN_FINDINGS',
      message: 'Blocking findings were emitted by extfn scan.',
      payload: {
        reportPath: toRepoPath(ctx.cwd, reportPath),
      },
      details: {
        findings: report.findings.length,
        errors: report.summary.errorCount,
      },
    }));
  }

  return {
    report,
    reportPath,
  };
}

export async function ensureBuiltOutputs(
  options: ScanCommandOptions,
  ctx: Pick<RunnerContext, 'cwd' | 'env' | 'exec' | 'output'>
) {
  const loaded = await loadCliExtensionConfig(options, {
    cwd: ctx.cwd,
  });
  const defaultOutDir = path.resolve(loaded.configDir, 'dist');
  const missingTarget = await findMissingOutputTarget(defaultOutDir, loaded.targets);

  if (!missingTarget) {
    return {
      configPath: loaded.configPath,
      configDir: loaded.configDir,
      rootDir: loaded.configDir,
      outDir: defaultOutDir,
      packageBaseName: loaded.extension.name,
      extensionVersion: loaded.extension.version,
      targets: loaded.targets,
      outputDirs: Object.fromEntries(
        loaded.targets.map((target) => [
          target,
          path.resolve(defaultOutDir, target),
        ])
      ) as Record<BrowserTarget, string>,
    };
  }

  return buildExtension(options, ctx);
}

async function findMissingOutputTarget(
  outDir: string,
  targets: readonly BrowserTarget[]
): Promise<BrowserTarget | undefined> {
  for (const target of targets) {
    try {
      await fs.access(path.join(outDir, target, 'manifest.json'));
    } catch {
      return target;
    }
  }

  return undefined;
}

async function loadScanTarget(input: {
  baseDir: string;
  outputDir: string;
  target: BrowserTarget;
}): Promise<ScanTargetInput> {
  const manifestPath = path.join(input.outputDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const files = await collectScanFiles(input.outputDir, input.baseDir);

  return {
    target: input.target,
    outputDir: input.outputDir,
    manifestPath,
    manifest,
    files,
  };
}

async function collectScanFiles(
  rootDir: string,
  baseDir: string
): Promise<ScanTargetFile[]> {
  const entries = await fs.readdir(rootDir, {
    withFileTypes: true,
  });
  const files: ScanTargetFile[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectScanFiles(absolutePath, baseDir)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!['.js', '.mjs', '.cjs', '.html', '.css', '.json'].includes(extension)) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath: toPortablePath(baseDir, absolutePath),
      contents: await fs.readFile(absolutePath, 'utf8'),
    });
  }

  return files;
}

function resolveReportDir(
  outDir: string,
  reportDirOption: string | undefined,
  env: NodeJS.ProcessEnv
): string {
  const reportDir =
    reportDirOption ?? readPackageOutDir(env).replace(/packages$/, 'scan');
  return path.isAbsolute(reportDir) ? reportDir : path.resolve(outDir, '..', reportDir);
}
