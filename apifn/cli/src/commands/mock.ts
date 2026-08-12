/**
 * `apifn mock [spec]` — start mock server from an OpenAPI spec (CLI-007)
 *
 * Wraps @apifn/mock's createMockServer.
 * Options: --mode, --port, --validate-requests, --delay
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseOpenAPI } from "@apifn/core";
import { createMockServer } from "@apifn/mock";
import type { Output } from "../utils/output.js";

export type MockMode = "schema" | "examples" | "random";

export interface MockCommandOptions {
    /** Path to OpenAPI spec */
    specPath: string;
    /** Response mode (default: "schema") */
    mode?: MockMode;
    /** Port (default: 4010) */
    port?: number;
    /** Enable request validation */
    validateRequests?: boolean;
    /** Delay in ms */
    delay?: number;
    /** CORS (default: true) */
    cors?: boolean;
    cwd?: string;
    output: Output;
}

export async function runMockCommand(options: MockCommandOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd();
    const specPath = path.resolve(cwd, options.specPath);
    const port = options.port ?? 4010;

    let raw: string;
    try {
        raw = await readFile(specPath, "utf8");
    } catch {
        options.output.error(`Could not read spec: ${specPath}`);
        return 2;
    }

    let spec: ReturnType<typeof parseOpenAPI>;
    try {
        spec = parseOpenAPI(raw);
    } catch (err) {
        options.output.error(`Failed to parse spec: ${err instanceof Error ? err.message : String(err)}`);
        return 2;
    }

    const mock = createMockServer({
        spec,
        port,
        responseMode: options.mode ?? "schema",
        validateRequests: options.validateRequests ?? false,
        delay: options.delay ?? 0,
        cors: options.cors !== false,
    });

    try {
        await mock.start();
    } catch (err) {
        options.output.error(`Failed to start mock server: ${err instanceof Error ? err.message : String(err)}`);
        return 2;
    }

    options.output.success(`Mock server running at http://localhost:${mock.port}`);
    options.output.info(`Spec: ${specPath}`);
    options.output.info(`Mode: ${options.mode ?? "schema"}`);
    if (options.validateRequests) options.output.info("Request validation: enabled");
    if (options.delay) options.output.info(`Delay: ${options.delay}ms`);
    options.output.info("Press Ctrl+C to stop");

    return new Promise((resolve) => {
        const cleanup = async () => {
            process.off("SIGINT", cleanup);
            process.off("SIGTERM", cleanup);
            await mock.stop();
            resolve(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
    });
}
