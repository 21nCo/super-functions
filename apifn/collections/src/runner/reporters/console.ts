/**
 * Console reporter — colored pass/fail output per request with summary at end.
 */

import pc from "picocolors";
import type { Collection, CollectionItem, RequestResult, RunOptions, RunReport, RunReporter } from "../../types.js";

export interface ConsoleReporterOptions {
  /** Whether to use color output (default: true) */
  color?: boolean;
  /** Custom write function (default: process.stdout.write) */
  write?: (text: string) => void;
}

function badge(status: RequestResult["status"], color: boolean): string {
  const c = {
    green: (s: string) => (color ? pc.green(s) : s),
    red: (s: string) => (color ? pc.red(s) : s),
    yellow: (s: string) => (color ? pc.yellow(s) : s),
    gray: (s: string) => (color ? pc.gray(s) : s),
  };
  switch (status) {
    case "passed":
      return c.green("✓ PASS");
    case "failed":
      return c.red("✗ FAIL");
    case "error":
      return c.red("✗ ERROR");
    case "skipped":
      return c.yellow("– SKIP");
  }
}

export function createConsoleReporter(options: ConsoleReporterOptions = {}): RunReporter {
  const useColor = options.color ?? true;
  const write = options.write ?? ((text: string) => process.stdout.write(text));

  const c = {
    bold: (s: string) => (useColor ? pc.bold(s) : s),
    green: (s: string) => (useColor ? pc.green(s) : s),
    red: (s: string) => (useColor ? pc.red(s) : s),
    yellow: (s: string) => (useColor ? pc.yellow(s) : s),
    cyan: (s: string) => (useColor ? pc.cyan(s) : s),
    gray: (s: string) => (useColor ? pc.gray(s) : s),
    dim: (s: string) => (useColor ? pc.dim(s) : s),
  };

  return {
    onStart(collection: Collection, _options: RunOptions): void {
      write(`\n${c.bold("apifn test")} — ${c.cyan(collection.info.name)}\n`);
      const envName = typeof _options.environment === "string" ? _options.environment : _options.environment.name;
      write(`${c.dim(`Environment: ${envName}`)}\n\n`);
    },

    onRequestStart(_item: CollectionItem): void {
      // No per-request start output; results shown on complete
    },

    onRequestComplete(result: RequestResult): void {
      const duration = `${result.duration}ms`;
      const statusCode = result.statusCode ? ` ${result.statusCode}` : "";
      write(`  ${badge(result.status, useColor)}  ${result.method}${statusCode}  ${result.name}  ${c.dim(duration)}\n`);

      if (result.status === "failed" || result.status === "error") {
        if (result.error) {
          write(`         ${c.red(result.error)}\n`);
        }
        for (const assertion of result.assertions) {
          if (!assertion.passed) {
            const detail =
              assertion.expected !== undefined && assertion.actual !== undefined
                ? ` (expected: ${JSON.stringify(assertion.expected)}, actual: ${JSON.stringify(assertion.actual)})`
                : assertion.error
                  ? ` (${assertion.error})`
                  : "";
            write(`         ${c.red(`✗ ${assertion.name}${detail}`)}\n`);
          }
        }
      }

      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          write(`         ${c.yellow(`⚠ ${warning}`)}\n`);
        }
      }
    },

    onComplete(report: RunReport): void {
      const { summary } = report;
      write("\n");
      write(`${"─".repeat(60)}\n`);
      write(`${c.bold("Results")}\n`);
      write(`  Total:   ${summary.total}\n`);
      write(`  ${c.green(`Passed:  ${summary.passed}`)}\n`);

      if (summary.failed > 0) {
        write(`  ${c.red(`Failed:  ${summary.failed}`)}\n`);
      } else {
        write(`  Failed:  ${summary.failed}\n`);
      }

      if (summary.errors > 0) {
        write(`  ${c.red(`Errors:  ${summary.errors}`)}\n`);
      } else {
        write(`  Errors:  ${summary.errors}\n`);
      }

      if (summary.skipped > 0) {
        write(`  ${c.yellow(`Skipped: ${summary.skipped}`)}\n`);
      } else {
        write(`  Skipped: ${summary.skipped}\n`);
      }

      write(`  Duration: ${summary.duration}ms\n`);
      write(`${"─".repeat(60)}\n`);

      const allPassed = summary.failed === 0 && summary.errors === 0;
      if (allPassed) {
        write(`\n${c.green(c.bold("All tests passed!"))}\n\n`);
      } else {
        write(`\n${c.red(c.bold(`${summary.failed + summary.errors} test(s) failed.`))}\n\n`);
      }
    },
  };
}
