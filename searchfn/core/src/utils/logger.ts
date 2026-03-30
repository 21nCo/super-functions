import type { StorageLogger } from "../types";

export const defaultLogger: StorageLogger = {
  debug(message: string, context?: Record<string, unknown>) {
    const isTestEnv =
      typeof process !== "undefined" && typeof process.env !== "undefined"
        ? process.env.NODE_ENV === "test"
        : false;
    if (isTestEnv) return;
    console.debug(`[searchfn] ${message}`, context ?? {});
  },
  info(message: string, context?: Record<string, unknown>) {
    console.info(`[searchfn] ${message}`, context ?? {});
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(`[searchfn] ${message}`, context ?? {});
  },
  error(message: string, context?: Record<string, unknown>) {
    console.error(`[searchfn] ${message}`, context ?? {});
  }
};

export function createSilentLogger(): StorageLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
