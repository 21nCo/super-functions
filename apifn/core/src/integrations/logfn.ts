import type { LogFnClient } from "../types.js";

// Duck-typed interfaces to avoid circular dependency with @apifn/collections
export interface LogfnCollectionItem {
    name: string;
    path: string;
    [key: string]: any;
}

export interface LogfnCollection {
    info: { name: string;[key: string]: any };
    [key: string]: any;
}

export interface LogfnRunOptions {
    environment: string | { name: string;[key: string]: any };
    [key: string]: any;
}

export interface LogfnRequestResult {
    name: string;
    method: string;
    url: string;
    status: "passed" | "failed" | "skipped" | "error";
    duration: number;
    assertions: Array<{ passed: boolean;[key: string]: any }>;
    error?: string;
    [key: string]: any;
}

export interface LogfnRunReport {
    duration: number;
    summary: { total: number; passed: number;[key: string]: any };
    [key: string]: any;
}

export interface LogfnRunReporter {
    onStart?(collection: LogfnCollection, options: LogfnRunOptions): void;
    onRequestStart?(item: LogfnCollectionItem): void;
    onRequestComplete?(result: LogfnRequestResult): void;
    onComplete?(report: LogfnRunReport): void;
}


/**
 * Creates a RunReporter that logs collection run events via logfn (LOG-001).
 *
 * @param logfn The configured logfn client
 */
export function logfnReporter(logfn: LogFnClient): LogfnRunReporter {
    return {
        onStart(collection: LogfnCollection, options: LogfnRunOptions) {
            logfn.info("collection_run_start", {
                collection: collection.info.name,
                environment:
                    typeof options.environment === "string"
                        ? options.environment
                        : options.environment.name,
            });
        },
        onRequestStart(item: LogfnCollectionItem) {
            logfn.debug("collection_request_start", {
                name: item.name,
                path: item.path,
            });
        },
        onRequestComplete(result: LogfnRequestResult) {
            // Use child() for per-request context
            const ctx = logfn.child({
                request_name: result.name,
                method: result.method,
                url: result.url,
                duration_ms: result.duration,
            });

            if (result.status === "passed") {
                ctx.info("collection_request_complete", { status: "passed" });
            } else if (result.status === "failed") {
                ctx.error("collection_request_complete", "Request failed assertions", {
                    status: "failed",
                    failed_assertions: result.assertions.filter((a: any) => !a.passed),
                });
            } else if (result.status === "error") {
                ctx.error("collection_request_complete", result.error ?? "Unknown error", {
                    status: "error",
                });
            } else {
                ctx.info("collection_request_complete", { status: result.status });
            }
        },
        onComplete(report: LogfnRunReport) {
            logfn.info("collection_run_complete", {
                duration_ms: report.duration,
                summary: report.summary,
            });
        },
    };
}

export interface CliLoggerOptions {
    level?: "debug" | "info" | "warn" | "error";
    logfn?: LogFnClient;
}

/**
 * CLI logging integration (LOG-002)
 *
 * Provides structured logging using logfn when available, falling back
 * to a simple console logger that respects the chosen log level.
 */
export function createCliLogger(options: CliLoggerOptions = {}): LogFnClient {
    const { level = "info", logfn } = options;

    if (logfn) {
        return logfn;
    }

    // Fallback console logger
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[level] ?? 1;

    function shouldLog(l: keyof typeof levels) {
        return levels[l] >= currentLevel;
    }

    return {
        info(eventType: string, payload?: unknown) {
            if (shouldLog("info")) console.info(`[INFO] ${eventType}`, payload ?? "");
        },
        warn(eventType: string, payload?: unknown) {
            if (shouldLog("warn")) console.warn(`[WARN] ${eventType}`, payload ?? "");
        },
        error(eventType: string, err: Error | string, payload?: unknown) {
            if (shouldLog("error")) console.error(`[ERROR] ${eventType}`, err, payload ?? "");
        },
        debug(eventType: string, payload?: unknown) {
            if (shouldLog("debug")) console.debug(`[DEBUG] ${eventType}`, payload ?? "");
        },
        child(context: Record<string, unknown>) {
            // Very basic child support for the fallback
            return {
                ...this,
                info: (e: string, p?: any) => this.info(e, { ...context, ...p }),
                warn: (e: string, p?: any) => this.warn(e, { ...context, ...p }),
                error: (event: string, err: Error | string, p?: any) =>
                    this.error(event, err, { ...context, ...p }),
                debug: (e: string, p?: any) => this.debug(e, { ...context, ...p }),
            };
        },
    };
}
