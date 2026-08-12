/**
 * curl snippet target — SNIP-001
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generateCurl(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const ind = ctx.indent;
    const lines: string[] = [];

    lines.push(`curl -X ${method.toUpperCase()} '${ctx.url}'`);

    for (const [key, value] of Object.entries(ctx.headers)) {
        lines.push(`${ind}-H '${key}: ${value}'`);
    }

    if (ctx.body) {
        lines.push(`${ind}-H 'Content-Type: application/json'`);
        lines.push(`${ind}-d '${ctx.body.replace(/'/g, "'\\''")}'`);
    }

    return lines.join(" \\\n");
}
