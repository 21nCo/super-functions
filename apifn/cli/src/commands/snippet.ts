/**
 * `apifn snippet <spec> <path>` — generate code snippet for an endpoint (CLI-008)
 *
 * Wraps @apifn/snippets' generateSnippet / generateAllSnippets.
 * Options: --target (default: curl), --method (default: get), --all, --base-url
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseOpenAPI } from "@apifn/core";
import type { SnippetTarget, SnippetOptions, OperationObject, OpenAPIDocument } from "@apifn/core";
import { generateSnippet, generateAllSnippets, SUPPORTED_TARGETS } from "@apifn/snippets";
import type { Output } from "../utils/output.js";

export interface SnippetCommandOptions {
    /** Path to OpenAPI spec */
    specPath: string;
    /** Endpoint path (e.g. /users) */
    apiPath?: string;
    /** HTTP method (default: "get") */
    method?: string;
    /** Snippet target (default: "curl") */
    target?: string;
    /** Base URL override */
    baseUrl?: string;
    /** Generate all snippets for all endpoints */
    all?: boolean;
    cwd?: string;
    output: Output;
    writeStdout?: (text: string) => void;
}

export async function runSnippetCommand(options: SnippetCommandOptions): Promise<number> {
    const cwd = options.cwd ?? process.cwd();
    const specPath = path.resolve(cwd, options.specPath);
    const write = options.writeStdout ?? ((t: string) => process.stdout.write(t));
    const target = (options.target ?? "curl") as SnippetTarget;
    const method = (options.method ?? "get").toLowerCase();

    // Validate target
    if (!SUPPORTED_TARGETS.includes(target)) {
        options.output.error(`Unsupported target '${target}'. Supported: ${SUPPORTED_TARGETS.join(", ")}`);
        return 1;
    }

    // Load spec
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

    const baseUrl = options.baseUrl
        ?? (spec as OpenAPIDocument).servers?.[0]?.url
        ?? "https://api.example.com";

    const snippetOpts: SnippetOptions = {
        target,
        baseUrl,
        indent: 2,
    };

    // --all: generate snippets for every operation
    if (options.all) {
        const result = generateAllSnippets(spec as OpenAPIDocument, snippetOpts);
        if (result.snippets.length === 0) {
            options.output.info("No operations found in spec.");
            return 0;
        }
        for (const snippet of result.snippets) {
            write(`\n# ${snippet.method.toUpperCase()} ${snippet.path}\n`);
            if (snippet.operationId) write(`# ${snippet.operationId}\n`);
            write(snippet.code);
            write("\n");
        }
        return 0;
    }

    // Single operation
    const apiPath = options.apiPath;
    if (!apiPath) {
        options.output.error("Specify a path, e.g. apifn snippet spec.yml /users, or use --all");
        return 1;
    }

    const specDoc = spec as OpenAPIDocument;
    const pathItem = (specDoc.paths ?? {})[apiPath];

    if (!pathItem) {
        options.output.error(`Path '${apiPath}' not found in spec. Available paths: ${Object.keys(specDoc.paths ?? {}).join(", ")}`);
        return 1;
    }

    const operation = (pathItem as Record<string, OperationObject | undefined>)[method];
    if (!operation) {
        options.output.error(`Method '${method.toUpperCase()}' not found for path '${apiPath}'`);
        return 1;
    }

    const code = generateSnippet(operation, apiPath, method, snippetOpts);
    write(code);
    write("\n");

    return 0;
}
