/**
 * Context builder — shared by all snippet targets.
 * Resolves URL, headers, and body from the operation and options.
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import type { SnippetContext } from "./types.js";

const SPACES: Record<number, string> = {};
function getIndent(n: number): string {
    if (!SPACES[n]) SPACES[n] = " ".repeat(n);
    return SPACES[n];
}

/** Build auth headers from SnippetOptions.auth */
function authHeaders(auth: SnippetOptions["auth"]): Record<string, string> {
    if (!auth) return {};
    const headers: Record<string, string> = {};

    if (auth.type === "bearer") {
        headers["Authorization"] = `Bearer ${auth.token ?? "YOUR_BEARER_TOKEN"}`;
    } else if (auth.type === "apikey") {
        const keyName = (auth as { keyName?: string }).keyName ?? "X-API-Key";
        const keyIn = (auth as { keyIn?: string }).keyIn ?? "header";
        if (keyIn === "header") {
            headers[keyName] = auth.key ?? "YOUR_API_KEY";
        }
        // query key is handled at URL level (not in headers, but we skip for simplicity)
    } else if (auth.type === "basic") {
        const user = (auth as { username?: string }).username ?? "user";
        const pass = (auth as { password?: string }).password ?? "pass";
        const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
    }

    return headers;
}

/** Resolve path parameters from the operation's first path parameter example or placeholder */
function resolvePathParams(apiPath: string, operation: OperationObject): string {
    let resolved = apiPath;
    const params = (operation.parameters ?? []) as Array<{ name: string; in: string; example?: unknown; schema?: { example?: unknown } }>;
    for (const param of params) {
        if (param.in !== "path") continue;
        const example = param.example ?? param.schema?.example ?? `{${param.name}}`;
        resolved = resolved.replace(`{${param.name}}`, String(example));
    }
    return resolved;
}

/** Pick example body from requestBody if available */
function resolveBody(operation: OperationObject): string | undefined {
    const rb = operation.requestBody;
    if (!rb || (rb as { $ref?: string }).$ref) return undefined;
    const reqBody = rb as { content?: Record<string, { example?: unknown; schema?: { example?: unknown; properties?: Record<string, unknown> } }> };
    const json = reqBody.content?.["application/json"];
    if (!json) return undefined;

    if (json.example !== undefined) return JSON.stringify(json.example);
    if (json.schema?.example !== undefined) return JSON.stringify(json.schema.example);

    // Build a minimal example from schema properties
    if (json.schema?.properties) {
        const example: Record<string, unknown> = {};
        for (const [key, propVal] of Object.entries(json.schema.properties)) {
            const prop = propVal as { type?: string; example?: unknown };
            if (prop.example !== undefined) {
                example[key] = prop.example;
            } else {
                example[key] = prop.type === "integer" || prop.type === "number" ? 0
                    : prop.type === "boolean" ? true
                        : `<${key}>`;
            }
        }
        return JSON.stringify(example);
    }

    return undefined;
}

export function buildContext(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): SnippetContext {
    const indent = getIndent(options.indent ?? 2);

    // Build base URL
    const base = options.baseUrl.replace(/\/$/, "");
    const resolvedPath = resolvePathParams(apiPath, operation);
    const url = `${base}${resolvedPath}`;

    // Build headers
    const headers: Record<string, string> = {};
    Object.assign(headers, authHeaders(options.auth));

    // Body
    const body = resolveBody(operation);

    return { method, url, headers, body, indent };
}
