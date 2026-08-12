import type { RunReport, RunReporter } from "../../types.js";

export interface JUnitReporterOptions {
  write?: (text: string) => void;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function reportToJUnitXml(report: RunReport): string {
  const failures = report.summary.failed;
  const errors = report.summary.errors;
  const cases = report.results.map((result) => {
    const time = (result.duration / 1000).toFixed(3);
    const name = escapeXml(result.name);
    const classname = escapeXml(result.path);

    if (result.status === "skipped") {
      return `    <testcase classname="${classname}" name="${name}" time="${time}"><skipped /></testcase>`;
    }

    if (result.status === "failed" || result.status === "error") {
      const message = escapeXml(result.error ?? `${result.method} ${result.statusCode ?? ""}`);
      const details = escapeXml(JSON.stringify({
        request: result.request,
        response: result.response,
        assertions: result.assertions,
        attempts: result.attempts,
      }, null, 2));
      const tag = result.status === "error" ? "error" : "failure";
      return [
        `    <testcase classname="${classname}" name="${name}" time="${time}">`,
        `      <${tag} message="${message}">${details}</${tag}>`,
        "    </testcase>",
      ].join("\n");
    }

    return `    <testcase classname="${classname}" name="${name}" time="${time}" />`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(report.collectionName)}" tests="${report.summary.total}" failures="${failures}" errors="${errors}" skipped="${report.summary.skipped}" time="${(report.summary.duration / 1000).toFixed(3)}">`,
    ...cases,
    "</testsuite>",
    "",
  ].join("\n");
}

export function createJUnitReporter(options: JUnitReporterOptions = {}): RunReporter {
  const write = options.write ?? ((text: string) => process.stdout.write(text));

  return {
    onComplete(report): void {
      write(reportToJUnitXml(report));
    },
  };
}
