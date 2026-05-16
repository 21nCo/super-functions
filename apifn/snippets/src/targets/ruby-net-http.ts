/**
 * Ruby Net::HTTP snippet target
 */

import type { OperationObject, SnippetOptions } from "@apifn/core";
import { buildContext } from "../context.js";

export function generateRubyNetHttp(
    operation: OperationObject,
    apiPath: string,
    method: string,
    options: SnippetOptions
): string {
    const ctx = buildContext(operation, apiPath, method, options);
    const m = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
    const lines: string[] = [];

    lines.push("require 'net/http'");
    lines.push("require 'json'");
    lines.push("");
    lines.push(`uri = URI('${ctx.url}')`);
    lines.push(`http = Net::HTTP.new(uri.host, uri.port)`);
    lines.push("http.use_ssl = uri.scheme == 'https'");
    lines.push("");
    lines.push(`request = Net::HTTP::${m}.new(uri)`);

    const allHeaders = { ...ctx.headers };
    if (ctx.body) allHeaders["Content-Type"] = "application/json";

    for (const [k, v] of Object.entries(allHeaders)) {
        lines.push(`request['${k}'] = '${v}'`);
    }

    if (ctx.body) {
        lines.push(`request.body = ${ctx.body}.to_json`);
    }

    lines.push("");
    lines.push("response = http.request(request)");
    lines.push("puts JSON.parse(response.body)");

    return lines.join("\n");
}
