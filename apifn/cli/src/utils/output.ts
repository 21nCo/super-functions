import pc from "picocolors";

export interface OutputOptions {
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

export interface Output {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

function withColor(enabled: boolean) {
  return {
    green: (value: string) => (enabled ? pc.green(value) : value),
    yellow: (value: string) => (enabled ? pc.yellow(value) : value),
    red: (value: string) => (enabled ? pc.red(value) : value),
    cyan: (value: string) => (enabled ? pc.cyan(value) : value),
  };
}

export function createOutput(options: OutputOptions = {}): Output {
  const out = options.writeStdout ?? ((text: string) => process.stdout.write(text));
  const err = options.writeStderr ?? ((text: string) => process.stderr.write(text));
  const colors = withColor(options.color ?? true);

  return {
    info(message) {
      if (!options.quiet) {
        out(`${message}\n`);
      }
    },
    success(message) {
      if (!options.quiet) {
        out(`${colors.green(message)}\n`);
      }
    },
    warn(message) {
      if (!options.quiet) {
        out(`${colors.yellow(message)}\n`);
      }
    },
    error(message) {
      err(`${colors.red(message)}\n`);
    },
    debug(message) {
      if (!options.quiet && options.verbose) {
        out(`${colors.cyan(message)}\n`);
      }
    },
  };
}
