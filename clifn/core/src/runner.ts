import type { Diagnostic } from "./diagnostics.js";
import { createExec, type ExecService } from "./exec.js";
import { createOutput, type OutputService } from "./output.js";
import { createScaffold, type ScaffoldService } from "./scaffold.js";

export interface RunnerDiagnosticsSink {
  add(input: Diagnostic): void;
  list(): readonly Diagnostic[];
}

export type RunnerDiagnosticsListener = (diagnostics: readonly Diagnostic[]) => void;

export interface RunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  mode?: "text" | "json";
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  nonInteractive?: boolean;
  onDiagnostics?: RunnerDiagnosticsListener;
}

export interface RunnerContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly output: OutputService;
  readonly diagnostics: RunnerDiagnosticsSink;
  readonly exec: ExecService;
  readonly scaffold: ScaffoldService;
  readonly nonInteractive: boolean;
}

export type RunnerActionResult =
  | void
  | {
      exitCode?: number;
      data?: unknown;
      diagnostics?: readonly Diagnostic[];
    };

interface RunnerFailurePayload {
  code: "CLIFN_RUNNER_FAILED";
  message: string;
}

function normalizeExitCode(exitCode: number | undefined): number {
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode) || exitCode < 0) {
    return 0;
  }
  return exitCode;
}

function normalizeError(error: unknown): RunnerFailurePayload {
  if (error instanceof Error) {
    return {
      code: "CLIFN_RUNNER_FAILED",
      message: error.message || error.name,
    };
  }

  return {
    code: "CLIFN_RUNNER_FAILED",
    message: typeof error === "string" ? error : "Unknown runner failure",
  };
}

export async function runAction<TOptions>(
  action: (options: TOptions, ctx: RunnerContext) => Promise<RunnerActionResult> | RunnerActionResult,
  options: TOptions,
  runnerOptions: RunnerOptions = {}
): Promise<number> {
  const cwd = runnerOptions.cwd ?? process.cwd();
  const env = runnerOptions.env ?? process.env;
  const diagnostics: Diagnostic[] = [];
  const baseExec = createExec();
  const baseScaffold = createScaffold();
  const output = createOutput({
    quiet: runnerOptions.quiet,
    verbose: runnerOptions.verbose,
    color: runnerOptions.color,
    mode: runnerOptions.mode,
    stdout: runnerOptions.stdout,
    stderr: runnerOptions.stderr,
  });

  const diagnosticSink: RunnerDiagnosticsSink = {
    add(input: Diagnostic) {
      diagnostics.push(input);
    },
    list() {
      return diagnostics;
    },
  };

  const ctx: RunnerContext = {
    cwd,
    env,
    output,
    diagnostics: diagnosticSink,
    exec: {
      command(file, args, options) {
        return baseExec.command(file, args, {
          ...options,
          cwd: options?.cwd ?? cwd,
          env: options?.env ?? env,
        });
      },
    },
    scaffold: {
      apply(operations, options) {
        return baseScaffold.apply(operations, {
          ...options,
          cwd: options?.cwd ?? cwd,
        });
      },
    },
    nonInteractive: runnerOptions.nonInteractive ?? false,
  };

  try {
    const result = await action(options, ctx);

    for (const diagnostic of result?.diagnostics ?? []) {
      diagnosticSink.add(diagnostic);
    }

    const collectedDiagnostics = diagnosticSink.list();
    runnerOptions.onDiagnostics?.(collectedDiagnostics);

    if (runnerOptions.mode === "json" && result?.data !== undefined) {
      output.json(result.data);
    }

    return normalizeExitCode(result?.exitCode);
  } catch (error) {
    const failure = normalizeError(error);
    runnerOptions.onDiagnostics?.(diagnosticSink.list());

    if (runnerOptions.mode === "json") {
      output.json({
        ok: false,
        error: failure,
      });
    } else {
      output.error(failure.message);
    }

    return 1;
  }
}
