import { cac } from "cac";
import { DEFAULT_CONFIG_PATH, defineConfig, loadConfig } from "./config.js";
import { runInitCommand } from "./commands/init.js";
import { runGenerateCommand } from "./commands/generate.js";
import { runExportCommand } from "./commands/export.js";
import { runValidateCommand } from "./commands/validate.js";
import { runTestCommand } from "./commands/test.js";
import { runImportOpenApiCommand } from "./commands/import.js";
import { runDiffCommand } from "./commands/diff.js";
import { runServeCommand } from "./commands/serve.js";
import { runMockCommand } from "./commands/mock.js";
import { runSnippetCommand } from "./commands/snippet.js";
import { createOutput } from "./utils/output.js";

export { defineConfig, loadConfig };

export interface CliRunOptions {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

export async function runCli(
  argv = process.argv.slice(2),
  runOptions: CliRunOptions = {}
): Promise<number> {
  let exitCode = 0;

  const cli = cac("apifn");
  const getGlobals = () =>
    (cli.options ?? {}) as {
      config?: string;
      verbose?: boolean;
      quiet?: boolean;
      color?: boolean;
    };

  cli
    .option("--config <path>", `Path to config file (default: ${DEFAULT_CONFIG_PATH})`)
    .option("--verbose", "Enable verbose output")
    .option("--quiet", "Suppress non-error output")
    .option("--no-color", "Disable colored output");

  cli
    .command("init [dir]", "Initialize a new OpenCollection directory")
    .option("--yes", "Skip interactive prompts")
    .option("--force", "Allow initializing into a non-empty directory")
    .action(async (dir: string | undefined, options: { yes?: boolean; force?: boolean }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });

      const result = await runInitCommand({
        dir,
        yes: options.yes,
        force: options.force,
        cwd: runOptions.cwd,
        output,
      });
      if (result !== 0) {
        exitCode = result;
      }
    });

  cli
    .command("generate [routerPath]", "Generate OpenAPI from router")
    .option("--output <path>", "Output file path")
    .action(async (routerPath: string | undefined, options: { output?: string }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });
      const { config } = await loadConfig({
        cwd: runOptions.cwd,
        configPath: globals.config,
      });

      await runGenerateCommand({
        routerPath,
        outputPath: options.output,
        cwd: runOptions.cwd,
        config,
        output,
      });
    });

  cli
    .command("export [format] [output]", "Export generated OpenAPI as yaml/json")
    .option("--input <path>", "Input OpenAPI path")
    .action(async (format: string | undefined, outputPath: string | undefined, options: { input?: string }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });
      const { config } = await loadConfig({
        cwd: runOptions.cwd,
        configPath: globals.config,
      });

      const normalized = format === "json" ? "json" : "yaml";
      await runExportCommand({
        format: normalized,
        outputPath,
        inputPath: options.input,
        cwd: runOptions.cwd,
        config,
        output,
      });
    });

  cli
    .command("import <kind> <source>", "Import an OpenAPI document as an OpenCollection")
    .option("--output <dir>", "Output collection directory")
    .option("--base-url <url>", "Base URL for generated environment")
    .option("--env <name>", "Environment name to create (default: development)")
    .option("--group-by <mode>", "Group requests by tag | path (default: tag)")
    .option("--force", "Allow writing into a non-empty output directory")
    .action(
      async (
        kind: string,
        source: string,
        options: {
          output?: string;
          baseUrl?: string;
          env?: string;
          groupBy?: string;
          force?: boolean;
        }
      ) => {
        const globals = getGlobals();
        const output = createOutput({
          quiet: globals.quiet,
          verbose: globals.verbose,
          color: globals.color !== false,
          writeStdout: runOptions.stdout,
          writeStderr: runOptions.stderr,
        });

        if (kind !== "openapi") {
          output.error(`Unsupported import kind '${kind}'. Supported: openapi.`);
          exitCode = 2;
          return;
        }

        const groupBy = options.groupBy === "path" ? "path" : "tag";
        const result = await runImportOpenApiCommand({
          source,
          outputDir: options.output ?? ".",
          baseUrl: options.baseUrl,
          env: options.env,
          groupBy,
          force: options.force,
          cwd: runOptions.cwd,
          output,
        });
        if (result !== 0) {
          exitCode = result;
        }
      }
    );

  cli
    .command("test [collectionDir]", "Run a collection's tests")
    .option("--env <name>", "Environment name to use")
    .option("--bail", "Stop on first failure")
    .option("--parallel", "Run requests in parallel")
    .option("--concurrency <n>", "Max concurrent requests (parallel mode)")
    .option("--timeout <ms>", "Per-request timeout in milliseconds")
    .option("--include <pattern>", "Only run requests matching path/name pattern")
    .option("--exclude <pattern>", "Skip requests matching path/name pattern")
    .option("--retries <n>", "Retry failed requests")
    .option("--delay <ms>", "Delay between sequential requests in milliseconds")
    .option("--env-var <keyValue>", "Override an environment variable (KEY=value)")
    .option("--dotenv <path>", "Load dotenv file as environment overrides")
    .option("--redact-header <name>", "Additional response/request header to redact")
    .option("--output <path>", "Write machine-readable report artifact")
    .option("--reporter <type>", "Reporter type: console | json | junit | silent (default: console)")
    .action(
      async (
        collectionDir: string | undefined,
        options: {
          env?: string;
          bail?: boolean;
          parallel?: boolean;
          concurrency?: string;
          timeout?: string;
          include?: string | string[];
          exclude?: string | string[];
          retries?: string;
          delay?: string;
          envVar?: string | string[];
          dotenv?: string;
          redactHeader?: string | string[];
          output?: string;
          reporter?: string;
        }
      ) => {
        const globals = getGlobals();
        const output = createOutput({
          quiet: globals.quiet,
          verbose: globals.verbose,
          color: globals.color !== false,
          writeStdout: runOptions.stdout,
          writeStderr: runOptions.stderr,
        });

        const reporterValue = options.reporter;
        const validReporters = ["console", "json", "junit", "silent"] as const;
        type R = (typeof validReporters)[number];
        const reporter: R = validReporters.includes(reporterValue as R)
          ? (reporterValue as R)
          : "console";

        const result = await runTestCommand({
          collectionDir,
          env: options.env,
          bail: options.bail,
          parallel: options.parallel,
          concurrency: options.concurrency ? Number(options.concurrency) : undefined,
          timeout: options.timeout ? Number(options.timeout) : undefined,
          include: toArray(options.include),
          exclude: toArray(options.exclude),
          retries: options.retries ? Number(options.retries) : undefined,
          delay: options.delay ? Number(options.delay) : undefined,
          envVar: toArray(options.envVar),
          dotenv: options.dotenv,
          redactHeader: toArray(options.redactHeader),
          outputPath: options.output,
          reporter,
          color: globals.color !== false,
          cwd: runOptions.cwd,
          output,
          writeStdout: runOptions.stdout,
        });
        if (result !== 0) {
          exitCode = result;
        }
      }
    );

  cli
    .command("diff <before> <after>", "Compare two OpenAPI specs for breaking changes")
    .option("--format <type>", "Output format: text | json (default: text)")
    .option("--fail-on-breaking", "Exit 1 on breaking changes (default: true)", { default: true })
    .action(
      async (
        before: string,
        after: string,
        options: { format?: string; failOnBreaking?: boolean }
      ) => {
        const globals = getGlobals();
        const output = createOutput({
          quiet: globals.quiet,
          verbose: globals.verbose,
          color: globals.color !== false,
          writeStdout: runOptions.stdout,
          writeStderr: runOptions.stderr,
        });

        const formatValue = options.format === "json" ? "json" : "text";
        const result = await runDiffCommand({
          before,
          after,
          format: formatValue,
          failOnBreaking: options.failOnBreaking !== false,
          cwd: runOptions.cwd,
          output,
          writeStdout: runOptions.stdout,
        });
        if (result !== 0) {
          exitCode = result;
        }
      }
    );

  cli
    .command("serve [specPath]", "Serve interactive API explorer")
    .option("--port <port>", "Port to bind (default: 4100)")
    .option("--open", "Open browser automatically")
    .action(async (specPath: string | undefined, options: { port?: string; open?: boolean }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });
      const result = await runServeCommand({
        specPath,
        port: options.port ? parseInt(options.port, 10) : undefined,
        open: options.open ?? false,
        cwd: runOptions.cwd,
        output,
      });
      if (result !== 0) exitCode = result;
    });

  cli
    .command("mock <specPath>", "Start mock server from OpenAPI spec")
    .option("--mode <mode>", "Response mode: schema | examples | random (default: schema)")
    .option("--port <port>", "Port to bind (default: 4010)")
    .option("--validate-requests", "Validate incoming request bodies")
    .option("--delay <ms>", "Add delay to responses (ms)")
    .action(async (specPath: string, options: { mode?: string; port?: string; validateRequests?: boolean; delay?: string }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });
      const mode = ["schema", "examples", "random"].includes(options.mode ?? "")
        ? (options.mode as "schema" | "examples" | "random")
        : "schema";
      const result = await runMockCommand({
        specPath,
        mode,
        port: options.port ? parseInt(options.port, 10) : undefined,
        validateRequests: options.validateRequests ?? false,
        delay: options.delay ? parseInt(options.delay, 10) : undefined,
        cwd: runOptions.cwd,
        output,
      });
      if (result !== 0) exitCode = result;
    });

  cli
    .command("snippet <specPath> [apiPath]", "Generate code snippet for an endpoint")
    .option("--target <target>", "Snippet target (curl, fetch, axios, …) (default: curl)")
    .option("--method <method>", "HTTP method (default: get)")
    .option("--base-url <url>", "Base URL override")
    .option("--all", "Generate snippets for all endpoints")
    .action(async (specPath: string, apiPath: string | undefined, options: { target?: string; method?: string; baseUrl?: string; all?: boolean }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });
      const result = await runSnippetCommand({
        specPath,
        apiPath,
        target: options.target,
        method: options.method,
        baseUrl: options.baseUrl,
        all: options.all ?? false,
        cwd: runOptions.cwd,
        output,
        writeStdout: runOptions.stdout,
      });
      if (result !== 0) exitCode = result;
    });

  cli
    .command("validate <specPath>", "Validate OpenAPI document")
    .option("--format <type>", "Output format: text | json (default: text)")
    .action(async (specPath: string, options: { format?: string }) => {
      const globals = getGlobals();
      const output = createOutput({
        quiet: globals.quiet,
        verbose: globals.verbose,
        color: globals.color !== false,
        writeStdout: runOptions.stdout,
        writeStderr: runOptions.stderr,
      });

      const result = await runValidateCommand({
        specPath,
        format: options.format === "json" ? "json" : "text",
        cwd: runOptions.cwd,
        output,
        writeStdout: runOptions.stdout,
      });
      if (result !== 0) {
        exitCode = result;
      }
    });

  cli.help();
  cli.version("0.0.2");

  try {
    cli.parse(["node", "apifn", ...argv], { run: false });
    await cli.runMatchedCommand();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = createOutput({
      writeStdout: runOptions.stdout,
      writeStderr: runOptions.stderr,
      color: false,
    });
    output.error(message);
    return 1;
  }

  return exitCode;
}
