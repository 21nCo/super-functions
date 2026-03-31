import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_GRACE_MS = 250;

export type ExecErrorCode = "CLIFN_EXEC_TIMEOUT";

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  streamOutput?: boolean;
  maxBufferBytes?: number;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
}

export interface ExecResult {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ExecService {
  command(file: string, args?: readonly string[], options?: ExecOptions): Promise<ExecResult>;
}

export class ExecTimeoutError extends Error {
  readonly code: ExecErrorCode;
  readonly result: ExecResult;

  constructor(message: string, result: ExecResult) {
    super(message);
    this.name = "ExecTimeoutError";
    this.code = "CLIFN_EXEC_TIMEOUT";
    this.result = result;
  }
}

function formatCommand(file: string, args: readonly string[]): string {
  const parts = [file, ...args];
  return parts
    .map((part) => {
      if (/^[A-Za-z0-9_./:-]+$/.test(part)) {
        return part;
      }
      return JSON.stringify(part);
    })
    .join(" ");
}

function appendChunk(current: string, chunk: string, maxBufferBytes: number): string {
  const next = current + chunk;
  const nextBytes = Buffer.byteLength(next);
  if (nextBytes <= maxBufferBytes) {
    return next;
  }

  let allowedBytes = Math.max(maxBufferBytes - Buffer.byteLength(current), 0);
  const buffer = Buffer.from(chunk);

  while (allowedBytes > 0 && allowedBytes < buffer.length && (buffer[allowedBytes] & 0b1100_0000) === 0b1000_0000) {
    allowedBytes -= 1;
  }

  return current + buffer.subarray(0, allowedBytes).toString("utf8");
}

export function createExec(): ExecService {
  return {
    async command(file, args = [], options = {}) {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
      const command = formatCommand(file, args);
      const startedAt = Date.now();

      return await new Promise<ExecResult>((resolve, reject) => {
        const child = spawn(file, [...args], {
          cwd: options.cwd,
          env: options.env,
          stdio: "pipe",
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let timeoutId: NodeJS.Timeout | null = null;
        let killId: NodeJS.Timeout | null = null;

        const finalize = (exitCode: number | null, signal: NodeJS.Signals | null) => {
          if (settled) {
            return;
          }
          settled = true;

          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (killId) {
            clearTimeout(killId);
          }

          const result: ExecResult = {
            command,
            exitCode,
            signal,
            stdout,
            stderr,
            timedOut,
            durationMs: Date.now() - startedAt,
          };

          if (timedOut) {
            reject(new ExecTimeoutError(`Command timed out after ${timeoutMs} ms.`, result));
            return;
          }

          resolve(result);
        };

        if (timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            if (settled) {
              return;
            }
            timedOut = true;
            child.kill("SIGTERM");
            killId = setTimeout(() => {
              if (!settled) {
                child.kill("SIGKILL");
              }
            }, DEFAULT_TIMEOUT_GRACE_MS);
          }, timeoutMs);
        }

        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");

        child.stdout?.on("data", (chunk: string) => {
          stdout = appendChunk(stdout, chunk, maxBufferBytes);
          if (options.stdout) {
            options.stdout?.(chunk);
          } else if (options.streamOutput) {
            process.stdout.write(chunk);
          }
        });

        child.stderr?.on("data", (chunk: string) => {
          stderr = appendChunk(stderr, chunk, maxBufferBytes);
          if (options.stderr) {
            options.stderr?.(chunk);
          } else if (options.streamOutput) {
            process.stderr.write(chunk);
          }
        });

        child.on("error", (error) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (killId) {
            clearTimeout(killId);
          }
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        });

        child.on("close", (exitCode, signal) => {
          finalize(exitCode, signal);
        });

        if (options.stdin !== undefined) {
          child.stdin?.end(options.stdin);
        } else {
          child.stdin?.end();
        }
      });
    },
  };
}
