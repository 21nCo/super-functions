/**
 * `apifn test` command implementation.
 *
 * Loads a collection directory, resolves environment, runs the collection
 * through runCollection(), and reports results via a configurable reporter.
 *
 * Exit codes (CLI-011):
 *   0 — all tests passed
 *   1 — one or more test failures
 *   2 — error (invalid collection, missing env, etc.)
 */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
    readCollection,
    runCollection,
    createConsoleReporter,
    createJsonReporter,
    createJUnitReporter,
    createSilentReporter,
    loadDotEnvFile,
    reportToJUnitXml,
} from "@apifn/collections";
import type { RunReporter } from "@apifn/collections";
import type { Output } from "../utils/output.js";

export type ReporterName = "console" | "json" | "junit" | "silent";

export interface TestCommandOptions {
    /** Directory containing the OpenCollection (default: cwd) */
    collectionDir?: string;
    /** Environment name to use */
    env?: string;
    /** Stop on first failure */
    bail?: boolean;
    /** Run requests in parallel */
    parallel?: boolean;
    /** Max concurrent requests when parallel=true */
    concurrency?: number;
    /** Per-request timeout in ms */
    timeout?: number;
    /** Only run requests matching these paths/patterns */
    include?: string[];
    /** Skip requests matching these paths/patterns */
    exclude?: string[];
    /** Retry failed requests */
    retries?: number;
    /** Delay between sequential requests in ms */
    delay?: number;
    /** Environment variable overrides */
    envVar?: string[];
    /** Dotenv file to load as overrides */
    dotenv?: string;
    /** Headers to redact */
    redactHeader?: string[];
    /** Write machine-readable report to this file */
    outputPath?: string;
    /** Reporter type */
    reporter?: ReporterName;
    /** Whether color output is enabled */
    color?: boolean;
    /** Current working directory */
    cwd?: string;
    /** Output helper (used for error messages) */
    output: Output;
    /** Custom stdout write function for reporter output (default: process.stdout.write) */
    writeStdout?: (text: string) => void;
}

/**
 * Runs the `apifn test` command.
 *
 * @returns exit code: 0 (pass), 1 (failures), 2 (error)
 */
export async function runTestCommand(options: TestCommandOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd();
    const collectionDir = options.collectionDir
        ? path.resolve(cwd, options.collectionDir)
        : cwd;

    const reporterName: ReporterName = options.reporter ?? "console";
    const stdoutWrite = options.writeStdout ?? ((text: string) => process.stdout.write(text));

    let reporter: RunReporter;
    if (reporterName === "json") {
        reporter = createJsonReporter({ write: stdoutWrite });
    } else if (reporterName === "junit") {
        reporter = createJUnitReporter({ write: stdoutWrite });
    } else if (reporterName === "silent") {
        reporter = createSilentReporter();
    } else {
        reporter = createConsoleReporter({
            color: options.color ?? true,
            write: stdoutWrite,
        });
    }

    let collection;
    try {
        collection = await readCollection(collectionDir);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Failed to load collection from '${collectionDir}': ${message}`);
        return 2;
    }

    const envName = options.env ?? Object.keys(collection.environments)[0];
    if (!envName) {
        options.output.error(
            "No environment specified and collection has no environments. Use --env <name>."
        );
        return 2;
    }

    let report;
    try {
        const overrides = {
            ...loadDotEnv(options.dotenv, cwd),
            ...parseEnvVars(options.envVar ?? []),
        };

        report = await runCollection(collection, {
            environment: envName,
            bail: options.bail,
            parallel: options.parallel,
            concurrency: options.concurrency,
            timeout: options.timeout,
            include: options.include,
            exclude: options.exclude,
            retries: options.retries,
            delay: options.delay,
            overrides,
            redactHeaders: options.redactHeader,
            reporter,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.output.error(`Collection run failed: ${message}`);
        return 2;
    }

    if (options.outputPath) {
        await writeReportFile({
            outputPath: path.resolve(cwd, options.outputPath),
            reporterName,
            report,
        });
    }

    const { summary } = report;
    if (summary.failed > 0 || summary.errors > 0) {
        return 1;
    }

    return 0;
}

function loadDotEnv(dotenvPath: string | undefined, cwd: string): Record<string, string> {
    if (!dotenvPath) {
        return {};
    }
    return loadDotEnvFile(path.resolve(cwd, dotenvPath));
}

function parseEnvVars(values: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const value of values) {
        const index = value.indexOf("=");
        if (index <= 0) {
            throw new Error(`Invalid --env-var value '${value}'. Expected KEY=value.`);
        }
        result[value.slice(0, index)] = value.slice(index + 1);
    }
    return result;
}

async function writeReportFile(input: {
    outputPath: string;
    reporterName: ReporterName;
    report: Awaited<ReturnType<typeof runCollection>>;
}): Promise<void> {
    await mkdir(path.dirname(input.outputPath), { recursive: true });
    const body = input.reporterName === "junit"
        ? reportToJUnitXml(input.report)
        : `${JSON.stringify(input.report, null, 2)}\n`;
    await writeFile(input.outputPath, body, "utf8");
}
