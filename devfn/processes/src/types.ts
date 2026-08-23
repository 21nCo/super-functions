import type { ProcessSpec } from "@devfn/config";

export interface ManagedProcess {
  name: string;
  pid: number;
  birthSignature?: string;
  command: string[];
  cwd: string;
  logPath: string;
  startedAt: string;
  readyAt?: string;
}

export interface StartProcessInput {
  name: string;
  spec: ProcessSpec;
  root: string;
  runtimeDir: string;
  environment?: Record<string, string>;
  ports?: Record<string, number>;
  onStarted?: (process: ManagedProcess) => Promise<void>;
}

export class ProcessError extends Error {
  public constructor(
    public readonly code: "DEVFN_PROCESS_START_FAILED" | "DEVFN_PROCESS_NOT_READY" | "DEVFN_PROCESS_OWNERSHIP_MISMATCH" | "DEVFN_PROCESS_STOP_FAILED",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProcessError";
  }
}
