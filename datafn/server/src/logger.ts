/**
 * Pluggable logger interface and default implementation.
 * LOG-001 / Decision #14
 */

export interface DatafnLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Create the default console-based logger.
 *
 * - `debug: true`  → pretty-print: `[LEVEL] msg {context}`
 * - `debug: false` → JSON: `{"level":"info","msg":"...","ts":...,...ctx}`
 */
export function createDefaultLogger(debug: boolean): DatafnLogger {
  if (debug) {
    return {
      info: (msg, ctx) =>
        console.log(`[INFO] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`),
      warn: (msg, ctx) =>
        console.warn(`[WARN] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`),
      error: (msg, ctx) =>
        console.error(`[ERROR] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`),
      debug: (msg, ctx) =>
        console.log(`[DEBUG] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`),
    };
  }

  return {
    info: (msg, ctx) =>
      console.log(JSON.stringify({ ...(ctx ?? {}), level: "info", msg, ts: Date.now() })),
    warn: (msg, ctx) =>
      console.warn(JSON.stringify({ ...(ctx ?? {}), level: "warn", msg, ts: Date.now() })),
    error: (msg, ctx) =>
      console.error(JSON.stringify({ ...(ctx ?? {}), level: "error", msg, ts: Date.now() })),
    debug: () => {},
  };
}

/** No-op logger for tests or silent operation. */
export const noopLogger: DatafnLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
