/**
 * fetch (browser/Node) snippet target — SNIP-002
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generateFetch(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const ind = ctx.indent;
    const lines: string[] = [];

    lines.push(`const response = await fetch('${ctx.url}', {`);
    lines.push(`${ind}method: '${method.toUpperCase()}',`);

    const allHeaders = { ...ctx.headers };
    if (ctx.body) allHeaders["Content-Type"] = "application/json";

    if (Object.keys(allHeaders).length > 0) {
        lines.push(`${ind}headers: {`);
        for (const [k, v] of Object.entries(allHeaders)) {
            lines.push(`${ind}${ind}'${k}': '${v}',`);
        }
        lines.push(`${ind}},`);
    }

    if (ctx.body) {
        lines.push(`${ind}body: JSON.stringify(${ctx.body}),`);
    }

    lines.push("});");
    lines.push("");
    lines.push("const data = await response.json();");
    lines.push("console.log(data);");

    return lines.join("\n");
}
