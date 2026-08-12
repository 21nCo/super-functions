/**
 * `apifn diff <before> <after>` command implementation.
 *
 * Loads two OpenAPI documents (file paths or HTTP URLs), runs diffOpenAPI(),
 * and prints the result in human-readable or JSON format.
 *
 * Exit codes (CLI-005, CI-002, CI-003):
 *   0 — no breaking changes (or --fail-on-breaking false)
 *   1 — breaking changes detected
 *   2 — error (file not found, invalid spec, etc.)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseOpenAPI, diffOpenAPI, formatDiffAsJson, formatDiffAsText } from "@apifn/core";
import type { Output } from "../utils/output.js";

export type DiffFormat = "text" | "json";

export interface DiffCommandOptions {
    /** Path or URL to the "before" spec */
    before: string;
    /** Path or URL to the "after" spec */
    after: string;
    /** Output format: "text" (default) or "json" */
    format?: DiffFormat;
    /** Whether to exit 1 on breaking changes (default: true) */
    failOnBreaking?: boolean;
    /** Current working directory */
    cwd?: string;
    /** Output helper for errors */
    output: Output;
    /** Custom stdout write function */
    writeStdout?: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Spec loading — file path or HTTP URL
// ---------------------------------------------------------------------------

async function loadSpec(specRef: string, cwd: string): Promise<string> {
    if (/^https?:\/\//i.test(specRef)) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        let res: Response;
        try {
            res = await fetch(specRef, { signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${specRef}`);
        }
        return res.text();
    }

    const resolved = path.resolve(cwd, specRef);
    return readFile(resolved, "utf8");
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Runs the `apifn diff` command.
 *
 * @returns exit code: 0 (no breaking), 1 (breaking), 2 (error)
 */
export async function runDiffCommand(options: DiffCommandOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd();
    const failOnBreaking = options.failOnBreaking !== false; // default true
    const format: DiffFormat = options.format ?? "text";
    const write = options.writeStdout ?? ((text: string) => process.stdout.write(text));

    // Load both specs
    let beforeRaw: string;
    let afterRaw: string;

    try {
        beforeRaw = await loadSpec(options.before, cwd);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Failed to load before-spec '${options.before}': ${message}`);
        return 2;
    }

    try {
        afterRaw = await loadSpec(options.after, cwd);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Failed to load after-spec '${options.after}': ${message}`);
        return 2;
    }

    // Parse specs
    let beforeDoc;
    let afterDoc;

    try {
        beforeDoc = parseOpenAPI(beforeRaw);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Failed to parse before-spec: ${message}`);
        return 2;
    }

    try {
        afterDoc = parseOpenAPI(afterRaw);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Failed to parse after-spec: ${message}`);
        return 2;
    }

    // Compute diff
    const result = diffOpenAPI(beforeDoc, afterDoc);

    // Output
    if (format === "json") {
        const json = formatDiffAsJson(result, new Date().toISOString());
        write(JSON.stringify(json, null, 2));
        write("\n");
    } else {
        const useColor = true; // color is handled by the CLI global --no-color
        let pc: {
            red: (s: string) => string;
            green: (s: string) => string;
            yellow: (s: string) => string;
            bold: (s: string) => string;
            dim: (s: string) => string;
        };
        try {
            // Dynamic import so it's testable without color
            const picocolors = await import("picocolors");
            const p = picocolors.default ?? picocolors;
            pc = {
                red: (s) => (useColor ? p.red(s) : s),
                green: (s) => (useColor ? p.green(s) : s),
                yellow: (s) => (useColor ? p.yellow(s) : s),
                bold: (s) => (useColor ? p.bold(s) : s),
                dim: (s) => (useColor ? p.dim(s) : s),
            };
        } catch {
            pc = {
                red: (s) => s,
                green: (s) => s,
                yellow: (s) => s,
                bold: (s) => s,
                dim: (s) => s,
            };
        }
        const text = formatDiffAsText(result, pc);
        write(text);
        write("\n");
    }

    // Exit code
    if (result.hasBreakingChanges && failOnBreaking) {
        return 1;
    }

    return 0;
}
