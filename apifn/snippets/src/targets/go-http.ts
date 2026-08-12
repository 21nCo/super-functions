/**
 * Go net/http snippet target
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generateGoHttp(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const ind = ctx.indent;
    const m = method.toUpperCase();
    const lines: string[] = [];

    lines.push("package main");
    lines.push("");
    lines.push("import (");
    lines.push(`${ind}"fmt"`);
    lines.push(`${ind}"io"`);
    lines.push(`${ind}"net/http"`);
    if (ctx.body) lines.push(`${ind}"strings"`);
    lines.push(")");
    lines.push("");
    lines.push("func main() {");

    if (ctx.body) {
        const escaped = ctx.body.replace(/`/g, "` + \"`\" + `");
        lines.push(`${ind}body := strings.NewReader(\`${escaped}\`)`);
        lines.push(`${ind}req, _ := http.NewRequest("${m}", "${ctx.url}", body)`);
    } else {
        lines.push(`${ind}req, _ := http.NewRequest("${m}", "${ctx.url}", nil)`);
    }

    const allHeaders = { ...ctx.headers };
    if (ctx.body) allHeaders["Content-Type"] = "application/json";

    for (const [k, v] of Object.entries(allHeaders)) {
        lines.push(`${ind}req.Header.Set("${k}", "${v}")`);
    }

    lines.push("");
    lines.push(`${ind}client := &http.Client{}`);
    lines.push(`${ind}resp, err := client.Do(req)`);
    lines.push(`${ind}if err != nil {`);
    lines.push(`${ind}${ind}panic(err)`);
    lines.push(`${ind}}`);
    lines.push(`${ind}defer resp.Body.Close()`);
    lines.push("");
    lines.push(`${ind}data, _ := io.ReadAll(resp.Body)`);
    lines.push(`${ind}fmt.Println(string(data))`);
    lines.push("}");

    return lines.join("\n");
}
