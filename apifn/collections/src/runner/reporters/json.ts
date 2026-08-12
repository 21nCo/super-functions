/**
 * JSON reporter — serializes the full RunReport to stdout as JSON.
 * Intended for machine-readable / CI integration usage.
 */

import type { RunReport, RunReporter } from "../../types.js";

export interface JsonReporterOptions {
    /** Custom write function (default: process.stdout.write) */
    write?: (text: string) => void;
    /** JSON indentation spaces (default: 2) */
    indent?: number;
}

export function createJsonReporter(options: JsonReporterOptions = {}): RunReporter {
    const write = options.write ?? ((text: string) => process.stdout.write(text));
    const indent = options.indent ?? 2;

    return {
        onComplete(report: RunReport): void {
            write(JSON.stringify(report, null, indent));
            write("\n");
        },
    };
}
