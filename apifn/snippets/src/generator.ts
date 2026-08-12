/**
 * Snippet generator — SNIP-001 through SNIP-007
 *
 * `generateSnippet(operation, path, method, options)` — single endpoint
 * `generateAllSnippets(spec, options)` — all endpoints in a spec
 */

import type { OperationObject, OpenAPIDocument, SnippetTarget, SnippetOptions } from "@apifn/core";
import type { AllSnippetsResult, OperationSnippet } from "./types.js";

import { generateCurl } from "./targets/curl.js";
import { generateFetch } from "./targets/fetch.js";
import { generateAxios } from "./targets/axios.js";
import { generatePythonRequests } from "./targets/python-requests.js";
import { generatePythonHttpx } from "./targets/python-httpx.js";
import { generateNodeFetch } from "./targets/node-fetch.js";
import { generateGoHttp } from "./targets/go-http.js";
import { generateRubyNetHttp } from "./targets/ruby-net-http.js";
import { generatePhpCurl } from "./targets/php-curl.js";
import { generateCsharpHttpclient } from "./targets/csharp-httpclient.js";
import { generateJavaOkhttp } from "./targets/java-okhttp.js";

/** All supported snippet targets */
export const SUPPORTED_TARGETS: SnippetTarget[] = [
    "curl",
    "fetch",
    "axios",
    "node-fetch",
    "python-requests",
    "python-httpx",
    "go-http",
    "ruby-net-http",
    "php-curl",
    "csharp-httpclient",
    "java-okhttp",
];

type TargetFn = (op: OperationObject, path: string, method: string, opts: SnippetOptions) => string;

const TARGET_MAP: Record<SnippetTarget, TargetFn> = {
    "curl": generateCurl,
    "fetch": generateFetch,
    "axios": generateAxios,
    "node-fetch": generateNodeFetch,
    "python-requests": generatePythonRequests,
    "python-httpx": generatePythonHttpx,
    "go-http": generateGoHttp,
    "ruby-net-http": generateRubyNetHttp,
    "php-curl": generatePhpCurl,
    "csharp-httpclient": generateCsharpHttpclient,
    "java-okhttp": generateJavaOkhttp,
};

/**
 * Generate a code snippet for a single operation.
 *
 * @param operation — The OpenAPI OperationObject
 * @param apiPath   — The path string (e.g. "/users/{id}")
 * @param method    — HTTP method (e.g. "get")
 * @param options   — Snippet options (target, baseUrl, auth, indent)
 * @returns The generated code string
 */
export function generateSnippet(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const gen = TARGET_MAP[options.target];
    if (!gen) {
        throw new Error(`Unsupported snippet target: ${options.target}`);
    }
    return gen(operation, apiPath, method, options);
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

/**
 * Generate snippets for all operations in an OpenAPI document.
 *
 * @param spec    — OpenAPI document
 * @param options — Snippet options (target, baseUrl, auth, indent)
 * @returns AllSnippetsResult containing one snippet per operation
 */
export function generateAllSnippets(
    spec: OpenAPIDocument,
    options: SnippetOptions
): AllSnippetsResult {
    const snippets: OperationSnippet[] = [];

    const paths = spec.paths ?? {};
    for (const [apiPath, pathItem] of Object.entries(paths)) {
        if (!pathItem) continue;

        for (const method of HTTP_METHODS) {
            const operation = pathItem[method] as OperationObject | undefined;
            if (!operation) continue;

            const code = generateSnippet(operation, apiPath, method, options);
            snippets.push({
                path: apiPath,
                method,
                operationId: operation.operationId,
                target: options.target,
                code,
            });
        }
    }

    return { snippets };
}
