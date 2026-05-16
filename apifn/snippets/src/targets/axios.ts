/**
 * axios snippet target — SNIP-003
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generateAxios(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const ind = ctx.indent;
    const m = method.toLowerCase();
    const lines: string[] = [];

    lines.push(`import axios from 'axios';`);
    lines.push("");

    const allHeaders = { ...ctx.headers };
    const hasHeaders = Object.keys(allHeaders).length > 0;

    const useConfig = hasHeaders;

    if (m === "get" || m === "delete" || m === "head" || m === "options") {
        if (useConfig) {
            lines.push(`const response = await axios.${m}('${ctx.url}', {`);
            lines.push(`${ind}headers: {`);
            for (const [k, v] of Object.entries(allHeaders)) {
                lines.push(`${ind}${ind}'${k}': '${v}',`);
            }
            lines.push(`${ind}},`);
            lines.push(`});`);
        } else {
            lines.push(`const response = await axios.${m}('${ctx.url}');`);
        }
    } else {
        // POST / PUT / PATCH
        const bodyArg = ctx.body ? ctx.body : "{}";
        if (useConfig) {
            lines.push(`const response = await axios.${m}('${ctx.url}', ${bodyArg}, {`);
            lines.push(`${ind}headers: {`);
            for (const [k, v] of Object.entries(allHeaders)) {
                lines.push(`${ind}${ind}'${k}': '${v}',`);
            }
            lines.push(`${ind}},`);
            lines.push(`});`);
        } else {
            lines.push(`const response = await axios.${m}('${ctx.url}', ${bodyArg});`);
        }
    }

    lines.push("");
    lines.push("console.log(response.data);");

    return lines.join("\n");
}
