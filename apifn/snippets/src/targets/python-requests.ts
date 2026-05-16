/**
 * Python requests snippet target — SNIP-004
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generatePythonRequests(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const ind = ctx.indent;
    const m = method.toLowerCase();
    const lines: string[] = [];

    lines.push("import requests");
    lines.push("");

    const allHeaders = { ...ctx.headers };
    const hasHeaders = Object.keys(allHeaders).length > 0;

    if (hasHeaders) {
        lines.push("headers = {");
        for (const [k, v] of Object.entries(allHeaders)) {
            lines.push(`${ind}'${k}': '${v}',`);
        }
        lines.push("}");
        lines.push("");
    }

    let callArgs = `'${ctx.url}'`;
    if (hasHeaders) callArgs += ", headers=headers";
    if (ctx.body) callArgs += `, json=${ctx.body}`;

    lines.push(`response = requests.${m}(${callArgs})`);
    lines.push("");
    lines.push("print(response.json())");

    return lines.join("\n");
}
