import { Command, Option } from 'commander';
import {
  runAction,
  type RunnerActionResult,
  type RunnerContext,
  type RunnerOptions,
} from 'clifn/runner';

import {
  executeBuildCommand,
  type BuildCommandOptions,
} from './commands/build.js';
import { executeDevCommand, type DevCommandOptions } from './commands/dev.js';
import {
  executePackageCommand,
  type PackageCommandOptions,
} from './commands/package.js';
import { executeScanCommand, type ScanCommandOptions } from './commands/scan.js';

export {
  executeBuildCommand,
  type BuildCommandOptions,
} from './commands/build.js';
export { executeDevCommand, runDevCommand, type DevCommandOptions } from './commands/dev.js';
export {
  executePackageCommand,
  runPackageCommand,
  type PackageCommandOptions,
} from './commands/package.js';
export {
  executeScanCommand,
  runScanCommand,
  type ScanCommandOptions,
} from './commands/scan.js';
export {
  createDeterministicArchive,
  type ArchiveOptions,
} from './package/archive.js';
export {
  createScanFinding,
  createScanReport,
  formatScanReportSarif,
  formatScanReportText,
  shouldFailScan,
  toStructuredLogEvent,
  type ScanActionability,
  type ScanCategory,
  type ScanFinding,
  type ScanReport,
  type ScanRule,
  type ScanSeverity,
  type StructuredLogEvent,
} from './scan/report.js';

export function createExtfnCli(): Command {
  const program = new Command();

  program
    .name('extfn')
    .description('Canonical extfn CLI for extension development and release workflows')
    .option('--json', 'Emit JSON output for command results', false)
    .option('--quiet', 'Reduce command output')
    .option('--verbose', 'Emit verbose diagnostics')
    .addOption(
      new Option('--color', 'Force ANSI color output')
        .choices(['true', 'false'])
        .default('true')
    );

  program
    .command('dev')
    .description('Start extension development mode for one target.')
    .option('--config <path>', 'Path to extfn.config.ts')
    .option('--target <target>', 'Extension target to develop')
    .option('--open', 'Open the target browser when supported')
    .option('--no-open', 'Print the unpacked path without opening a browser')
    .option('--browser <browser>', 'Browser executable or app name to launch')
    .action(async (options: DevCommandOptions, command: Command) => {
      process.exitCode = await runCliAction(command, options, executeDevCommand);
    });

  program
    .command('build')
    .description('Build extension outputs for the configured targets.')
    .option('--config <path>', 'Path to extfn.config.ts')
    .option('--target <target>', 'Build only the selected target or comma-separated targets')
    .action(async (options: BuildCommandOptions, command: Command) => {
      process.exitCode = await runCliAction(command, options, executeBuildCommand);
    });

  program
    .command('package')
    .description('Build, scan, and emit store-uploadable extension archives.')
    .option('--config <path>', 'Path to extfn.config.ts')
    .option('--target <target>', 'Package only the selected target or comma-separated targets')
    .option('--out-dir <path>', 'Directory for emitted archives')
    .option('--no-scan', 'Skip scan before archive emission')
    .option('--no-strict', 'Allow archive emission even when scan findings exist')
    .action(async (options: PackageCommandOptions, command: Command) => {
      process.exitCode = await runCliAction(
        command,
        options,
        executePackageCommand
      );
    });

  program
    .command('scan')
    .description('Analyze built extension outputs for review-blocking findings.')
    .option('--config <path>', 'Path to extfn.config.ts')
    .option('--target <target>', 'Scan only the selected target or comma-separated targets')
    .option('--report-dir <path>', 'Directory for persisted scan reports')
    .option(
      '--format <format>',
      'Output format for scan results',
      'text'
    )
    .option('--no-strict', 'Return success while preserving findings')
    .action(async (options: ScanCommandOptions, command: Command) => {
      process.exitCode = await runCliAction(command, options, executeScanCommand);
    });

  return program;
}

async function runCliAction<TOptions>(
  command: Command,
  options: TOptions,
  action: (
    options: TOptions,
    ctx: RunnerContext
  ) => Promise<RunnerActionResult> | RunnerActionResult
): Promise<number> {
  const globalOptions = command.optsWithGlobals() as {
    json?: boolean;
    quiet?: boolean;
    verbose?: boolean;
    color?: string;
  };

  const runnerOptions: RunnerOptions = {
    mode: globalOptions.json ? 'json' : 'text',
    quiet: globalOptions.quiet,
    verbose: globalOptions.verbose,
    color: globalOptions.color !== 'false',
  };

  return runAction(action, options, runnerOptions);
}
