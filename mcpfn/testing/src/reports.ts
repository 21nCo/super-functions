import { redactOAuthValue } from "@superfunctions/oauth-core";

import { classifyMcpFnFailure, type McpFnProtocolLayer } from "./host-authorization.js";
import type { McpFnScenarioReport, McpFnScenarioResult } from "./scenarios.js";
import type { McpFnTargetSuiteReport } from "./suite.js";

export interface McpFnLayeredScenarioResult extends McpFnScenarioResult {
  layer?: McpFnProtocolLayer;
}

export interface McpFnJUnitReportOptions {
  name: string;
  results: Array<{
    name: string;
    status: "passed" | "failed" | "incomplete";
    error?: string;
    layer?: McpFnProtocolLayer;
    durationMs?: number;
  }>;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function annotateScenarioResultLayer(
  result: McpFnScenarioResult,
): McpFnLayeredScenarioResult {
  if (result.status === "passed" || !result.error) return result;
  return { ...result, layer: classifyMcpFnFailure(new Error(result.error)) };
}

export function annotateScenarioReportLayers(
  report: McpFnScenarioReport,
): McpFnScenarioReport & { results: McpFnLayeredScenarioResult[] } {
  return {
    ...report,
    results: report.results.map(annotateScenarioResultLayer),
  };
}

export function annotateTargetSuiteReportLayers(
  report: McpFnTargetSuiteReport,
): McpFnTargetSuiteReport & { results: McpFnLayeredScenarioResult[] } {
  return {
    ...report,
    results: report.results.map(annotateScenarioResultLayer),
  };
}

/** Bounded JUnit XML for CI. Names and messages are redacted before serialization. */
export function createMcpFnJUnitXml(options: McpFnJUnitReportOptions): string {
  const results = options.results.map((result) => {
    const redacted = redactOAuthValue(result) as typeof result;
    return {
      ...redacted,
      name: String(redacted.name),
      error: redacted.error ? String(redacted.error) : undefined,
    };
  });
  const failures = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "incomplete").length;
  const cases = results.map((result) => {
    const classname = result.layer ?? "mcpfn";
    const time = ((result.durationMs ?? 0) / 1_000).toFixed(3);
    const name = xmlEscape(result.name);
    if (result.status === "passed") {
      return `    <testcase classname="${xmlEscape(classname)}" name="${name}" time="${time}"/>`;
    }
    if (result.status === "incomplete") {
      return `    <testcase classname="${xmlEscape(classname)}" name="${name}" time="${time}">\n      <skipped message="${xmlEscape(result.error ?? "incomplete")}"/>\n    </testcase>`;
    }
    return `    <testcase classname="${xmlEscape(classname)}" name="${name}" time="${time}">\n      <failure message="${xmlEscape(result.error ?? "failed")}" type="${xmlEscape(classname)}">${xmlEscape(result.error ?? "failed")}</failure>\n    </testcase>`;
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="${xmlEscape(options.name)}" tests="${results.length}" failures="${failures}" skipped="${skipped}">`,
    ...cases,
    `</testsuite>`,
    "",
  ].join("\n");
}
